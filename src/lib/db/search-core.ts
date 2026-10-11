// Route search logic. Takes the database as a parameter so it can be unit-tested with an
// in-memory DB. The app itself calls it through search.ts (server-only).
import type Database from "better-sqlite3";
import type { DataStatus, Fare, Journey, Leg, SearchResult, Stop } from "../types";

export const MIN_TRANSFER_MIN = 5;
export const MAX_TRANSFER_MIN = 120;
const MAX_DIRECT = 40;
const MAX_TRANSFERS = 15;

export interface SearchOptions {
  /** Only trips whose boarding time is at or after this many minutes after midnight. */
  afterMin?: number;
}

interface DirectRow {
  service_id: string;
  verified_at: string | null;
  verified_source: string | null;
  trip_id: number;
  service_name: string;
  vehicle_number: string | null;
  data_status: DataStatus;
  source: string | null;
  dep: number;
  arr: number;
  hops: number;
}

interface TransferRow {
  mid_stop: string;
  s1_id: string;
  s1_verified_at: string | null;
  s1_verified_source: string | null;
  s2_id: string;
  s2_verified_at: string | null;
  s2_verified_source: string | null;
  t1: number;
  s1_name: string;
  s1_vehicle: string | null;
  s1_status: DataStatus;
  s1_source: string | null;
  dep1: number;
  arr1: number;
  hops1: number;
  t2: number;
  s2_name: string;
  s2_vehicle: string | null;
  s2_status: DataStatus;
  s2_source: string | null;
  dep2: number;
  arr2: number;
  hops2: number;
}

// Boarding time = departure at the boarding stop (falls back to arrival if absent).
// Arrival time = arrival at the destination stop (falls back to departure).
// All values are bound as named parameters; nothing is interpolated into the SQL.
const DIRECT_SQL = `
SELECT t.id AS trip_id, s.id AS service_id, s.verified_at, s.verified_source,
       s.name AS service_name, s.vehicle_number, s.data_status, s.source,
       COALESCE(a.departure_min, a.arrival_min) AS dep,
       COALESCE(b.arrival_min, b.departure_min) AS arr,
       b.seq - a.seq AS hops
FROM trip_stops a
JOIN trip_stops b ON b.trip_id = a.trip_id AND b.seq > a.seq
JOIN trips t ON t.id = a.trip_id
JOIN services s ON s.id = t.service_id
WHERE a.stop_id = @from AND b.stop_id = @to
  AND s.rejected_at IS NULL
  AND COALESCE(a.departure_min, a.arrival_min) >= @after
  AND COALESCE(b.arrival_min, b.departure_min) IS NOT NULL
ORDER BY dep, arr, t.id
LIMIT @limit`;

const TRANSFER_SQL = `
SELECT m1.stop_id AS mid_stop,
       s1.id AS s1_id, s1.verified_at AS s1_verified_at, s1.verified_source AS s1_verified_source,
       s2.id AS s2_id, s2.verified_at AS s2_verified_at, s2.verified_source AS s2_verified_source,
       t1.id AS t1, s1.name AS s1_name, s1.vehicle_number AS s1_vehicle, s1.data_status AS s1_status, s1.source AS s1_source,
       COALESCE(a.departure_min, a.arrival_min) AS dep1,
       COALESCE(m1.arrival_min, m1.departure_min) AS arr1,
       m1.seq - a.seq AS hops1,
       t2.id AS t2, s2.name AS s2_name, s2.vehicle_number AS s2_vehicle, s2.data_status AS s2_status, s2.source AS s2_source,
       COALESCE(m2.departure_min, m2.arrival_min) AS dep2,
       COALESCE(b.arrival_min, b.departure_min) AS arr2,
       b.seq - m2.seq AS hops2
FROM trip_stops a
JOIN trip_stops m1 ON m1.trip_id = a.trip_id AND m1.seq > a.seq AND m1.stop_id NOT IN (@from, @to)
JOIN trip_stops m2 ON m2.stop_id = m1.stop_id AND m2.trip_id <> m1.trip_id
JOIN trip_stops b  ON b.trip_id = m2.trip_id AND b.seq > m2.seq
JOIN trips t1 ON t1.id = a.trip_id
JOIN trips t2 ON t2.id = m2.trip_id
JOIN services s1 ON s1.id = t1.service_id
JOIN services s2 ON s2.id = t2.service_id
WHERE a.stop_id = @from AND b.stop_id = @to
  AND s1.rejected_at IS NULL AND s2.rejected_at IS NULL
  AND COALESCE(a.departure_min, a.arrival_min) >= @after
  AND COALESCE(m1.arrival_min, m1.departure_min) IS NOT NULL
  AND COALESCE(m2.departure_min, m2.arrival_min) IS NOT NULL
  AND COALESCE(b.arrival_min, b.departure_min) IS NOT NULL
  AND COALESCE(m2.departure_min, m2.arrival_min)
      BETWEEN COALESCE(m1.arrival_min, m1.departure_min) + @minWait
          AND COALESCE(m1.arrival_min, m1.departure_min) + @maxWait
ORDER BY arr2, dep1, t1.id, t2.id
LIMIT 2000`;

// A service-specific fare wins over a generic (service_id IS NULL) one.
const FARE_SQL = `
SELECT f.amount_inr, f.data_status, f.source, f.verified_at, f.verified_source
FROM fares f
JOIN trips t ON t.id = @tripId
WHERE f.from_stop_id = @from AND f.to_stop_id = @to
  AND f.rejected_at IS NULL
  AND (f.service_id = t.service_id OR f.service_id IS NULL)
ORDER BY f.service_id IS NULL
LIMIT 1`;

export function searchJourneys(
  db: Database.Database,
  from: string,
  to: string,
  opts: SearchOptions = {},
): SearchResult {
  const after = opts.afterMin ?? 0;
  const fareStmt = db.prepare(FARE_SQL);

  const fareFor = (tripId: number, f: string, t: string): Fare | null => {
    const r = fareStmt.get({ tripId, from: f, to: t }) as
      | {
          amount_inr: number;
          data_status: DataStatus;
          source: string | null;
          verified_at: string | null;
          verified_source: string | null;
        }
      | undefined;
    return r
      ? {
          amountInr: r.amount_inr,
          dataStatus: r.data_status,
          source: r.source,
          verifiedAt: r.verified_at,
          verifiedSource: r.verified_source,
        }
      : null;
  };

  const leg = (
    serviceId: string,
    verifiedAt: string | null,
    verifiedSource: string | null,
    tripId: number,
    name: string,
    vehicle: string | null,
    status: DataStatus,
    source: string | null,
    f: string,
    t: string,
    dep: number,
    arr: number,
    hops: number,
  ): Leg => ({
    serviceId,
    verifiedAt,
    verifiedSource,
    tripId,
    serviceName: name,
    vehicleNumber: vehicle,
    dataStatus: status,
    source,
    fromStopId: f,
    toStopId: t,
    departureMin: dep,
    arrivalMin: arr,
    stopsCount: hops,
    fare: fareFor(tripId, f, t),
  });

  const totalFare = (legs: Leg[]) =>
    legs.every((l) => l.fare) ? legs.reduce((sum, l) => sum + l.fare!.amountInr, 0) : null;

  const direct: Journey[] = [];
  const seenDirect = new Set<string>();
  for (const r of db.prepare(DIRECT_SQL).all({ from, to, after, limit: MAX_DIRECT * 3 }) as DirectRow[]) {
    // The same bus can list the same stop twice (loops): keep one row per trip.
    if (seenDirect.has(String(r.trip_id))) continue;
    seenDirect.add(String(r.trip_id));
    const l = leg(r.service_id, r.verified_at, r.verified_source, r.trip_id, r.service_name, r.vehicle_number, r.data_status, r.source, from, to, r.dep, r.arr, r.hops);
    direct.push({ legs: [l], transferStopId: null, waitMin: null, totalFareInr: totalFare([l]) });
    if (direct.length >= MAX_DIRECT) break;
  }

  const seen = new Set<string>();
  const transfers: Journey[] = [];
  const rows = db
    .prepare(TRANSFER_SQL)
    .all({ from, to, after, minWait: MIN_TRANSFER_MIN, maxWait: MAX_TRANSFER_MIN }) as TransferRow[];
  for (const r of rows) {
    const key = `${r.t1}-${r.t2}`;
    if (seen.has(key)) continue; // same bus pair via another shared stop: keep the earliest
    seen.add(key);
    // A change is pointless if a direct bus leaves no earlier and arrives no later.
    if (direct.some((d) => d.legs[0].departureMin >= r.dep1 && d.legs[0].arrivalMin <= r.arr2)) continue;
    const l1 = leg(r.s1_id, r.s1_verified_at, r.s1_verified_source, r.t1, r.s1_name, r.s1_vehicle, r.s1_status, r.s1_source, from, r.mid_stop, r.dep1, r.arr1, r.hops1);
    const l2 = leg(r.s2_id, r.s2_verified_at, r.s2_verified_source, r.t2, r.s2_name, r.s2_vehicle, r.s2_status, r.s2_source, r.mid_stop, to, r.dep2, r.arr2, r.hops2);
    transfers.push({
      legs: [l1, l2],
      transferStopId: r.mid_stop,
      waitMin: r.dep2 - r.arr1,
      totalFareInr: totalFare([l1, l2]),
    });
    if (transfers.length >= MAX_TRANSFERS) break;
  }

  const ids = new Set<string>([from, to]);
  for (const j of transfers) if (j.transferStopId) ids.add(j.transferStopId);
  const idList = [...ids];
  const stopRows = db
    .prepare(
      `SELECT id, name_en, name_ml, data_status FROM stops WHERE id IN (${idList.map(() => "?").join(",")})`,
    )
    .all(...idList) as { id: string; name_en: string; name_ml: string | null; data_status: DataStatus }[];
  const stops: Record<string, Stop> = Object.fromEntries(
    stopRows.map((s) => [s.id, { id: s.id, nameEn: s.name_en, nameMl: s.name_ml, dataStatus: s.data_status }]),
  );

  return { direct, transfers, stops };
}
