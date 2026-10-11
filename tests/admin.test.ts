import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { listAudit } from "../src/lib/admin/audit";
import { AdminError } from "../src/lib/admin/errors";
import { getServiceDetail, listServices, listStopsAdmin, overview } from "../src/lib/admin/queries";
import {
  addFare, parseHm, rejectFare, rejectService, renameStop, restoreService, unverifyService, updateTripTimes,
  verifyFare, verifyService, verifyStop,
} from "../src/lib/admin/review";
import { searchJourneys } from "../src/lib/db/search-core";
import { importKeralaPrivateBus } from "../src/lib/importers/kerala-private-bus";
import { openDb } from "../src/lib/db/connection";
import { addTrip, hm, memoryDb } from "./helpers";

const ADMIN = "tester";
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof AdminError, `expected AdminError, got ${e}`);
    return (e as AdminError).code;
  }
  assert.fail("expected the call to throw");
};
const row = (db: Database.Database, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as Record<string, unknown>;

function fixture() {
  const db = memoryDb();
  const trip = addTrip(db, "bus1", [["a", null, hm(7)], ["b", hm(7, 20), hm(7, 21)], ["c", hm(7, 40), null]]);
  return { db, trip };
}

describe("verification", () => {
  it("verifies a bus with a named source, recording who, when and against what", () => {
    const { db } = fixture();
    verifyService(db, ADMIN, "bus1", { source: "Operator timetable photo, 2026-10-12", note: "checked on site" });
    const s = row(db, "SELECT * FROM services WHERE id = 'bus1'");
    assert.equal(s.data_status, "verified");
    assert.equal(s.verified_by, ADMIN);
    assert.equal(s.verified_source, "Operator timetable photo, 2026-10-12");
    assert.match(String(s.verified_at), /^\d{4}-\d\d-\d\dT/);
    assert.equal(s.locked, 1);
  });

  it("keeps the original data source untouched", () => {
    const { db } = fixture();
    db.prepare("UPDATE services SET source = 'imported from X' WHERE id = 'bus1'").run();
    verifyService(db, ADMIN, "bus1", { source: "Checked at the depot" });
    assert.equal(row(db, "SELECT source FROM services WHERE id = 'bus1'").source, "imported from X");
  });

  it("requires a real source", () => {
    const { db } = fixture();
    assert.equal(code(() => verifyService(db, ADMIN, "bus1", { source: "" })), "validation");
    assert.equal(code(() => verifyService(db, ADMIN, "bus1", { source: "  ab " })), "validation");
    assert.equal(code(() => verifyService(db, ADMIN, "bus1", { source: "x".repeat(301) })), "validation");
    assert.equal(code(() => verifyService(db, ADMIN, "bus1", { source: "ok source\u0000" })), "validation");
    assert.equal(row(db, "SELECT data_status FROM services WHERE id = 'bus1'").data_status, "unverified");
  });

  it("refuses to verify demo data, however it is asked", () => {
    const db = openDb(":memory:");
    assert.equal(code(() => verifyService(db, ADMIN, "demo-1-out", { source: "Looks right to me" })), "demo_record");
    assert.equal(code(() => verifyStop(db, ADMIN, "mananchira", { source: "Looks right to me" })), "demo_record");
    const fare = row(db, "SELECT id FROM fares LIMIT 1").id as number;
    assert.equal(code(() => verifyFare(db, ADMIN, fare, { source: "Looks right to me" })), "demo_record");
    assert.equal((row(db, "SELECT COUNT(*) AS n FROM services WHERE data_status = 'verified'").n as number), 0);
  });

  it("refuses unknown buses, rejected buses and buses without trips", () => {
    const { db } = fixture();
    assert.equal(code(() => verifyService(db, ADMIN, "nope", { source: "some source" })), "not_found");
    db.prepare("INSERT INTO services (id, name) VALUES ('empty', 'empty')").run();
    assert.equal(code(() => verifyService(db, ADMIN, "empty", { source: "some source" })), "validation");
    rejectService(db, ADMIN, "bus1", { reason: "wrong route" });
    assert.equal(code(() => verifyService(db, ADMIN, "bus1", { source: "some source" })), "rejected");
  });

  it("can withdraw verification, with a reason", () => {
    const { db } = fixture();
    verifyService(db, ADMIN, "bus1", { source: "Operator timetable" });
    assert.equal(code(() => unverifyService(db, ADMIN, "bus1", { note: "" })), "validation");
    unverifyService(db, ADMIN, "bus1", { note: "Operator changed times" });
    const s = row(db, "SELECT data_status, verified_at, verified_source FROM services WHERE id = 'bus1'");
    assert.deepEqual(s, { data_status: "unverified", verified_at: null, verified_source: null });
    assert.equal(code(() => unverifyService(db, ADMIN, "bus1", { note: "again please" })), "validation");
  });
});

describe("reject and restore", () => {
  it("hides a rejected bus from passenger search, and restoring brings it back as unverified", () => {
    const { db } = fixture();
    assert.equal(searchJourneys(db, "a", "c").direct.length, 1);
    verifyService(db, ADMIN, "bus1", { source: "Operator timetable" });
    rejectService(db, ADMIN, "bus1", { reason: "Route no longer runs" });
    assert.equal(searchJourneys(db, "a", "c").direct.length, 0);
    const s = row(db, "SELECT data_status, rejected_at, rejected_by, verified_at FROM services WHERE id = 'bus1'");
    assert.equal(s.data_status, "unverified"); // rejection withdraws verification
    assert.equal(s.rejected_by, ADMIN);
    assert.equal(s.verified_at, null);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM trips WHERE service_id = 'bus1'").n, 1); // data kept
    assert.equal(code(() => rejectService(db, ADMIN, "bus1", { reason: "twice" })), "conflict");

    restoreService(db, ADMIN, "bus1", { note: "reviewed again" });
    assert.equal(searchJourneys(db, "a", "c").direct.length, 1);
    assert.equal(searchJourneys(db, "a", "c").direct[0].legs[0].dataStatus, "unverified");
    assert.equal(code(() => restoreService(db, ADMIN, "bus1")), "conflict");
  });

  it("a rejected bus can't be used as a transfer leg either", () => {
    const db = memoryDb();
    addTrip(db, "x1", [["a", null, hm(7)], ["m", hm(7, 20), hm(7, 20)]]);
    addTrip(db, "x2", [["m", null, hm(7, 30)], ["b", hm(7, 50), null]]);
    assert.equal(searchJourneys(db, "a", "b").transfers.length, 1);
    rejectService(db, ADMIN, "x2", { reason: "wrong" });
    assert.equal(searchJourneys(db, "a", "b").transfers.length, 0);
  });

  it("requires a reason", () => {
    const { db } = fixture();
    assert.equal(code(() => rejectService(db, ADMIN, "bus1", { reason: "" })), "validation");
  });
});

describe("editing trip times", () => {
  it("updates times, writes before/after to the audit log and withdraws verification", () => {
    const { db, trip } = fixture();
    verifyService(db, ADMIN, "bus1", { source: "Operator timetable" });
    updateTripTimes(db, ADMIN, trip, [{ seq: 0, arrivalMin: null, departureMin: hm(7, 5) }], { note: "operator confirmed 7:05" });
    assert.equal(row(db, "SELECT departure_min FROM trip_stops WHERE trip_id = ? AND seq = 0", trip).departure_min, hm(7, 5));
    const s = row(db, "SELECT data_status, verified_at, verified_source, locked FROM services WHERE id = 'bus1'");
    assert.deepEqual(s, { data_status: "unverified", verified_at: null, verified_source: null, locked: 1 });
    const entry = listAudit(db, { entityType: "trip", entityId: String(trip) })[0];
    assert.equal(entry.action, "edit_times");
    assert.match(entry.before ?? "", /420/);
    assert.match(entry.after ?? "", /425/);
    assert.match(entry.note ?? "", /verification withdrawn/);
  });

  it("rejects times that go backwards, are out of range, or change nothing", () => {
    const { db, trip } = fixture();
    assert.equal(code(() => updateTripTimes(db, ADMIN, trip, [{ seq: 1, arrivalMin: hm(6), departureMin: hm(6) }])), "validation");
    assert.equal(code(() => updateTripTimes(db, ADMIN, trip, [{ seq: 2, arrivalMin: -5, departureMin: null }])), "validation");
    assert.equal(code(() => updateTripTimes(db, ADMIN, trip, [{ seq: 2, arrivalMin: 99999, departureMin: null }])), "validation");
    assert.equal(code(() => updateTripTimes(db, ADMIN, trip, [{ seq: 9, arrivalMin: 1, departureMin: 1 }])), "validation");
    assert.equal(code(() => updateTripTimes(db, ADMIN, trip, [{ seq: 0, arrivalMin: null, departureMin: hm(7) }])), "validation");
    assert.equal(code(() => updateTripTimes(db, ADMIN, trip, [{ seq: 1, arrivalMin: null, departureMin: null }])), "validation");
    assert.equal(code(() => updateTripTimes(db, ADMIN, 99999, [])), "not_found");
    // nothing was applied by the failed attempts
    assert.equal(row(db, "SELECT arrival_min FROM trip_stops WHERE trip_id = ? AND seq = 1", trip).arrival_min, hm(7, 20));
    assert.equal(listAudit(db).length, 0);
  });

  it("is atomic: a bad row in the batch applies nothing", () => {
    const { db, trip } = fixture();
    assert.throws(() =>
      updateTripTimes(db, ADMIN, trip, [
        { seq: 0, arrivalMin: null, departureMin: hm(7, 1) },
        { seq: 7, arrivalMin: 1, departureMin: 1 },
      ]),
    );
    assert.equal(row(db, "SELECT departure_min FROM trip_stops WHERE trip_id = ? AND seq = 0", trip).departure_min, hm(7));
  });

  it("allows a trip to run past midnight (24:30) and refuses demo trips", () => {
    const { db, trip } = fixture();
    updateTripTimes(db, ADMIN, trip, [{ seq: 2, arrivalMin: parseHm("24:30"), departureMin: null }]);
    assert.equal(row(db, "SELECT arrival_min FROM trip_stops WHERE trip_id = ? AND seq = 2", trip).arrival_min, 24 * 60 + 30);
    const demo = openDb(":memory:");
    assert.equal(code(() => updateTripTimes(demo, ADMIN, 1, [{ seq: 1, arrivalMin: 1000, departureMin: 1000 }])), "demo_record");
  });

  it("parseHm accepts HH:MM only", () => {
    assert.equal(parseHm("07:05"), 425);
    assert.equal(parseHm("7:05"), 425);
    assert.equal(parseHm(""), null);
    for (const bad of ["25:99", "7", "07:5", "abc", "48:00", "07:60"]) assert.equal(code(() => parseHm(bad)), "validation", bad);
  });
});

describe("stops", () => {
  it("renames with before/after audit, and withdraws verification of that stop", () => {
    const { db } = fixture();
    verifyStop(db, ADMIN, "a", { source: "Seen on the signboard" });
    renameStop(db, ADMIN, "a", { nameEn: "Pantheerankavu", nameMl: "പന്തീരാങ്കാവ്", note: "passenger report #4" });
    const s = row(db, "SELECT name_en, name_ml, data_status, verified_at FROM stops WHERE id = 'a'");
    assert.deepEqual(s, { name_en: "Pantheerankavu", name_ml: "പന്തീരാങ്കാവ്", data_status: "unverified", verified_at: null });
    assert.equal(listAudit(db, { entityType: "stop", entityId: "a" })[0].action, "rename");
    assert.equal(code(() => renameStop(db, ADMIN, "a", { nameEn: "Pantheerankavu", nameMl: "പന്തീരാങ്കാവ്" })), "validation");
    assert.equal(code(() => renameStop(db, ADMIN, "a", { nameEn: "" })), "validation");
    assert.equal(code(() => renameStop(db, ADMIN, "zzz", { nameEn: "Valid Name" })), "not_found");
  });
  it("won't rename demo stops", () => {
    const db = openDb(":memory:");
    assert.equal(code(() => renameStop(db, ADMIN, "palayam", { nameEn: "Something else" })), "demo_record");
  });
});

describe("fares: never invented", () => {
  const setup = () => {
    const f = fixture();
    return f.db;
  };
  it("requires a source and whole-rupee amounts in range", () => {
    const db = setup();
    const base = { serviceId: "bus1", fromStopId: "a", toStopId: "c", amountInr: 20, source: "Conductor, 2026-10-12" };
    assert.equal(code(() => addFare(db, ADMIN, { ...base, source: "" })), "validation");
    for (const amountInr of [0, -3, 2.5, "abc", 5000, "", null]) assert.equal(code(() => addFare(db, ADMIN, { ...base, amountInr })), "validation", String(amountInr));
    assert.equal(code(() => addFare(db, ADMIN, { ...base, toStopId: "a" })), "validation");
    assert.equal(code(() => addFare(db, ADMIN, { ...base, toStopId: "ghost" })), "not_found");
    assert.equal(code(() => addFare(db, ADMIN, { ...base, serviceId: "ghost" })), "not_found");
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM fares").n, 0);
  });

  it("stores an unverified fare with its source, shows it labelled, and prevents duplicates", () => {
    const db = setup();
    const id = addFare(db, ADMIN, { serviceId: "bus1", fromStopId: "a", toStopId: "c", amountInr: "20", source: "Conductor, 2026-10-12" });
    const f = row(db, "SELECT * FROM fares WHERE id = ?", id);
    assert.equal(f.data_status, "unverified");
    assert.equal(f.source, "Conductor, 2026-10-12");
    assert.equal(f.verified_at, null);
    const fare = searchJourneys(db, "a", "c").direct[0].legs[0].fare!;
    assert.deepEqual([fare.amountInr, fare.dataStatus, fare.verifiedAt], [20, "unverified", null]);
    assert.equal(code(() => addFare(db, ADMIN, { serviceId: "bus1", fromStopId: "a", toStopId: "c", amountInr: 21, source: "again" })), "conflict");
  });

  it("verified fares carry date, person and what they were checked against", () => {
    const db = setup();
    const id = addFare(db, ADMIN, { serviceId: null, fromStopId: "a", toStopId: "c", amountInr: 18, source: "Fare chart", verifiedSource: "Official RTA fare chart 2025" });
    const fare = searchJourneys(db, "a", "c").direct[0].legs[0].fare!;
    assert.equal(fare.dataStatus, "verified");
    assert.equal(fare.verifiedSource, "Official RTA fare chart 2025");
    assert.ok(fare.verifiedAt);
    rejectFare(db, ADMIN, id, { reason: "chart superseded" });
    assert.equal(searchJourneys(db, "a", "c").direct[0].legs[0].fare, null); // rejected fares vanish, never guessed
    addFare(db, ADMIN, { serviceId: null, fromStopId: "a", toStopId: "c", amountInr: 19, source: "New chart" }); // can now be replaced
  });

  it("an unverified fare can be verified later", () => {
    const db = setup();
    const id = addFare(db, ADMIN, { serviceId: "bus1", fromStopId: "a", toStopId: "b", amountInr: 10, source: "Conductor" });
    assert.equal(code(() => verifyFare(db, ADMIN, id, { source: "" })), "validation");
    verifyFare(db, ADMIN, id, { source: "Receipt photo" });
    assert.equal(row(db, "SELECT data_status, verified_by FROM fares WHERE id = ?", id).verified_by, ADMIN);
  });
});

describe("audit log and listings", () => {
  it("records every successful action once, newest first, and nothing for failures", () => {
    const { db } = fixture();
    code(() => verifyService(db, ADMIN, "bus1", { source: "" }));
    verifyService(db, ADMIN, "bus1", { source: "Operator timetable" });
    unverifyService(db, ADMIN, "bus1", { note: "changed" });
    rejectService(db, ADMIN, "bus1", { reason: "gone" });
    assert.deepEqual(listAudit(db).map((e) => e.action), ["reject", "unverify", "verify"]);
    assert.ok(listAudit(db).every((e) => e.actor === ADMIN && e.entityType === "service" && e.entityId === "bus1"));
  });

  it("listings filter by status and search text, and escape LIKE wildcards", () => {
    const { db } = fixture();
    addTrip(db, "bus2", [["a", null, hm(8)], ["c", hm(8, 30), null]]);
    verifyService(db, ADMIN, "bus2", { source: "Operator timetable" });
    assert.equal(listServices(db, { filter: "verified" }).rows.map((r) => r.id).join(), "bus2");
    assert.equal(listServices(db, { filter: "unverified" }).rows.map((r) => r.id).join(), "bus1");
    assert.equal(listServices(db, { q: "bus" }).total, 2);
    assert.equal(listServices(db, { q: "%" }).total, 0);
    assert.equal(listServices(db, { q: "bus1' OR '1'='1" }).total, 0);
    rejectService(db, ADMIN, "bus1", { reason: "gone" });
    assert.equal(listServices(db, { filter: "rejected" }).rows.map((r) => r.id).join(), "bus1");
    assert.equal(listServices(db, { filter: "unverified" }).total, 0);
    assert.equal(listStopsAdmin(db, { q: "a" }).rows.length, 1);
    const o = overview(db);
    assert.equal(o.services.verified, 1);
    assert.equal(o.services.rejected, 1);
  });

  it("service detail includes trips, stops and fares", () => {
    const { db } = fixture();
    addFare(db, ADMIN, { serviceId: "bus1", fromStopId: "a", toStopId: "c", amountInr: 15, source: "Conductor" });
    const d = getServiceDetail(db, "bus1")!;
    assert.equal(d.trips.length, 1);
    assert.equal(d.trips[0].stops.length, 3);
    assert.equal(d.fares[0].amountInr, 15);
    assert.equal(getServiceDetail(db, "nope"), null);
  });
});

describe("importer respects human review", () => {
  const bus = (vehicle: string, ...stops: [string, string][]) => ({
    "Vehicle Number": vehicle,
    schedule: [{ trip: 1, stations: stops.map(([station, t]) => ({ station, arrivalTime: t, departureTime: t })) }],
  });
  const data = () => ({ busSchedules: [bus("KL 1 A 1", ["FEROKE", "07:00 am"], ["BEYPORE", "07:30 am"]), bus("KL 1 A 2", ["FEROKE", "08:00 am"], ["BEYPORE", "08:30 am"])] });

  it("skips verified, edited and rejected buses on re-import and says how many", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, data());
    verifyService(db, ADMIN, "krpb-kl-1-a-1", { source: "Operator timetable" });
    const trip = row(db, "SELECT id FROM trips WHERE service_id = 'krpb-kl-1-a-2'").id as number;
    updateTripTimes(db, ADMIN, trip, [{ seq: 0, arrivalMin: hm(8, 5), departureMin: hm(8, 5) }]);
    const changed = { busSchedules: [bus("KL 1 A 1", ["FEROKE", "09:00 am"], ["BEYPORE", "09:30 am"]), bus("KL 1 A 2", ["FEROKE", "10:00 am"], ["BEYPORE", "10:30 am"]), bus("KL 1 A 3", ["FEROKE", "11:00 am"], ["BEYPORE", "11:30 am"])] };
    const s = importKeralaPrivateBus(db, changed);
    assert.equal(s.skippedProtected, 2);
    assert.equal(s.buses, 1); // only the new bus
    assert.equal(row(db, "SELECT departure_min FROM trip_stops WHERE trip_id = (SELECT id FROM trips WHERE service_id = 'krpb-kl-1-a-1')  AND seq = 0").departure_min, hm(7));
    assert.equal(row(db, "SELECT data_status FROM services WHERE id = 'krpb-kl-1-a-1'").data_status, "verified");
    assert.equal(row(db, "SELECT departure_min FROM trip_stops WHERE trip_id = ? AND seq = 0", trip).departure_min, hm(8, 5));
  });

  it("does not resurrect a rejected bus", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, data());
    rejectService(db, ADMIN, "krpb-kl-1-a-1", { reason: "not a real route" });
    importKeralaPrivateBus(db, data());
    assert.equal(searchJourneys(db, "imp-feroke", "imp-beypore").direct.length, 1); // only A2
  });
});
