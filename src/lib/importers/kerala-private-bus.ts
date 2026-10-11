// Adapter for the community dataset "Kerala-Private-Bus-Timing" (kozhikkode.json),
// https://github.com/amith-vp/Kerala-Private-Bus-Timing
//
// Format (checked against kozhikkode.json, 647 buses / 9,290 trips):
//   { "busSchedules": [ { "Vehicle Number": "KL 57 B 6566", "route": [...],
//       "schedule": [ { "trip": 1, "stations": [ { "station", "arrivalTime", "departureTime" } ] } ] } ] }
// Times look like "07:10 am" (sometimes "07:10am"). The dataset has no fares and its README warns of
// PDF-parsing errors, so everything imported is stored with data_status = 'unverified' and no fare
// rows are created. This module never downloads anything; it only reads JSON you pass in.
//
// Safe to re-run: buses a person verified/edited/rejected are skipped, a bus's trips are replaced as a whole
// (keyed by vehicle number), stops are keyed by
// a normalized name, identical trips within a bus are stored once, stops no longer used are removed,
// and the whole import is one transaction (a malformed file changes nothing).
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { canonicalKey, displayName, findPossibleDuplicates, MALAYALAM_NAMES, normalizeStopName } from "./stop-names";

export const IMPORT_SOURCE = "kerala-private-bus-timing (RTI PDF conversion, unverified)";
export const META_KEY = "import:kerala-private-bus";

interface RawStation {
  station?: unknown;
  arrivalTime?: unknown;
  departureTime?: unknown;
}
interface RawTrip {
  trip?: unknown;
  stations?: unknown;
}
interface RawBus {
  "Vehicle Number"?: unknown;
  schedule?: unknown;
}

export interface ImportSummary {
  buses: number;
  trips: number;
  stops: number;
  skippedTrips: number;
  duplicateTrips: number;
  /** Buses left untouched because a person verified, edited or rejected them (see admin review). */
  skippedProtected: number;
  /** Raw station spellings that were folded into another stop (punctuation, spacing, reviewed aliases). */
  mergedNameVariants: number;
  /** Pairs of different stops with near-identical names. Reported for review; never merged. */
  possibleDuplicates: { a: string; b: string; usesA: number; usesB: number }[];
}

/** "05:00 am" / "5:30PM" / "17:30" -> minutes after midnight, or null. */
export function parseTime(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.trim().toLowerCase().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);
const stopId = (key: string) => `imp-${key.toLowerCase()}`;

interface ParsedStop {
  id: string;
  arr: number | null;
  dep: number | null;
}

/**
 * Makes the times of a trip non-decreasing so trips running past midnight (e.g. 11:50 pm -> 12:20 am)
 * become 1430 -> 1460. Returns false if the trip still goes backwards afterwards (a parsing error).
 */
function unrollMidnight(stops: ParsedStop[]): boolean {
  let offset = 0;
  let last = -1;
  for (const s of stops) {
    for (const key of ["arr", "dep"] as const) {
      const v = s[key];
      if (v === null) continue;
      let x = v + offset;
      if (x < last) {
        if (last - x < 12 * 60) return false; // small step back = bad data, not midnight
        offset += 1440;
        x += 1440;
      }
      s[key] = x;
      last = x;
    }
  }
  return true;
}

export function importKeralaPrivateBus(db: Database.Database, json: unknown, fingerprint?: string): ImportSummary {
  const list = Array.isArray(json) ? json : (json as { busSchedules?: unknown })?.busSchedules;
  if (!Array.isArray(list)) throw new Error('Unrecognised format: expected {"busSchedules": [...]}');

  // Pass 1: choose a display name per stop key (the most common spelling) and count uses.
  const forms = new Map<string, Map<string, number>>(); // key -> normalized spelling -> count
  const uses = new Map<string, number>();
  const rawNames = new Set<string>();
  for (const bus of list as RawBus[]) {
    for (const trip of Array.isArray(bus?.schedule) ? (bus.schedule as RawTrip[]) : []) {
      for (const st of Array.isArray(trip?.stations) ? (trip.stations as RawStation[]) : []) {
        if (typeof st?.station !== "string") continue;
        const key = canonicalKey(st.station);
        if (!key) continue;
        rawNames.add(st.station.trim().toUpperCase());
        uses.set(key, (uses.get(key) ?? 0) + 1);
        const f = forms.get(key) ?? forms.set(key, new Map()).get(key)!;
        const norm = normalizeStopName(st.station);
        f.set(norm, (f.get(norm) ?? 0) + 1);
      }
    }
  }
  const display = new Map<string, string>();
  for (const [key, f] of forms) {
    // Prefer the spelling the dataset uses most; for aliased keys that is usually the canonical one.
    const best = [...f.entries()].sort((a, b) => b[1] - a[1])[0][0];
    display.set(key, displayName(best));
  }

  const insStop = db.prepare(
    "INSERT OR IGNORE INTO stops (id, name_en, name_ml, data_status, source) VALUES (?, ?, NULL, 'unverified', ?)",
  );
  const setMl = db.prepare("UPDATE stops SET name_ml = ? WHERE id = ? AND name_ml IS NULL");
  const upsertService = db.prepare(
    `INSERT INTO services (id, name, operator, vehicle_number, data_status, source) VALUES (?, ?, NULL, ?, 'unverified', ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, vehicle_number = excluded.vehicle_number, source = excluded.source`,
  );
  const delTrips = db.prepare("DELETE FROM trips WHERE service_id = ?");
  const protectedRow = db.prepare(
    "SELECT 1 FROM services WHERE id = ? AND (locked = 1 OR data_status = 'verified' OR rejected_at IS NOT NULL)",
  );
  const protectedSeen = new Set<string>();
  const insTrip = db.prepare("INSERT INTO trips (service_id, trip_no) VALUES (?, ?)");
  const insTripStop = db.prepare(
    "INSERT INTO trip_stops (trip_id, seq, stop_id, arrival_min, departure_min) VALUES (?, ?, ?, ?, ?)",
  );

  const summary: ImportSummary = {
    buses: 0,
    trips: 0,
    stops: 0,
    skippedTrips: 0,
    duplicateTrips: 0,
    skippedProtected: 0,
    mergedNameVariants: 0,
    possibleDuplicates: [],
  };
  const knownStops = new Set<string>();
  const clearedServices = new Set<string>();
  const seenTrips = new Map<string, Set<string>>(); // serviceId -> trip signatures

  db.transaction(() => {
    list.forEach((bus: RawBus, i) => {
      const vehicle = typeof bus["Vehicle Number"] === "string" ? clean(bus["Vehicle Number"]) : "";
      const schedule = Array.isArray(bus.schedule) ? (bus.schedule as RawTrip[]) : [];
      // Buses without a vehicle number get a stable id derived from their schedule, not their position.
      const serviceId = vehicle ? `krpb-${slug(vehicle)}` : `krpb-unnumbered-${shortHash(JSON.stringify(schedule))}`;
      const label = vehicle ? `Bus ${vehicle}` : `Bus (no number) ${i + 1}`;

      // Never overwrite work a person has done: verified, hand-edited or rejected buses are left as they are.
      if (protectedRow.get(serviceId)) {
        if (!protectedSeen.has(serviceId)) summary.skippedProtected++;
        protectedSeen.add(serviceId);
        return;
      }

      let touched = false;
      schedule.forEach((trip, ti) => {
        const stations = Array.isArray(trip.stations) ? (trip.stations as RawStation[]) : [];
        const stops: ParsedStop[] = [];
        for (const st of stations) {
          if (typeof st.station !== "string") continue;
          const key = canonicalKey(st.station);
          if (!key || key.length > 70) continue;
          const arr = parseTime(st.arrivalTime);
          const dep = parseTime(st.departureTime);
          if (arr === null && dep === null) continue; // unusable row
          const id = stopId(key);
          // Two consecutive rows for the same stop (e.g. after merging name variants) are one stop.
          const prev = stops[stops.length - 1];
          if (prev && prev.id === id) {
            prev.dep = dep ?? prev.dep;
            continue;
          }
          stops.push({ id, arr, dep });
        }
        if (stops.length < 2 || !unrollMidnight(stops)) {
          summary.skippedTrips++;
          return;
        }

        // Same bus listing an identical trip twice (as one vehicle number appears twice in the data).
        const sig = stops.map((s) => `${s.id}@${s.arr}@${s.dep}`).join("|");
        let sigs = seenTrips.get(serviceId);
        if (!sigs) seenTrips.set(serviceId, (sigs = new Set()));
        if (sigs.has(sig)) {
          summary.duplicateTrips++;
          return;
        }
        sigs.add(sig);

        if (!touched) {
          // First usable trip for this bus: register it. Replace its old trips once per import.
          upsertService.run(serviceId, label, vehicle || null, IMPORT_SOURCE);
          if (!clearedServices.has(serviceId)) {
            delTrips.run(serviceId);
            clearedServices.add(serviceId);
            summary.buses++;
          }
          touched = true;
        }
        for (const s of stops) {
          if (!knownStops.has(s.id)) {
            const key = s.id.slice(4).toUpperCase();
            insStop.run(s.id, display.get(key) ?? key, IMPORT_SOURCE);
            const ml = MALAYALAM_NAMES[key];
            if (ml) setMl.run(ml, s.id);
            knownStops.add(s.id);
          }
        }
        const tripId = Number(insTrip.run(serviceId, String(trip.trip ?? ti + 1)).lastInsertRowid);
        stops.forEach((s, seq) => insTripStop.run(tripId, seq, s.id, s.arr, s.dep));
        summary.trips++;
      });
    });

    // Stops from an earlier import (possibly under older ids) that nothing references any more.
    db.prepare(
      `DELETE FROM stops WHERE source = ? AND data_status = 'unverified'
         AND id NOT IN (SELECT stop_id FROM trip_stops) AND id NOT IN (SELECT from_stop_id FROM fares)
         AND id NOT IN (SELECT to_stop_id FROM fares)`,
    ).run(IMPORT_SOURCE);

    summary.stops = knownStops.size;
    summary.mergedNameVariants = Math.max(0, rawNames.size - forms.size);
    const names = new Map([...forms.keys()].map((k) => [k, display.get(k)!]));
    summary.possibleDuplicates = findPossibleDuplicates(names, uses);

    const { possibleDuplicates: _omit, ...stored } = summary;
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      META_KEY,
      JSON.stringify({ at: new Date().toISOString(), fingerprint: fingerprint ?? null, source: IMPORT_SOURCE, ...stored }),
    );
  })();

  return summary;
}

