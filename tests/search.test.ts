import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_TRANSFER_MIN, MIN_TRANSFER_MIN, searchJourneys } from "../src/lib/db/search-core";
import { openDb } from "../src/lib/db/connection";
import { seedDemoData } from "../src/lib/db/seed";
import { addFare, addTrip, hm, memoryDb } from "./helpers";

describe("direct journeys", () => {
  it("finds a bus that visits both stops in order, with boarding/arrival times", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["b", hm(7, 10), hm(7, 11)], ["c", hm(7, 30), null]]);
    const r = searchJourneys(db, "a", "c");
    assert.equal(r.direct.length, 1);
    const leg = r.direct[0].legs[0];
    assert.equal(leg.departureMin, hm(7));
    assert.equal(leg.arrivalMin, hm(7, 30));
    assert.equal(leg.stopsCount, 2);
    assert.equal(r.stops["a"].nameEn, "A");
  });

  it("does not return buses running the opposite direction", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["b", hm(7, 20), null]]);
    assert.equal(searchJourneys(db, "b", "a").direct.length, 0);
  });

  it("sorts by departure time and respects the 'leave after' filter", () => {
    const db = memoryDb();
    addTrip(db, "late", [["a", null, hm(9)], ["b", hm(9, 20), null]]);
    addTrip(db, "early", [["a", null, hm(6)], ["b", hm(6, 20), null]]);
    addTrip(db, "mid", [["a", null, hm(8)], ["b", hm(8, 20), null]]);
    assert.deepEqual(
      searchJourneys(db, "a", "b").direct.map((j) => j.legs[0].serviceName),
      ["early", "mid", "late"],
    );
    assert.deepEqual(
      searchJourneys(db, "a", "b", { afterMin: hm(8) }).direct.map((j) => j.legs[0].serviceName),
      ["mid", "late"],
    );
  });

  it("returns a trip once even if the bus loops through the same stop twice", () => {
    const db = memoryDb();
    addTrip(db, "loop", [["a", null, hm(7)], ["b", hm(7, 5), hm(7, 5)], ["a", hm(7, 10), hm(7, 11)], ["b", hm(7, 20), null]]);
    assert.equal(searchJourneys(db, "a", "b").direct.length, 1);
  });

  it("works with stops that only have an arrival or only a departure time", () => {
    const db = memoryDb();
    addTrip(db, "x", [["a", hm(7), null], ["b", null, hm(7, 40)]]);
    const leg = searchJourneys(db, "a", "b").direct[0].legs[0];
    assert.equal(leg.departureMin, hm(7));
    assert.equal(leg.arrivalMin, hm(7, 40));
  });
});

describe("one-transfer journeys", () => {
  const build = () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["m", hm(7, 30), hm(7, 30)], ["z", hm(7, 50), null]]);
    return db;
  };

  it("connects two buses at a shared stop when the wait is within limits", () => {
    const db = build();
    addTrip(db, "bus2", [["m", null, hm(7, 45)], ["b", hm(8, 10), null]]);
    const r = searchJourneys(db, "a", "b");
    assert.equal(r.direct.length, 0);
    assert.equal(r.transfers.length, 1);
    const j = r.transfers[0];
    assert.equal(j.transferStopId, "m");
    assert.equal(j.waitMin, 15);
    assert.equal(j.legs[0].toStopId, "m");
    assert.equal(j.legs[1].fromStopId, "m");
    assert.equal(r.stops["m"].nameEn, "M");
  });

  it("rejects connections that are too tight, too long, or leave before arrival", () => {
    const db = build();
    addTrip(db, "tight", [["m", null, hm(7, 30 + MIN_TRANSFER_MIN - 1)], ["b", hm(8), null]]);
    addTrip(db, "long", [["m", null, hm(7, 30) + MAX_TRANSFER_MIN + 1], ["b", hm(10), null]]);
    addTrip(db, "gone", [["m", null, hm(7, 10)], ["b", hm(7, 40), null]]);
    assert.equal(searchJourneys(db, "a", "b").transfers.length, 0);
  });

  it("accepts the exact boundary waits", () => {
    const db = build();
    addTrip(db, "min", [["m", null, hm(7, 30) + MIN_TRANSFER_MIN], ["b", hm(8), null]]);
    addTrip(db, "max", [["m", null, hm(7, 30) + MAX_TRANSFER_MIN], ["b", hm(10), null]]);
    assert.equal(searchJourneys(db, "a", "b").transfers.length, 2);
  });

  it("never 'transfers' onto the same trip or at the origin/destination", () => {
    const db = build();
    // Second bus only shares the origin and destination of the query with bus1.
    addTrip(db, "other", [["a", null, hm(7, 40)], ["b", hm(8), null]]);
    const r = searchJourneys(db, "a", "z");
    assert.equal(r.direct.length, 1);
    assert.equal(r.transfers.length, 0);
  });

  it("lists a bus pair once even if they share several stops", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["m1", hm(7, 10), hm(7, 10)], ["m2", hm(7, 20), hm(7, 20)]]);
    addTrip(db, "bus2", [["m1", null, hm(7, 20)], ["m2", hm(7, 30), hm(7, 30)], ["b", hm(7, 40), null]]);
    assert.equal(searchJourneys(db, "a", "b").transfers.length, 1);
  });

  it("hides a change when a direct bus is at least as good, keeps it when it is faster", () => {
    const db = memoryDb();
    addTrip(db, "direct", [["a", null, hm(7, 10)], ["b", hm(8, 0), null]]); // 7:10 -> 8:00
    addTrip(db, "x1", [["a", null, hm(7)], ["m", hm(7, 20), hm(7, 20)]]);
    addTrip(db, "x2", [["m", null, hm(7, 30)], ["b", hm(8, 5), null]]); // 7:00 -> 8:05: direct is later but arrives earlier
    addTrip(db, "y1", [["a", null, hm(6, 30)], ["n", hm(6, 40), hm(6, 40)]]);
    addTrip(db, "y2", [["n", null, hm(6, 50)], ["b", hm(7, 30), null]]); // 6:30 -> 7:30: beats the direct bus
    const r = searchJourneys(db, "a", "b");
    assert.equal(r.direct.length, 1);
    assert.deepEqual(
      r.transfers.map((j) => j.legs.map((l) => l.serviceName).join(">")),
      ["y1>y2"],
    );
  });

  it("honours the 'leave after' filter on the first leg", () => {
    const db = build();
    addTrip(db, "bus2", [["m", null, hm(7, 45)], ["b", hm(8, 10), null]]);
    assert.equal(searchJourneys(db, "a", "b", { afterMin: hm(7, 1) }).transfers.length, 0);
  });
});

describe("fares", () => {
  it("only reports fares that exist; unknown fares are null, never guessed", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["b", hm(7, 20), null]]);
    const j = searchJourneys(db, "a", "b").direct[0];
    assert.equal(j.legs[0].fare, null);
    assert.equal(j.totalFareInr, null);
  });

  it("prefers a service-specific fare over a generic one and keeps its status", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["b", hm(7, 20), null]]);
    addFare(db, null, "a", "b", 20, "verified");
    addFare(db, "bus1", "a", "b", 15, "demo");
    const fare = searchJourneys(db, "a", "b").direct[0].legs[0].fare;
    assert.deepEqual([fare?.amountInr, fare?.dataStatus], [15, "demo"]);
  });

  it("sums transfer fares only when every leg has a fare", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["m", hm(7, 20), hm(7, 20)]]);
    addTrip(db, "bus2", [["m", null, hm(7, 30)], ["b", hm(7, 50), null]]);
    addFare(db, "bus1", "a", "m", 10);
    assert.equal(searchJourneys(db, "a", "b").transfers[0].totalFareInr, null);
    addFare(db, "bus2", "m", "b", 12);
    assert.equal(searchJourneys(db, "a", "b").transfers[0].totalFareInr, 22);
  });
});

describe("safety", () => {
  it("treats hostile stop ids as plain data", () => {
    const db = memoryDb();
    addTrip(db, "bus1", [["a", null, hm(7)], ["b", hm(7, 20), null]]);
    const r = searchJourneys(db, "a' OR '1'='1", "b");
    assert.equal(r.direct.length + r.transfers.length, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM trips").get() as { n: number }).n, 1);
  });
});

describe("demo seed", () => {
  it("is idempotent, labelled demo everywhere, and supports the documented example searches", () => {
    const db = openDb(":memory:");
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM trips").get() as { n: number }).n;
    const before = count();
    assert.ok(before > 0);
    seedDemoData(db); // re-running the seed must not duplicate anything
    assert.equal(count(), before);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM stops WHERE data_status <> 'demo'").get() as { n: number }).n,
      0,
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM fares WHERE data_status <> 'demo'").get() as { n: number }).n,
      0,
    );

    const direct = searchJourneys(db, "mananchira", "kunnamangalam");
    assert.ok(direct.direct.length > 0);
    assert.ok(direct.direct.every((j) => j.legs.every((l) => l.dataStatus === "demo" && l.fare?.dataStatus === "demo")));

    const transfer = searchJourneys(db, "beypore", "medical-college");
    assert.equal(transfer.direct.length, 0);
    assert.ok(transfer.transfers.length > 0);

    assert.equal(searchJourneys(db, "vellayil", "beypore").transfers.length, 0);
  });
});
