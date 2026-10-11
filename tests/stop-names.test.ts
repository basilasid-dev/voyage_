import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMPORT_SOURCE, importKeralaPrivateBus } from "../src/lib/importers/kerala-private-bus";
import { canonicalKey, editDistance, normalizeStopName, STOP_ALIASES } from "../src/lib/importers/stop-names";
import { searchJourneys } from "../src/lib/db/search-core";
import { looseKey, matchStops, similarStops, stopLabels } from "../src/lib/stop-match";
import type { Stop } from "../src/lib/types";
import { memoryDb } from "./helpers";

const st = (station: string, time: string) => ({ station, arrivalTime: time, departureTime: time });
const bus = (vehicle: string, ...stations: [string, string][]) => ({
  "Vehicle Number": vehicle,
  schedule: [{ trip: 1, stations: stations.map(([n, t]) => st(n, t)) }],
});
const stopCount = (db: ReturnType<typeof memoryDb>) =>
  (db.prepare("SELECT COUNT(*) AS n FROM stops").get() as { n: number }).n;

describe("stop name normalization", () => {
  it("folds case, dots and spacing", () => {
    assert.equal(canonicalKey("KODUVALLY."), canonicalKey("Koduvally"));
    assert.equal(canonicalKey("R.E.C"), canonicalKey("REC"));
    assert.equal(canonicalKey("NOORAM THODE"), canonicalKey("NOORAMTHODE"));
    assert.equal(normalizeStopName("  Kolathara   Chungam. "), "KOLATHARA CHUNGAM");
  });

  it("applies reviewed spelling aliases", () => {
    assert.equal(canonicalKey("KUNNAMANGALM"), canonicalKey("KUNNAMANGALAM"));
    assert.equal(canonicalKey("KOZHIKODE"), canonicalKey("KOZHIKKODE"));
    assert.equal(canonicalKey("MUKKOM"), canonicalKey("MUKKAM"));
  });

  it("does NOT merge names that may be different physical stops", () => {
    const keys = ["CITY", "KOZHIKKODE", "KOZHIKODE CITY", "CITY STAND", "RAILWAY STATION", "RAILWAY STATION KOZHIKODE"].map(
      canonicalKey,
    );
    assert.equal(new Set(keys).size, keys.length);
    // Different places with similar spelling stay separate too.
    assert.notEqual(canonicalKey("MAVOOR"), canonicalKey("MOKAVOOR"));
    assert.notEqual(canonicalKey("PALANGAD"), canonicalKey("PAVANGAD"));
    assert.notEqual(canonicalKey("MEDICAL COLLEGE"), canonicalKey("MEDICL COLLEGE HOSTEL"));
  });

  it("every alias points to a different key and chains never loop", () => {
    for (const [from, to] of Object.entries(STOP_ALIASES)) {
      assert.notEqual(from, to);
      assert.equal(STOP_ALIASES[to], undefined, `${from} -> ${to} must point at a canonical key`);
    }
  });

  it("editDistance", () => {
    assert.equal(editDistance("kitten", "kitten"), 0);
    assert.equal(editDistance("mukkam", "mukkom"), 1);
    assert.ok(editDistance("abcdef", "uvwxyz", 2) > 2);
  });
});

describe("importer stop merging", () => {
  it("merges punctuation, spacing and alias variants into one stop", () => {
    const db = memoryDb();
    const s = importKeralaPrivateBus(db, {
      busSchedules: [
        bus("KL 1 A 1", ["KUNNAMANGALAM", "07:00 am"], ["KODUVALLY", "07:30 am"]),
        bus("KL 1 A 2", ["KUNNAMANGALM", "08:00 am"], ["KODUVALLY.", "08:30 am"]),
        bus("KL 1 A 3", ["KUNNAMANGALAM", "09:00 am"], ["KODU VALLY", "09:30 am"]),
      ],
    });
    assert.equal(stopCount(db), 2);
    assert.equal(s.mergedNameVariants, 3);
    assert.equal(searchJourneys(db, "imp-kunnamangalam", "imp-koduvally").direct.length, 3);
  });

  it("uses the most common spelling as the display name", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, {
      busSchedules: [
        bus("KL 1 B 1", ["KUNNAMANGALAM", "07:00 am"], ["FEROKE", "07:30 am"]),
        bus("KL 1 B 2", ["KUNNAMANGALAM", "08:00 am"], ["FEROKE", "08:30 am"]),
        bus("KL 1 B 3", ["KUNNAMANGALM", "09:00 am"], ["FEROKE", "09:30 am"]),
      ],
    });
    const row = db.prepare("SELECT name_en FROM stops WHERE id = 'imp-kunnamangalam'").get() as { name_en: string };
    assert.equal(row.name_en, "Kunnamangalam");
  });

  it("does not create a false transfer between similarly named but different stops", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, {
      busSchedules: [
        bus("KL 2 A 1", ["MUKKAM", "07:00 am"], ["CITY", "07:40 am"]),
        bus("KL 2 A 2", ["KOZHIKKODE", "07:50 am"], ["BALUSSERI", "08:30 am"]), // CITY != KOZHIKKODE
      ],
    });
    const r = searchJourneys(db, "imp-mukkam", "imp-balusseri");
    assert.equal(r.direct.length + r.transfers.length, 0);
  });

  it("does create the transfer once the variants really are the same stop", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, {
      busSchedules: [
        bus("KL 2 B 1", ["MUKKOM", "07:00 am"], ["KUNNAMANGALM", "07:40 am"]),
        bus("KL 2 B 2", ["KUNNAMANGALAM", "07:50 am"], ["BALUSSERI", "08:30 am"]),
      ],
    });
    const r = searchJourneys(db, "imp-mukkam", "imp-balusseri");
    assert.equal(r.transfers.length, 1);
    assert.equal(r.transfers[0].waitMin, 10);
  });

  it("reports near-duplicate names for review but never merges them", () => {
    const db = memoryDb();
    const s = importKeralaPrivateBus(db, {
      busSchedules: [
        bus("KL 3 A 1", ["PERUMANNA", "07:00 am"], ["PERUMANA", "07:30 am"]),
        bus("KL 3 A 2", ["PERUMANNA", "08:00 am"], ["FEROKE", "08:30 am"]),
      ],
    });
    assert.equal(stopCount(db), 3);
    assert.ok(s.possibleDuplicates.some((d) => [d.a, d.b].sort().join() === "Perumana,Perumanna"));
  });

  it("adds Malayalam names for known stops and leaves others empty", () => {
    const db = memoryDb();
    importKeralaPrivateBus(db, { busSchedules: [bus("KL 4 A 1", ["FEROKE", "07:00 am"], ["SOMEWHERE ODD", "07:30 am"])] });
    const rows = db.prepare("SELECT id, name_ml FROM stops ORDER BY id").all() as { id: string; name_ml: string | null }[];
    assert.deepEqual(rows, [
      { id: "imp-feroke", name_ml: "ഫറോക്ക്" },
      { id: "imp-somewhereodd", name_ml: null },
    ]);
  });

  it("removes stale imported stops but keeps ones that still have fares", () => {
    const db = memoryDb();
    const ins = db.prepare("INSERT INTO stops (id, name_en, data_status, source) VALUES (?, ?, 'unverified', ?)");
    ins.run("imp-old-style-id", "Old", IMPORT_SOURCE);
    ins.run("imp-with-fare", "With Fare", IMPORT_SOURCE);
    ins.run("imp-other", "Other", IMPORT_SOURCE);
    db.prepare("INSERT INTO fares (from_stop_id, to_stop_id, amount_inr, data_status) VALUES ('imp-with-fare','imp-other',10,'verified')").run();
    importKeralaPrivateBus(db, { busSchedules: [bus("KL 5 A 1", ["FEROKE", "07:00 am"], ["BEYPORE", "07:30 am"])] });
    const ids = (db.prepare("SELECT id FROM stops ORDER BY id").all() as { id: string }[]).map((r) => r.id);
    assert.deepEqual(ids, ["imp-beypore", "imp-feroke", "imp-other", "imp-with-fare"]);
  });

  it("is still idempotent with merging enabled", () => {
    const db = memoryDb();
    const data = {
      busSchedules: [
        bus("KL 6 A 1", ["KUNNAMANGALM", "07:00 am"], ["KODUVALLY.", "07:30 am"]),
        bus("KL 6 A 2", ["R.E.C", "08:00 am"], ["REC", "08:30 am"]), // same stop twice in a row -> too short, skipped
      ],
    };
    importKeralaPrivateBus(db, data);
    const snap = ["stops", "services", "trips", "trip_stops"].map(
      (t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n,
    );
    importKeralaPrivateBus(db, data);
    const again = ["stops", "services", "trips", "trip_stops"].map(
      (t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n,
    );
    assert.deepEqual(again, snap);
  });
});

const S = (id: string, nameEn: string, nameMl: string | null = null, dataStatus: Stop["dataStatus"] = "unverified"): Stop => ({
  id,
  nameEn,
  nameMl,
  dataStatus,
});
const STOPS = [
  S("a", "Kozhikkode", "കോഴിക്കോട്"),
  S("b", "City"),
  S("c", "Kozhikode City"),
  S("d", "Mukkam", "മുക്കം"),
  S("e", "Medical College", "മെഡിക്കൽ കോളേജ്"),
  S("f", "Feroke"),
  S("g", "Koduvally"),
];

describe("stop picker matching", () => {
  const names = (q: string) => matchStops(q, STOPS, "en").map((s) => s.nameEn);

  it("returns everything alphabetically for an empty query", () => {
    assert.equal(names("").length, STOPS.length);
    assert.equal(names("")[0], "City");
  });
  it("matches prefixes, inner words and case-insensitively", () => {
    assert.equal(names("MED")[0], "Medical College");
    assert.ok(names("college").includes("Medical College"));
    assert.ok(names("  feroke ").includes("Feroke"));
  });
  it("tolerates spelling variations", () => {
    assert.ok(names("kozhikode").includes("Kozhikkode"));
    assert.ok(names("mukkom").includes("Mukkam"));
    assert.ok(names("koduvalli").includes("Koduvally"));
    assert.ok(names("medicl").includes("Medical College"));
    assert.ok(names("calicut").includes("Kozhikkode"));
  });
  it("ranks a same-name spelling variant above longer names that merely start with the text", () => {
    assert.equal(names("kozhikode")[0], "Kozhikkode"); // before "Kozhikode City"
    assert.equal(names("kozhikode")[1], "Kozhikode City");
  });
  it("matches Malayalam text", () => {
    assert.deepEqual(matchStops("മുക്ക", STOPS, "ml").map((s) => s.id), ["d"]);
  });
  it("returns nothing for unrelated input", () => {
    assert.deepEqual(names("zzzzqq"), []);
  });
  it("looseKey folds the usual variants", () => {
    assert.equal(looseKey("Kozhikkode"), looseKey("Kozhikode"));
    assert.equal(looseKey("Koolimadu"), looseKey("Kulimadu"));
  });
});

describe("similar stops and labels", () => {
  it("suggests stops that may be the same place, never the stop itself", () => {
    const ids = similarStops(STOPS[1], STOPS).map((s) => s.id); // City
    assert.ok(ids.includes("c"));
    assert.ok(!ids.includes("b"));
    assert.ok(similarStops(STOPS[0], STOPS).map((s) => s.id).includes("c")); // Kozhikkode ~ Kozhikode City
  });
  it("does not suggest unrelated stops", () => {
    assert.deepEqual(similarStops(STOPS[5], STOPS), []); // Feroke
  });
  it("labels identically named stops by data status", () => {
    const stops = [S("x", "Medical College", null, "demo"), S("y", "Medical College", null, "unverified"), S("z", "Feroke")];
    const l = stopLabels(stops, "en", (s) => s.dataStatus);
    assert.equal(l.get("x"), "Medical College (demo)");
    assert.equal(l.get("y"), "Medical College (unverified)");
    assert.equal(l.get("z"), "Feroke");
  });
});
