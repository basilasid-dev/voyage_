import "server-only";
import { getDb } from "./connection";
import type { DataInfo, DataStatus, Stop } from "../types";

interface StopRow {
  id: string;
  name_en: string;
  name_ml: string | null;
  data_status: DataStatus;
}

const toStop = (r: StopRow): Stop => ({
  id: r.id,
  nameEn: r.name_en,
  nameMl: r.name_ml,
  dataStatus: r.data_status,
});

export function listStops(): Stop[] {
  const rows = getDb()
    .prepare("SELECT id, name_en, name_ml, data_status FROM stops ORDER BY name_en COLLATE NOCASE")
    .all() as StopRow[];
  return rows.map(toStop);
}

export function getStopsByIds(ids: string[]): Stop[] {
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT id, name_en, name_ml, data_status FROM stops WHERE id IN (${marks})`)
    .all(...ids) as StopRow[];
  return rows.map(toStop);
}

export function getDataInfo(): DataInfo {
  const db = getDb();
  const services: Record<DataStatus, number> = { demo: 0, unverified: 0, verified: 0 };
  for (const r of db.prepare("SELECT data_status AS s, COUNT(*) AS n FROM services GROUP BY data_status").all() as {
    s: DataStatus;
    n: number;
  }[])
    services[r.s] = r.n;

  let imported: DataInfo["imported"] = null;
  const row = db.prepare("SELECT value FROM meta WHERE key = 'import:kerala-private-bus'").get() as
    | { value: string }
    | undefined;
  if (row && services.unverified + services.verified > 0) {
    try {
      const v = JSON.parse(row.value) as { at: string; buses: number; trips: number; stops: number };
      imported = { at: v.at, buses: v.buses, trips: v.trips, stops: v.stops };
    } catch {
      imported = null;
    }
  }
  return { services, imported };
}
