import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeSource } from "../src/lib/voyage/extract";
import {
  addCaptureToTrip, addManualCandidate, confirmCandidates, createCapture, deleteCapture, getCapture, listCaptures, rejectCandidates,
} from "../src/lib/voyage/reel";
import { listCollections, listSaved } from "../src/lib/voyage/saved";
import { seedVoyageContent } from "../src/lib/voyage/seed";
import {
  addActivityFromPlace, addActivityFromSaved, addCustomActivity, applyOrder, createTrip, dayWarnings, getTrip, parseStartTime, suggestOrder,
} from "../src/lib/voyage/trips";
import { VoyageError } from "../src/lib/voyage/validate";
import { memoryDb } from "./helpers";

const A = "owner-a";
const B = "owner-b";
const CAPTION = "Day in Istanbul ðŸ‡¹ðŸ‡·\nðŸ“ Hagia Sophia\nðŸ“ Grand Bazaar\nðŸ“ Galata Tower";

const db0 = () => {
  const db = memoryDb();
  seedVoyageContent(db);
  return db;
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof VoyageError, `expected VoyageError, got ${e}`);
    return (e as VoyageError).code;
  }
  assert.fail("expected the call to throw");
};
const capture = async (db: ReturnType<typeof db0>, owner = A, caption = CAPTION) =>
  createCapture(db, owner, await analyzeSource({ caption }));
const trip = (db: ReturnType<typeof db0>, owner = A) =>
  createTrip(db, owner, { name: "Istanbul", destinationId: "istanbul", startDate: "2026-10-12", endDate: "2026-10-14" });

describe("reel captures", () => {
  it("stores the extraction, the caption and the places found, without saving anything yet", async () => {
    const db = db0();
    const id = await capture(db);
    const cap = getCapture(db, A, id)!;
    assert.equal(cap.platform, "manual");
    assert.equal(cap.fetchStatus, "skipped");
    assert.equal(cap.pastedCaption, CAPTION);
    assert.equal(cap.destinationId, "istanbul");
    const names = cap.candidates.map((c) => c.name);
    for (const n of ["Hagia Sophia", "Grand Bazaar"]) assert.ok(names.some((x) => x.includes(n)), n);
    assert.ok(cap.candidates.every((c) => c.status === "suggested" && c.savedItemId === null));
    assert.equal(listSaved(db, A).length, 0);
    assert.equal(listCaptures(db, A)[0].candidateCount, cap.candidates.length);
  });

  it("is private to its owner", async () => {
    const db = db0();
    const id = await capture(db);
    assert.equal(getCapture(db, B, id), null);
    assert.equal(code(() => deleteCapture(db, B, id)), "not_found");
    assert.equal(code(() => confirmCandidates(db, B, id, [{ candidateId: 1 }])), "not_found");
    assert.equal(listCaptures(db, B).length, 0);
  });

  it("saves only the confirmed places, applying the person's corrections, into a new collection", async () => {
    const db = db0();
    const id = await capture(db);
    const cap = getCapture(db, A, id)!;
    const hagia = cap.candidates.find((c) => c.matchedPlaceId === "hagia-sophia")!;
    const other = cap.candidates.find((c) => c.id !== hagia.id)!;
    rejectCandidates(db, A, id, [other.id]);

    const r = confirmCandidates(db, A, id, [{ candidateId: hagia.id, notes: "Go early", destinationId: "istanbul" }], { newCollectionName: "Istanbul reel", tags: "Mosque, history" });
    assert.equal(r.saved.length, 1);
    assert.equal(r.failed.length, 0);
    const items = listSaved(db, A);
    assert.equal(items.length, 1);
    assert.equal(items[0].captureId, id);
    assert.match(items[0].notes ?? "", /Go early/);
    assert.deepEqual(items[0].tags, ["mosque", "history"]);
    assert.ok(listCollections(db, A).some((c) => c.name === "Istanbul reel" && c.id === r.collectionId));
    assert.equal(getCapture(db, A, id)!.candidates.find((c) => c.id === hagia.id)!.status, "confirmed");
    // a rejected place cannot be confirmed afterwards
    assert.equal(confirmCandidates(db, A, id, [{ candidateId: other.id }]).failed.length, 1);
  });

  it("never duplicates a place that is already saved: it links to the existing item", async () => {
    const db = db0();
    const first = getCapture(db, A, await capture(db, A))!;
    const second = getCapture(db, A, await capture(db, A))!;
    const a = confirmCandidates(db, A, first.id, [{ candidateId: first.candidates[0].id }]);
    const b = confirmCandidates(db, A, second.id, [{ candidateId: second.candidates.find((c) => c.name === first.candidates[0].name)!.id }]);
    assert.equal(a.saved.length, 1);
    assert.equal(b.saved.length, 0);
    assert.equal(b.alreadySaved.length, 1);
    assert.equal(b.alreadySaved[0].savedId, a.saved[0].savedId);
    assert.equal(listSaved(db, A).length, 1);
  });

  it("lets the person add a place the finder missed, and requires a selection", async () => {
    const db = db0();
    const id = await capture(db, A, "just some words with no places at all");
    assert.equal(getCapture(db, A, id)!.candidates.length, 0);
    const cid = addManualCandidate(db, A, id, { name: "Little Cafe", category: "food", destinationId: "istanbul" });
    assert.equal(code(() => confirmCandidates(db, A, id, [])), "validation");
    assert.equal(confirmCandidates(db, A, id, [{ candidateId: cid }]).saved.length, 1);
    assert.equal(listSaved(db, A)[0].title, "Little Cafe");
  });

  it("adds confirmed places to a trip day once, and persists them", async () => {
    const db = db0();
    const id = await capture(db);
    const cap = getCapture(db, A, id)!;
    const t = trip(db);
    assert.equal(code(() => addCaptureToTrip(db, A, id, t, 1)), "validation", "nothing confirmed yet");
    confirmCandidates(db, A, id, cap.candidates.slice(0, 2).map((c) => ({ candidateId: c.id })));
    const r = addCaptureToTrip(db, A, id, t, 1);
    assert.equal(r.added.length, 2);
    assert.equal(getTrip(db, A, t)!.days[0].activities.length, 2);
    const again = addCaptureToTrip(db, A, id, t, 2);
    assert.equal(again.added.length, 0);
    assert.equal(again.skipped.length, 2, "already planned: refused, not duplicated");
    // planned status shows in the library
    assert.ok(listSaved(db, A).every((s) => s.plannedIn.length === 1 && s.plannedIn[0].tripId === t));
    assert.equal(listSaved(db, A, { planned: "unplanned" }).length, 0);
    assert.equal(listSaved(db, A, { planned: "planned" }).length, 2);
  });
});

describe("trip planning additions", () => {
  it("refuses to plan the same curated place or saved item twice in a trip", () => {
    const db = db0();
    const t = trip(db);
    addActivityFromPlace(db, A, t, 1, "hagia-sophia");
    assert.equal(code(() => addActivityFromPlace(db, A, t, 2, "hagia-sophia")), "conflict");
    const other = trip(db);
    assert.ok(addActivityFromPlace(db, A, other, 1, "hagia-sophia"), "a different trip is fine");
  });

  it("validates start times and warns about overlaps and overfull days", () => {
    assert.equal(parseStartTime("09:30"), "09:30");
    assert.equal(parseStartTime(""), null);
    assert.throws(() => parseStartTime("25:00"), VoyageError);
    assert.throws(() => parseStartTime("9am"), VoyageError);
    assert.deepEqual(dayWarnings([{ title: "A", startTime: "09:00", durationMin: 60 }, { title: "B", startTime: "10:00", durationMin: 30 }]), []);
    const w = dayWarnings([{ title: "A", startTime: "09:00", durationMin: 90 }, { title: "B", startTime: "10:00", durationMin: 30 }]);
    assert.equal(w.length, 1);
    assert.match(w[0], /B.*A/);
    assert.equal(dayWarnings([{ title: "A", startTime: null, durationMin: 700 }]).length, 1);
  });

  it("stores a start time on an activity", () => {
    const db = db0();
    const t = trip(db);
    addCustomActivity(db, A, t, 1, { title: "Breakfast", startTime: "08:30", durationMin: 45 });
    assert.equal(getTrip(db, A, t)!.days[0].activities[0].startTime, "08:30");
  });

  it("suggests a nearest-neighbour order only from known locations, and applies it only when asked", () => {
    const db = db0();
    const t = trip(db);
    // deliberately zig-zag across the city
    for (const p of ["galata-tower", "hagia-sophia", "grand-bazaar"]) addActivityFromPlace(db, A, t, 1, p);
    const before = getTrip(db, A, t)!.days[0].activities.map((a) => a.id);
    const s = suggestOrder(db, A, t, 1);
    assert.equal(s.order.length, 3);
    assert.deepEqual(getTrip(db, A, t)!.days[0].activities.map((a) => a.id), before, "a suggestion changes nothing");
    assert.ok(s.totalKm !== null && s.totalKm > 0);
    applyOrder(db, A, t, 1, s.order);
    assert.deepEqual(getTrip(db, A, t)!.days[0].activities.map((a) => a.id), s.order);
    assert.equal(code(() => applyOrder(db, A, t, 1, [s.order[0]])), "validation");
    assert.equal(code(() => applyOrder(db, B, t, 1, s.order)), "not_found");
  });

  it("does not guess an order with fewer than 3 located places", () => {
    const db = db0();
    const t = trip(db);
    addActivityFromPlace(db, A, t, 1, "hagia-sophia");
    addCustomActivity(db, A, t, 1, { title: "Free time" });
    const s = suggestOrder(db, A, t, 1);
    assert.equal(s.changed, false);
    assert.equal(s.totalKm, null);
  });
});

