// Read-side queries for the admin dashboard. Parameterized SQL only; the database is a parameter.
import type Database from "better-sqlite3";
import { countReports, type ReportStatus } from "../reports";
import type { DataStatus } from "../types";
import { listAudit } from "./audit";

type DB = Database.Database;

export type ServiceFilter = DataStatus | "rejected" | "reported" | "all";

export interface ServiceListItem {
  id: string;
  name: string;
  vehicleNumber: string | null;
  dataStatus: DataStatus;
  rejectedAt: string | null;
  verifiedAt: string | null;
  locked: boolean;
  tripCount: number;
  openReports: number;
  source: string | null;
}

export function listServices(
  db: DB,
  opts: { filter?: ServiceFilter; q?: string; limit?: number; offset?: number } = {},
): { rows: ServiceListItem[]; total: number } {
  const filter = opts.filter ?? "all";
  const params = {
    filter,
    q: opts.q?.trim() ? `%${opts.q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%` : null,
    limit: Math.min(opts.limit ?? 25, 100),
    offset: opts.offset ?? 0,
  };
  const where = `
    WHERE (@q IS NULL OR s.name LIKE @q ESCAPE '\\' OR s.vehicle_number LIKE @q ESCAPE '\\' OR s.id LIKE @q ESCAPE '\\')
      AND (@filter = 'all'
        OR (@filter = 'rejected' AND s.rejected_at IS NOT NULL)
        OR (@filter = 'reported' AND EXISTS (SELECT 1 FROM reports r WHERE r.service_id = s.id AND r.status IN ('open','in_review')))
        OR (@filter IN ('demo','unverified','verified') AND s.data_status = @filter AND s.rejected_at IS NULL))`;
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM services s ${where}`).get({ filter: params.filter, q: params.q }) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.vehicle_number, s.data_status, s.rejected_at, s.verified_at, s.locked, s.source,
              (SELECT COUNT(*) FROM trips t WHERE t.service_id = s.id) AS trip_count,
              (SELECT COUNT(*) FROM reports r WHERE r.service_id = s.id AND r.status IN ('open','in_review')) AS open_reports
       FROM services s ${where}
       ORDER BY open_reports DESC, s.name COLLATE NOCASE LIMIT @limit OFFSET @offset`,
    )
    .all(params) as {
    id: string;
    name: string;
    vehicle_number: string | null;
    data_status: DataStatus;
    rejected_at: string | null;
    verified_at: string | null;
    locked: number;
    source: string | null;
    trip_count: number;
    open_reports: number;
  }[];
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      vehicleNumber: r.vehicle_number,
      dataStatus: r.data_status,
      rejectedAt: r.rejected_at,
      verifiedAt: r.verified_at,
      locked: r.locked === 1,
      tripCount: r.trip_count,
      openReports: r.open_reports,
      source: r.source,
    })),
  };
}

export interface ServiceDetail {
  service: {
    id: string;
    name: string;
    operator: string | null;
    vehicleNumber: string | null;
    dataStatus: DataStatus;
    source: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
    verifiedSource: string | null;
    reviewNote: string | null;
    updatedAt: string | null;
    rejectedAt: string | null;
    rejectedBy: string | null;
    locked: boolean;
  };
  trips: {
    id: number;
    tripNo: string | null;
    stops: { seq: number; stopId: string; stopName: string; arrivalMin: number | null; departureMin: number | null }[];
  }[];
  fares: {
    id: number;
    fromStopId: string;
    fromName: string;
    toStopId: string;
    toName: string;
    amountInr: number;
    dataStatus: DataStatus;
    source: string | null;
    verifiedAt: string | null;
    verifiedSource: string | null;
    rejectedAt: string | null;
  }[];
}

export function getServiceDetail(db: DB, id: string): ServiceDetail | null {
  const s = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!s) return null;
  const trips = db.prepare("SELECT id, trip_no FROM trips WHERE service_id = ? ORDER BY id").all(id) as { id: number; trip_no: string | null }[];
  const stopRows = db
    .prepare(
      `SELECT ts.trip_id, ts.seq, ts.stop_id, st.name_en, ts.arrival_min, ts.departure_min
       FROM trip_stops ts JOIN stops st ON st.id = ts.stop_id
       WHERE ts.trip_id IN (SELECT id FROM trips WHERE service_id = ?) ORDER BY ts.trip_id, ts.seq`,
    )
    .all(id) as { trip_id: number; seq: number; stop_id: string; name_en: string; arrival_min: number | null; departure_min: number | null }[];
  const byTrip = new Map<number, ServiceDetail["trips"][number]["stops"]>();
  for (const r of stopRows) {
    const list = byTrip.get(r.trip_id) ?? [];
    list.push({ seq: r.seq, stopId: r.stop_id, stopName: r.name_en, arrivalMin: r.arrival_min, departureMin: r.departure_min });
    byTrip.set(r.trip_id, list);
  }
  const fares = db
    .prepare(
      `SELECT f.id, f.from_stop_id, a.name_en AS from_name, f.to_stop_id, b.name_en AS to_name, f.amount_inr, f.data_status,
              f.source, f.verified_at, f.verified_source, f.rejected_at
       FROM fares f JOIN stops a ON a.id = f.from_stop_id JOIN stops b ON b.id = f.to_stop_id
       WHERE f.service_id = ? ORDER BY f.rejected_at IS NOT NULL, a.name_en, b.name_en`,
    )
    .all(id) as {
    id: number; from_stop_id: string; from_name: string; to_stop_id: string; to_name: string; amount_inr: number;
    data_status: DataStatus; source: string | null; verified_at: string | null; verified_source: string | null; rejected_at: string | null;
  }[];
  return {
    service: {
      id: s.id as string,
      name: s.name as string,
      operator: s.operator as string | null,
      vehicleNumber: s.vehicle_number as string | null,
      dataStatus: s.data_status as DataStatus,
      source: s.source as string | null,
      verifiedAt: s.verified_at as string | null,
      verifiedBy: s.verified_by as string | null,
      verifiedSource: s.verified_source as string | null,
      reviewNote: s.review_note as string | null,
      updatedAt: s.updated_at as string | null,
      rejectedAt: s.rejected_at as string | null,
      rejectedBy: s.rejected_by as string | null,
      locked: s.locked === 1,
    },
    trips: trips.map((t) => ({ id: t.id, tripNo: t.trip_no, stops: byTrip.get(t.id) ?? [] })),
    fares: fares.map((f) => ({
      id: f.id,
      fromStopId: f.from_stop_id,
      fromName: f.from_name,
      toStopId: f.to_stop_id,
      toName: f.to_name,
      amountInr: f.amount_inr,
      dataStatus: f.data_status,
      source: f.source,
      verifiedAt: f.verified_at,
      verifiedSource: f.verified_source,
      rejectedAt: f.rejected_at,
    })),
  };
}

export interface StopListItem {
  id: string;
  nameEn: string;
  nameMl: string | null;
  dataStatus: DataStatus;
  verifiedAt: string | null;
  tripCount: number;
  openReports: number;
}

export function listStopsAdmin(db: DB, opts: { q?: string; limit?: number; offset?: number } = {}): { rows: StopListItem[]; total: number } {
  const q = opts.q?.trim() ? `%${opts.q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%` : null;
  const total = (db.prepare("SELECT COUNT(*) AS n FROM stops WHERE (@q IS NULL OR name_en LIKE @q ESCAPE '\\' OR name_ml LIKE @q ESCAPE '\\' OR id LIKE @q ESCAPE '\\')").get({ q }) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT s.id, s.name_en, s.name_ml, s.data_status, s.verified_at,
              (SELECT COUNT(DISTINCT trip_id) FROM trip_stops WHERE stop_id = s.id) AS trip_count,
              (SELECT COUNT(*) FROM reports r WHERE r.stop_id = s.id AND r.status IN ('open','in_review')) AS open_reports
       FROM stops s WHERE (@q IS NULL OR s.name_en LIKE @q ESCAPE '\\' OR s.name_ml LIKE @q ESCAPE '\\' OR s.id LIKE @q ESCAPE '\\')
       ORDER BY open_reports DESC, s.name_en COLLATE NOCASE LIMIT @limit OFFSET @offset`,
    )
    .all({ q, limit: Math.min(opts.limit ?? 25, 100), offset: opts.offset ?? 0 }) as {
    id: string; name_en: string; name_ml: string | null; data_status: DataStatus; verified_at: string | null; trip_count: number; open_reports: number;
  }[];
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, nameEn: r.name_en, nameMl: r.name_ml, dataStatus: r.data_status, verifiedAt: r.verified_at, tripCount: r.trip_count, openReports: r.open_reports })),
  };
}

export interface Overview {
  reports: Record<ReportStatus, number>;
  services: Record<DataStatus, number> & { rejected: number; total: number };
  fares: Record<DataStatus, number> & { rejected: number };
  stops: Record<DataStatus, number>;
  lastImport: { at: string; buses: number; trips: number; stops: number; skippedProtected?: number } | null;
  recentActivity: ReturnType<typeof listAudit>;
}

export function overview(db: DB): Overview {
  const group = (table: string, extra = "") => {
    const out = { demo: 0, unverified: 0, verified: 0 } as Record<DataStatus, number>;
    for (const r of db.prepare(`SELECT data_status AS s, COUNT(*) AS n FROM ${table} ${extra} GROUP BY data_status`).all() as { s: DataStatus; n: number }[]) out[r.s] = r.n;
    return out;
  };
  const rejected = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE rejected_at IS NOT NULL`).get() as { n: number }).n;
  const svc = group("services", "WHERE rejected_at IS NULL");
  const fares = group("fares", "WHERE rejected_at IS NULL");
  let lastImport: Overview["lastImport"] = null;
  const row = db.prepare("SELECT value FROM meta WHERE key = 'import:kerala-private-bus'").get() as { value: string } | undefined;
  if (row) {
    try {
      lastImport = JSON.parse(row.value);
    } catch {
      lastImport = null;
    }
  }
  return {
    reports: countReports(db),
    services: { ...svc, rejected: rejected("services"), total: (db.prepare("SELECT COUNT(*) AS n FROM services").get() as { n: number }).n },
    fares: { ...fares, rejected: rejected("fares") },
    stops: group("stops"),
    lastImport,
    recentActivity: listAudit(db, { limit: 8 }),
  };
}

export interface StopDetail {
  id: string;
  nameEn: string;
  nameMl: string | null;
  dataStatus: DataStatus;
  source: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedSource: string | null;
  reviewNote: string | null;
  updatedAt: string | null;
  tripCount: number;
}

export function getStopDetail(db: DB, id: string): StopDetail | null {
  const s = db.prepare("SELECT * FROM stops WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!s) return null;
  const tripCount = (db.prepare("SELECT COUNT(DISTINCT trip_id) AS n FROM trip_stops WHERE stop_id = ?").get(id) as { n: number }).n;
  return {
    id: s.id as string,
    nameEn: s.name_en as string,
    nameMl: s.name_ml as string | null,
    dataStatus: s.data_status as DataStatus,
    source: s.source as string | null,
    verifiedAt: s.verified_at as string | null,
    verifiedBy: s.verified_by as string | null,
    verifiedSource: s.verified_source as string | null,
    reviewNote: s.review_note as string | null,
    updatedAt: s.updated_at as string | null,
    tripCount,
  };
}
