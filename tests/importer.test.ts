import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importKeralaPrivateBus, parseTime } from "../src/lib/importers/kerala-private-bus";
import { openDb } from "../src/lib/db/connection";
import { searchJourneys } from "../src/lib/db/search-core";
import { memoryDb } from "./helpers";

const st = (station: string, arrivalTime: string, departureTime = arrivalTime) => ({ station, arrivalTime, departureTime });

const sample = () => ({
  busSchedules: [
    {
      "Vehicle Number": "KL 11 AB 1234",
      route: ["CITY", "FEROKE"],
      schedule: [
        { trip: 1, stations: [st("CITY", "07:00 am"), st("FEROKE", "07:30 am")] },
        { trip: 2, stations: [st("FEROKE", "07:40am"), st("CITY", "08:10 am")] },
        { trip: 3, stations: [st("CITY", "07:00 am"), st("FEROKE", "07:30 am")] }, // identical to trip 1
        { trip: 4, stations: [st("CITY", "09:00 am")] }, // too short
      ],
    },
    {
      "Vehicle Number": "KL 11 AB 1234", // same vehicle listed again in the file
      route: [],
      schedule: [{ trip: 1, stations: [st("CITY", "10:00 am"), st("FEROKE", "10:30 am")] }],
    },
    {
      "Vehicle Number": "KL 12 CD 9999",
      route: [],
      schedule: [{ trip: 1, stations: [st("FEROKE", "07:50 am"), st("RAMANATTUKARA", "08:10 am")] }],
    },
  ],
});

const n = (db: ReturnType<typeof memoryDb>, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("parseTime", () => {
  it("handles the dataset's formats", () => {
    assert.equal(parseTime("07:10 am"), 430);
    assert.equal(parseTime("07:10am"), 430);
    assert.equal(parseTime("7:10 PM"), 19 * 60 + 10);
    assert.equal(parseTime("12:05 am"), 5);
    assert.equal(parseTime("12:05 pm"), 12 * 60 + 5);
    assert.equal(parseTime("17:30"), 17 * 60 + 30);
  });
  it("rejects garbage", () => {
    for (const bad of ["", "abc", "13:00 pm", "07:75 am", "25:00", null, undefined, 5]) assert.equal(parseTime(bad), null);
  });
});

describe("importKeralaPrivateBus", () => {
  it("imports as unverified, creates no fares, skips short trips and duplicate trips", () => {
    const db = memoryDb();
    const s = importKeralaPrivateBus(db, sample());
    assert.equal(s.buses, 2);
    assert.equal(s.trips, 4);
    assert.equal(s.stops, 3);
    assert.equal(s.skippedTrips, 1);
    assert.equal(s.duplicateTrips, 1);
    assert.equal(n(db, "fares"), 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM services WHERE data_status <> 'unverified'").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stops WHERE data_status <> 'unverified'").get() as { n: number }).n, 0);
  });

  it("keeps trips from both entries of a repeated vehicle number", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, sample());
    const trips = db.prepare("SELECT COUNT(*) AS n FROM trips WHERE service_id = 'krpb-kl-11-ab-1234'").get() as { n: number };
    assert.equal(trips.n, 3);
  });

  it("is idempotent: re-importing creates no duplicates", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, sample());
    const snapshot = ["stops", "services", "trips", "trip_stops"].map((t) => n(db, t));
    importKeralaPrivateBus(db, sample());
    importKeralaPrivateBus(db, sample());
    assert.deepEqual(["stops", "services", "trips", "trip_stops"].map((t) => n(db, t)), snapshot);
  });

  it("is atomic: a failing import leaves the database unchanged", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, sample());
    const before = n(db, "trip_stops");
    const bad = sample();
    (bad.busSchedules as unknown[]).push(null); // makes the adapter throw mid-way
    assert.throws(() => importKeralaPrivateBus(db, bad));
    assert.equal(n(db, "trip_stops"), before);
    assert.throws(() => importKeralaPrivateBus(db, { nope: true }), /Unrecognised format/);
  });

  it("handles trips that run past midnight", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, {
      busSchedules: [{ "Vehicle Number": "KL 1 A 1", schedule: [{ trip: 1, stations: [st("CITY", "11:50 pm"), st("FEROKE", "12:20 am")] }] }],
    });
    const r = searchJourneys(db, "imp-city", "imp-feroke");
    assert.equal(r.direct.length, 1);
    assert.equal(r.direct[0].legs[0].arrivalMin - r.direct[0].legs[0].departureMin, 30);
  });

  it("drops trips whose times run backwards (parsing errors)", () => {
    const db = memoryDb();
    const s = importKeralaPrivateBus(db, {
      busSchedules: [{ "Vehicle Number": "KL 1 A 2", schedule: [{ trip: 1, stations: [st("CITY", "08:00 am"), st("FEROKE", "07:50 am")] }] }],
    });
    assert.equal(s.trips, 0);
    assert.equal(s.skippedTrips, 1);
  });

  it("gives buses without a vehicle number a stable id", () => {
    const db = memoryDb();
    const data = { busSchedules: [{ schedule: [{ trip: 1, stations: [st("CITY", "07:00 am"), st("FEROKE", "07:30 am")] }] }] };
    importKeralaPrivateBus(db, data);
    importKeralaPrivateBus(db, data);
    assert.equal(n(db, "services"), 1);
  });

  it("imported data is searchable, including a transfer, and shows no fare", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, sample());
    const direct = searchJourneys(db, "imp-city", "imp-feroke");
    assert.equal(direct.direct.length, 2); // 07:00 and 10:00; the 07:40 trip runs the other way
    assert.equal(direct.direct[0].legs[0].fare, null);
    // CITY -> FEROKE (07:30) then FEROKE -> RAMANATTUKARA departing 07:50: 20 min wait.
    const t = searchJourneys(db, "imp-city", "imp-ramanattukara");
    assert.equal(t.direct.length, 0);
    assert.ok(t.transfers.length >= 1);
    assert.equal(t.transfers[0].waitMin, 20);
    assert.equal(t.transfers[0].legs[0].dataStatus, "unverified");
  });

  it("coexists with the demo seed without touching it", () => {
    const db = openDb(":memory:");
    const demoTrips = n(db, "trips");
    importKeralaPrivateBus(db, sample());
    assert.equal(n(db, "trips"), demoTrips + 4);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM services WHERE data_status = 'demo'").get() as { n: number }).n, 6);
  });
});
