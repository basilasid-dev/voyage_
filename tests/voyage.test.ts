import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { openDb } from "../src/lib/db/connection";
import { DESTINATIONS, ESTIMATE_DISCLAIMER, PLACES } from "../src/lib/voyage/content";
import { getDestination, getPlace, listDestinations, listPlaces } from "../src/lib/voyage/places";
import {
  createCollection, createSaved, deleteCollection, deleteSaved, getSaved, listCollections, listSaved, moveToCollection,
  renameCollection, savePlace, savedPlaceIds, updateSaved,
} from "../src/lib/voyage/saved";
import { seedVoyageContent } from "../src/lib/voyage/seed";
import {
  addActivityFromPlace, addActivityFromSaved, addCustomActivity, addExpense, createTrip, deleteTrip, getTrip, listTrips,
  moveActivity, moveActivityToDay, removeActivity, removeExpense, updateActivity, updateExpense, updateTrip,
} from "../src/lib/voyage/trips";
import { VoyageError } from "../src/lib/voyage/validate";
import { memoryDb } from "./helpers";

const A = "owner-a";
const B = "owner-b";
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof VoyageError, `expected VoyageError, got ${e}`);
    return (e as VoyageError).code;
  }
  assert.fail("expected the call to throw");
};
const voyageDb = () => {
  const db = memoryDb();
  seedVoyageContent(db);
  return db;
};
const n = (db: Database.Database, sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;
const trip = (db: Database.Database, owner = A, over: Record<string, unknown> = {}) =>
  createTrip(db, owner, { name: "Istanbul in autumn", destinationId: "istanbul", startDate: "2026-10-12", endDate: "2026-10-15", ...over });
const titles = (db: Database.Database, tripId: number, day: number, owner = A) =>
  getTrip(db, owner, tripId)!.days[day - 1].activities.map((a) => a.title);

describe("destinations and places (curated content)", () => {
  it("covers Kozhikode and Istanbul with landmark and food cards", () => {
    const db = voyageDb();
    assert.deepEqual(listDestinations(db).map((d) => d.id), ["kozhikode", "istanbul"]);
    for (const id of ["kozhikode", "istanbul"]) {
      assert.ok(listPlaces(db, id, "landmarks").length >= 3, `${id} landmarks`);
      assert.ok(listPlaces(db, id, "food").length >= 2, `${id} food`);
      assert.equal(listPlaces(db, id, "all").length, listPlaces(db, id, "landmarks").length + listPlaces(db, id, "food").length);
    }
    assert.equal(getDestination(db, "istanbul")?.country, "Türkiye");
    assert.equal(getDestination(db, "kozhikode")?.country, "India");
    assert.equal(getDestination(db, "paris"), null);
  });

  it("every place has all the details the product promises", () => {
    for (const p of PLACES) {
      assert.ok(p.name && p.category && p.area && p.description.length > 30, `${p.id} text`);
      assert.ok(Number.isInteger(p.durationMin) && p.durationMin > 0, `${p.id} duration`);
      assert.ok(p.costMin >= 0 && p.costMax >= p.costMin, `${p.id} cost range`);
      assert.ok(p.imageAlt.length > 10, `${p.id} alt text`);
      assert.ok(DESTINATIONS.some((d) => d.id === p.destinationId), `${p.id} destination`);
    }
    assert.equal(new Set(PLACES.map((p) => p.id)).size, PLACES.length);
    assert.match(ESTIMATE_DISCLAIMER, /estimates/);
  });

  it("every referenced image file exists", () => {
    const files = [...DESTINATIONS.map((d) => d.image), ...PLACES.map((p) => p.image)];
    for (const f of files) assert.ok(fs.existsSync(path.join(process.cwd(), "public", f)), `missing public${f}`);
  });

  it("costs are stored in cents and prices in Istanbul are given in euros", () => {
    const db = voyageDb();
    const hagia = getPlace(db, "hagia-sophia")!;
    assert.equal(hagia.currency, "EUR");
    assert.equal(hagia.costMaxCents, 2500);
    assert.equal(getPlace(db, "paragon-restaurant")!.currency, "INR");
    assert.equal(getPlace(db, "mananchira-square")!.costMaxCents, 0);
  });

  it("seeding is idempotent and removes places that left the content file", () => {
    const db = voyageDb();
    const count = () => n(db, "SELECT COUNT(*) AS n FROM places");
    const before = count();
    seedVoyageContent(db);
    seedVoyageContent(db);
    assert.equal(count(), before);
    db.prepare("INSERT INTO places (id, destination_id, name, category, area, description, duration_min, cost_min_cents, cost_max_cents, currency, image, image_alt) VALUES ('old','istanbul','Old','landmark','x','x',10,0,0,'EUR','/x.svg','x')").run();
    seedVoyageContent(db);
    assert.equal(count(), before);
  });

  it("the travel tables never shadow the bus tables (the bus 'trips' table keeps its shape)", () => {
    const db = voyageDb();
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    assert.deepEqual(cols("trips"), ["id", "service_id", "trip_no"]); // exactly the bus schema, as before
    assert.deepEqual(cols("trip_stops"), ["trip_id", "seq", "stop_id", "arrival_min", "departure_min"]);
    assert.ok(cols("voyage_trips").includes("owner"));
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    for (const t of ["voyage_trips", "voyage_activities", "voyage_expenses", "saved_items", "collections", "destinations", "places"]) assert.ok(tables.includes(t), t);
  });

  it("does not touch the bus service's data", () => {
    const db = openDb(":memory:");
    const bus = () => ["stops", "services", "trips", "trip_stops", "fares", "reports"].map((t) => n(db, `SELECT COUNT(*) AS n FROM ${t}`));
    const before = bus();
    assert.deepEqual(before.slice(0, 5), [11, 6, 30, 142, 52]);
    seedVoyageContent(db);
    createSaved(db, A, { title: "x" });
    assert.deepEqual(bus(), before);
  });
});

describe("saved inspiration", () => {
  it("saves Pinterest, Instagram and video links with the platform recognised", () => {
    const db = voyageDb();
    const ids = [
      createSaved(db, A, { title: "Cafe pin", url: "https://www.pinterest.com/pin/1/" }),
      createSaved(db, A, { title: "Reel", url: "https://www.instagram.com/reel/abc/" }),
      createSaved(db, A, { title: "Walk", url: "https://www.youtube.com/watch?v=abc" }),
      createSaved(db, A, { title: "Blog", url: "https://example.com/post" }),
    ];
    assert.deepEqual(ids.map((id) => getSaved(db, A, id)!.platform), ["pinterest", "instagram", "youtube", "web"]);
  });

  it("accepts manual place details and a title taken from the link when none is given", () => {
    const db = voyageDb();
    const id = createSaved(db, A, {
      title: "Sunset spot", destinationId: "kozhikode", category: "landmark", location: "Beach Road", notes: "Go at 6pm\nBring water",
      durationMin: "60", cost: "150", currency: "INR",
    });
    const s = getSaved(db, A, id)!;
    assert.deepEqual([s.title, s.destinationName, s.category, s.location, s.durationMin, s.costCents, s.currency, s.platform], ["Sunset spot", "Kozhikode", "landmark", "Beach Road", 60, 15000, "INR", "manual"]);
    assert.equal(s.notes, "Go at 6pm\nBring water");
    const linkOnly = createSaved(db, A, { url: "https://vimeo.com/12345" });
    assert.equal(getSaved(db, A, linkOnly)!.title, "Vimeo · vimeo.com");
  });

  it("defaults the currency from the destination", () => {
    const db = voyageDb();
    assert.equal(getSaved(db, A, createSaved(db, A, { title: "a", destinationId: "kozhikode", cost: "10" }))!.currency, "INR");
    assert.equal(getSaved(db, A, createSaved(db, A, { title: "b", destinationId: "istanbul", cost: "10" }))!.currency, "TRY");
    assert.equal(getSaved(db, A, createSaved(db, A, { title: "c", cost: "10", currency: "eur" }))!.currency, "EUR");
    assert.equal(getSaved(db, A, createSaved(db, A, { title: "d" }))!.currency, null);
  });

  it("rejects bad input and writes nothing", () => {
    const db = voyageDb();
    assert.equal(code(() => createSaved(db, A, {})), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", url: "javascript:alert(1)" })), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", destinationId: "atlantis" })), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", category: "spaceport" })), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", cost: "-5" })), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", durationMin: "0" })), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", currency: "BTC", cost: "1" })), "validation");
    assert.equal(code(() => createSaved(db, A, { title: "x", collectionId: 999 })), "validation");
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM saved_items"), 0);
  });

  it("edits and deletes", () => {
    const db = voyageDb();
    const id = createSaved(db, A, { title: "Old title", url: "https://pinterest.com/pin/9", notes: "n" });
    updateSaved(db, A, id, { title: "New title", url: "https://youtu.be/xyz", notes: "", cost: "5", destinationId: "istanbul" });
    const s = getSaved(db, A, id)!;
    assert.deepEqual([s.title, s.platform, s.notes, s.costCents, s.destinationId], ["New title", "youtube", null, 500, "istanbul"]);
    assert.equal(code(() => updateSaved(db, A, id, { title: "" })), "validation"); // invalid edit changes nothing
    assert.equal(getSaved(db, A, id)!.title, "New title");
    deleteSaved(db, A, id);
    assert.equal(getSaved(db, A, id), null);
    assert.equal(code(() => deleteSaved(db, A, id)), "not_found");
  });

  it("keeps each visitor's items private", () => {
    const db = voyageDb();
    const id = createSaved(db, A, { title: "Mine" });
    assert.equal(getSaved(db, B, id), null);
    assert.equal(code(() => updateSaved(db, B, id, { title: "Hacked" })), "not_found");
    assert.equal(code(() => deleteSaved(db, B, id)), "not_found");
    assert.equal(code(() => moveToCollection(db, B, id, null)), "not_found");
    assert.deepEqual(listSaved(db, B), []);
    assert.equal(getSaved(db, A, id)!.title, "Mine");
    // and cannot be pointed at someone else's collection
    const col = createCollection(db, A, "Secret");
    assert.equal(code(() => createSaved(db, B, { title: "x", collectionId: col })), "validation");
    assert.equal(code(() => renameCollection(db, B, col, "Mine now")), "validation");
    assert.equal(code(() => deleteCollection(db, B, col)), "validation");
  });

  it("organises items into collections; deleting a collection keeps the items", () => {
    const db = voyageDb();
    const food = createCollection(db, A, "Food ideas");
    const sights = createCollection(db, A, "Sights");
    const a = createSaved(db, A, { title: "Biryani", collectionId: food, category: "food" });
    const b = createSaved(db, A, { title: "Tower", collectionId: sights });
    const c = createSaved(db, A, { title: "Loose idea" });
    assert.deepEqual(listCollections(db, A).map((x) => [x.name, x.itemCount]), [["Food ideas", 1], ["Sights", 1]]);
    assert.deepEqual(listSaved(db, A, { collectionId: food }).map((s) => s.id), [a]);
    assert.deepEqual(listSaved(db, A, { collectionId: "none" }).map((s) => s.id), [c]);
    moveToCollection(db, A, c, sights);
    assert.equal(listSaved(db, A, { collectionId: sights }).length, 2);
    moveToCollection(db, A, c, null);
    renameCollection(db, A, food, "Eat");
    assert.equal(listCollections(db, A)[0].name, "Eat");
    deleteCollection(db, A, sights);
    assert.equal(getSaved(db, A, b)!.collectionId, null);
    assert.equal(getSaved(db, A, b)!.title, "Tower");
  });

  it("collection names are unique ignoring case, and limited", () => {
    const db = voyageDb();
    createCollection(db, A, "Beaches");
    assert.equal(code(() => createCollection(db, A, "beaches")), "conflict");
    assert.doesNotThrow(() => createCollection(db, B, "Beaches")); // another visitor may use the same name
    assert.equal(code(() => createCollection(db, A, "  ")), "validation");
    for (let i = 1; i < 30; i++) createCollection(db, A, `c${i}`);
    assert.equal(code(() => createCollection(db, A, "one too many")), "limit");
  });

  it("filters by destination, category and text, and escapes wildcards", () => {
    const db = voyageDb();
    createSaved(db, A, { title: "Baklava", destinationId: "istanbul", category: "food", notes: "pistachio" });
    createSaved(db, A, { title: "Beach walk", destinationId: "kozhikode", category: "landmark", location: "Beach Road" });
    createSaved(db, A, { title: "100% sure", category: "other" });
    assert.deepEqual(listSaved(db, A, { destinationId: "istanbul" }).map((s) => s.title), ["Baklava"]);
    assert.deepEqual(listSaved(db, A, { category: "landmark" }).map((s) => s.title), ["Beach walk"]);
    assert.deepEqual(listSaved(db, A, { q: "pistach" }).map((s) => s.title), ["Baklava"]);
    assert.deepEqual(listSaved(db, A, { q: "beach road" }).map((s) => s.title), ["Beach walk"]);
    assert.deepEqual(listSaved(db, A, { q: "100%" }).map((s) => s.title), ["100% sure"]);
    assert.equal(listSaved(db, A, { q: "%" }).length, 1); // a literal percent sign, not "match everything"
    assert.equal(listSaved(db, A, { q: "x' OR '1'='1" }).length, 0);
  });

  it("saves a curated place once, copying its details", () => {
    const db = voyageDb();
    const first = savePlace(db, A, "galata-tower");
    const again = savePlace(db, A, "galata-tower");
    assert.deepEqual([first.created, again.created, again.id], [true, false, first.id]);
    const s = getSaved(db, A, first.id)!;
    assert.deepEqual([s.title, s.placeId, s.destinationId, s.durationMin, s.currency], ["Galata Tower", "galata-tower", "istanbul", 60, "EUR"]);
    assert.equal(s.costCents, 2500); // the middle of the €15–€35 range
    assert.equal(code(() => savePlace(db, A, "no-such-place")), "not_found");
    assert.deepEqual([...savedPlaceIds(db, A)], ["galata-tower"]);
    assert.equal(savedPlaceIds(db, B).size, 0);
  });

  it("limits how many items one visitor can keep", () => {
    const db = voyageDb();
    for (let i = 0; i < 500; i++) createSaved(db, A, { title: `item ${i}` });
    assert.equal(code(() => createSaved(db, A, { title: "501st" })), "limit");
    assert.equal(code(() => savePlace(db, A, "hagia-sophia")), "limit");
    assert.doesNotThrow(() => createSaved(db, B, { title: "other visitor is unaffected" }));
  });
});

describe("trips", () => {
  it("creates a trip with a destination and dates, and derives its days", () => {
    const db = voyageDb();
    const id = trip(db);
    const t = getTrip(db, A, id)!;
    assert.deepEqual([t.trip.name, t.trip.destinationName, t.trip.days, t.trip.currency], ["Istanbul in autumn", "Istanbul", 4, "TRY"]);
    assert.deepEqual(t.days.map((d) => d.date), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
    assert.equal(getTrip(db, A, trip(db, A, { destinationId: "kozhikode", name: "Kerala" }))!.trip.currency, "INR");
    assert.equal(getTrip(db, A, trip(db, A, { currency: "eur" }))!.trip.currency, "EUR");
  });

  it("rejects bad trips", () => {
    const db = voyageDb();
    assert.equal(code(() => trip(db, A, { name: "" })), "validation");
    assert.equal(code(() => trip(db, A, { destinationId: "paris" })), "validation");
    assert.equal(code(() => trip(db, A, { startDate: "2026-10-15", endDate: "2026-10-12" })), "validation");
    assert.equal(code(() => trip(db, A, { startDate: "2026-02-31" })), "validation");
    assert.equal(code(() => trip(db, A, { startDate: "2026-01-01", endDate: "2026-12-31" })), "validation");
    assert.equal(code(() => trip(db, A, { currency: "XYZ" })), "validation");
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM voyage_trips"), 0);
    for (let i = 0; i < 50; i++) trip(db);
    assert.equal(code(() => trip(db)), "limit");
  });

  it("lists trips by start date and keeps them private", () => {
    const db = voyageDb();
    const later = trip(db, A, { name: "Later", startDate: "2027-01-01", endDate: "2027-01-02" });
    const sooner = trip(db, A, { name: "Sooner", startDate: "2026-11-01", endDate: "2026-11-03" });
    assert.deepEqual(listTrips(db, A).map((t) => t.id), [sooner, later]);
    assert.deepEqual(listTrips(db, B), []);
    assert.equal(getTrip(db, B, sooner), null);
    assert.equal(code(() => updateTrip(db, B, sooner, { name: "x", destinationId: "istanbul", startDate: "2026-11-01", endDate: "2026-11-03" })), "not_found");
    assert.equal(code(() => deleteTrip(db, B, sooner)), "not_found");
    assert.equal(code(() => addCustomActivity(db, B, sooner, 1, { title: "intruder" })), "not_found");
    assert.equal(code(() => addExpense(db, B, sooner, { label: "x", amount: "1" })), "not_found");
  });

  it("adds saved places, curated places and custom activities to a day", () => {
    const db = voyageDb();
    const t = trip(db);
    const saved = createSaved(db, A, { title: "Cafe from Pinterest", url: "https://pinterest.com/pin/5", destinationId: "istanbul", category: "food", durationMin: "45", cost: "9", currency: "EUR", location: "Karaköy", notes: "Try the lemon cake" });
    addActivityFromSaved(db, A, t, 1, saved);
    addActivityFromPlace(db, A, t, 1, "hagia-sophia");
    addCustomActivity(db, A, t, 2, { title: "Ferry to Kadıköy", category: "other", durationMin: "40", cost: "2", currency: "EUR" });
    const d1 = getTrip(db, A, t)!.days[0].activities;
    assert.deepEqual(d1.map((a) => [a.title, a.position]), [["Cafe from Pinterest", 0], ["Hagia Sophia", 1]]);
    assert.deepEqual([d1[0].location, d1[0].notes, d1[0].durationMin, d1[0].costCents, d1[0].savedItemId], ["Karaköy", "Try the lemon cake", 45, 900, saved]);
    assert.deepEqual([d1[1].placeId, d1[1].costCents, d1[1].currency], ["hagia-sophia", 1250, "EUR"]);
    assert.equal(titles(db, t, 2)[0], "Ferry to Kadıköy");
  });

  it("refuses unknown days, unknown items and other people's saved items", () => {
    const db = voyageDb();
    const t = trip(db);
    const mine = createSaved(db, A, { title: "mine" });
    const theirs = createSaved(db, B, { title: "theirs" });
    for (const day of [0, 5, -1, 1.5, "x"]) assert.equal(code(() => addCustomActivity(db, A, t, day, { title: "x" })), "validation", String(day));
    assert.equal(code(() => addActivityFromSaved(db, A, t, 1, theirs)), "not_found");
    assert.equal(code(() => addActivityFromSaved(db, A, t, 1, 9999)), "not_found");
    assert.equal(code(() => addActivityFromPlace(db, A, t, 1, "nowhere")), "not_found");
    assert.equal(code(() => addCustomActivity(db, A, t, 1, { title: "" })), "validation");
    assert.doesNotThrow(() => addActivityFromSaved(db, A, t, 1, mine));
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM voyage_activities"), 1);
  });

  it("an activity is a snapshot: editing or deleting the saved item does not change the trip", () => {
    const db = voyageDb();
    const t = trip(db);
    const s = createSaved(db, A, { title: "Original", notes: "keep me" });
    addActivityFromSaved(db, A, t, 1, s);
    updateSaved(db, A, s, { title: "Renamed", notes: "changed" });
    assert.equal(titles(db, t, 1)[0], "Original");
    deleteSaved(db, A, s);
    const a = getTrip(db, A, t)!.days[0].activities[0];
    assert.deepEqual([a.title, a.notes, a.savedItemId], ["Original", "keep me", null]);
  });

  it("reorders activities within a day, and the order survives a reload", () => {
    const db = voyageDb();
    const t = trip(db);
    const ids = ["A", "B", "C", "D"].map((title) => addCustomActivity(db, A, t, 1, { title }));
    assert.deepEqual(titles(db, t, 1), ["A", "B", "C", "D"]);
    moveActivity(db, A, ids[2], "up");
    assert.deepEqual(titles(db, t, 1), ["A", "C", "B", "D"]);
    moveActivity(db, A, ids[0], "down");
    assert.deepEqual(titles(db, t, 1), ["C", "A", "B", "D"]);
    moveActivity(db, A, ids[2], "up"); // already first
    moveActivity(db, A, ids[3], "down"); // already last
    assert.deepEqual(titles(db, t, 1), ["C", "A", "B", "D"]); // unchanged by the no-op moves
    assert.deepEqual(getTrip(db, A, t)!.days[0].activities.map((a) => a.position), [0, 1, 2, 3]);
    assert.equal(code(() => moveActivity(db, B, ids[0], "up")), "not_found");
    assert.equal(code(() => moveActivity(db, A, ids[0], "sideways" as never)), "validation");
  });

  it("moves an activity to another day and keeps both days tidy", () => {
    const db = voyageDb();
    const t = trip(db);
    const [a, b, c] = ["A", "B", "C"].map((title) => addCustomActivity(db, A, t, 1, { title }));
    addCustomActivity(db, A, t, 2, { title: "X" });
    moveActivityToDay(db, A, b, 2);
    assert.deepEqual(titles(db, t, 1), ["A", "C"]);
    assert.deepEqual(titles(db, t, 2), ["X", "B"]);
    assert.deepEqual(getTrip(db, A, t)!.days[0].activities.map((x) => x.position), [0, 1]);
    assert.equal(code(() => moveActivityToDay(db, A, a, 9)), "validation");
    updateActivity(db, A, c, { title: "C edited", category: "food", durationMin: "30", cost: "3.5", currency: "TRY", day: 3 });
    assert.deepEqual(titles(db, t, 3), ["C edited"]);
    assert.deepEqual(titles(db, t, 1), ["A"]);
    const e = getTrip(db, A, t)!.days[2].activities[0];
    assert.deepEqual([e.category, e.durationMin, e.costCents, e.currency], ["food", 30, 350, "TRY"]);
  });

  it("removes an activity and closes the gap", () => {
    const db = voyageDb();
    const t = trip(db);
    const ids = ["A", "B", "C"].map((title) => addCustomActivity(db, A, t, 1, { title }));
    removeActivity(db, A, ids[1]);
    assert.deepEqual(titles(db, t, 1), ["A", "C"]);
    assert.deepEqual(getTrip(db, A, t)!.days[0].activities.map((x) => x.position), [0, 1]);
    assert.equal(code(() => removeActivity(db, A, ids[1])), "not_found");
    assert.equal(code(() => removeActivity(db, B, ids[0])), "not_found");
  });

  it("records estimated expenses per day or for the whole trip, with totals per currency (no conversion)", () => {
    const db = voyageDb();
    const t = trip(db);
    addActivityFromPlace(db, A, t, 1, "hagia-sophia"); // €12.50 midpoint
    addActivityFromPlace(db, A, t, 1, "karakoy-gulluoglu"); // €6.50 midpoint
    addCustomActivity(db, A, t, 2, { title: "Ferry", cost: "40", currency: "TRY" });
    addExpense(db, A, t, { label: "Airport transfer", category: "transport", amount: "35.50", currency: "EUR", day: 1 });
    addExpense(db, A, t, { label: "Hotel", category: "stay", amount: "5,400", day: "" }); // trip currency (TRY), whole trip
    addExpense(db, A, t, { label: "Simit", category: "food", amount: "60", day: 2 });
    const d = getTrip(db, A, t)!;
    assert.deepEqual(d.totals.activities, { EUR: 1900, TRY: 4000 });
    assert.deepEqual(d.totals.expenses, { EUR: 3550, TRY: 546000 });
    assert.deepEqual(d.totals.combined, { EUR: 5450, TRY: 550000 });
    assert.deepEqual(d.days[0].totals.expenses, { EUR: 3550 });
    assert.deepEqual(d.days[1].totals, { activities: { TRY: 4000 }, expenses: { TRY: 6000 } });
    assert.deepEqual(d.tripWideExpenses.map((e) => e.label), ["Hotel"]);
    assert.equal(d.totalDurationMin, 90 + 30 + 0);
  });

  it("edits and removes expenses, and validates them", () => {
    const db = voyageDb();
    const t = trip(db);
    const e = addExpense(db, A, t, { label: "Taxi", amount: "10", currency: "EUR" });
    updateExpense(db, A, e, { label: "Taxi (airport)", category: "transport", amount: "12.25", currency: "EUR", day: 1, notes: "fixed price" });
    const x = getTrip(db, A, t)!.days[0].expenses[0];
    assert.deepEqual([x.label, x.amountCents, x.category, x.notes], ["Taxi (airport)", 1225, "transport", "fixed price"]);
    for (const bad of [{ label: "", amount: "1" }, { label: "x", amount: "" }, { label: "x", amount: "-3" }, { label: "x", amount: "abc" }, { label: "x", amount: "1", day: 9 }, { label: "x", amount: "1", category: "yacht" }, { label: "x", amount: "1", currency: "XXX" }]) {
      assert.equal(code(() => addExpense(db, A, t, bad)), "validation", JSON.stringify(bad));
    }
    assert.equal(code(() => updateExpense(db, B, e, { label: "x", amount: "1" })), "not_found");
    assert.equal(code(() => removeExpense(db, B, e)), "not_found");
    removeExpense(db, A, e);
    assert.equal(getTrip(db, A, t)!.days[0].expenses.length, 0);
  });

  it("changing dates: longer is fine, shorter is refused while later days are in use", () => {
    const db = voyageDb();
    const t = trip(db);
    const base = { name: "Istanbul in autumn", destinationId: "istanbul" };
    addCustomActivity(db, A, t, 4, { title: "Last day" });
    addExpense(db, A, t, { label: "x", amount: "1", day: 3 });
    updateTrip(db, A, t, { ...base, startDate: "2026-10-12", endDate: "2026-10-20", notes: "longer now" });
    assert.equal(getTrip(db, A, t)!.trip.days, 9);
    assert.equal(code(() => updateTrip(db, A, t, { ...base, startDate: "2026-10-12", endDate: "2026-10-14" })), "validation");
    assert.equal(getTrip(db, A, t)!.trip.days, 9); // nothing changed
    updateTrip(db, A, t, { ...base, startDate: "2026-10-20", endDate: "2026-10-23" }); // shifting the start keeps the day numbers
    assert.equal(getTrip(db, A, t)!.days[3].activities[0].title, "Last day");
    assert.equal(getTrip(db, A, t)!.days[3].date, "2026-10-23");
  });

  it("deleting a trip removes its activities and expenses but not the saved items", () => {
    const db = voyageDb();
    const t = trip(db);
    const s = createSaved(db, A, { title: "keep" });
    addActivityFromSaved(db, A, t, 1, s);
    addExpense(db, A, t, { label: "x", amount: "1" });
    deleteTrip(db, A, t);
    assert.equal(getTrip(db, A, t), null);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM voyage_activities"), 0);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM voyage_expenses"), 0);
    assert.equal(getSaved(db, A, s)!.title, "keep");
  });

  it("limits activities and expenses per trip", () => {
    const db = voyageDb();
    const t = trip(db);
    for (let i = 0; i < 300; i++) addCustomActivity(db, A, t, 1, { title: `a${i}` });
    assert.equal(code(() => addCustomActivity(db, A, t, 1, { title: "too many" })), "limit");
    for (let i = 0; i < 500; i++) addExpense(db, A, t, { label: `e${i}`, amount: "1" });
    assert.equal(code(() => addExpense(db, A, t, { label: "too many", amount: "1" })), "limit");
  });

  it("stores hostile text as plain text", () => {
    const db = voyageDb();
    const t = trip(db, A, { name: "<img src=x onerror=alert(1)>" });
    addCustomActivity(db, A, t, 1, { title: "'; DROP TABLE trips;--", notes: "<script>alert(1)</script>" });
    const d = getTrip(db, A, t)!;
    assert.equal(d.trip.name, "<img src=x onerror=alert(1)>");
    assert.equal(d.days[0].activities[0].title, "'; DROP TABLE trips;--");
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM voyage_trips"), 1);
  });
});
