import Database from "better-sqlite3";
import { migrate } from "../src/lib/db/migrations";

export function memoryDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db); // same path as production: baseline + all migrations
  return db;
}

export const hm = (h: number, m = 0) => h * 60 + m;

/** Adds a bus (service) with one trip. Each stop: [stopId, arrivalMin | null, departureMin | null]. */
export function addTrip(
  db: Database.Database,
  serviceId: string,
  stops: [string, number | null, number | null][],
  status: "demo" | "unverified" | "verified" = "unverified",
): number {
  db.prepare("INSERT OR IGNORE INTO services (id, name, data_status) VALUES (?, ?, ?)").run(serviceId, serviceId, status);
  const tripId = Number(db.prepare("INSERT INTO trips (service_id) VALUES (?)").run(serviceId).lastInsertRowid);
  stops.forEach(([stop, arr, dep], seq) => {
    db.prepare("INSERT OR IGNORE INTO stops (id, name_en, data_status) VALUES (?, ?, 'unverified')").run(stop, stop.toUpperCase());
    db.prepare("INSERT INTO trip_stops (trip_id, seq, stop_id, arrival_min, departure_min) VALUES (?, ?, ?, ?, ?)").run(
      tripId, seq, stop, arr, dep,
    );
  });
  return tripId;
}

export function addFare(
  db: Database.Database,
  serviceId: string | null,
  from: string,
  to: string,
  amount: number,
  status: "demo" | "unverified" | "verified" = "verified",
) {
  db.prepare(
    "INSERT INTO fares (service_id, from_stop_id, to_stop_id, amount_inr, data_status) VALUES (?, ?, ?, ?, ?)",
  ).run(serviceId, from, to, amount, status);
}
