// Review operations an administrator can perform. Pure logic: the database is a parameter and the caller
// (a server action) has already checked that the user is an admin. Every change is written to the audit log
// in the same transaction, and every function validates its input again (never trust the form).
//
// Principles:
//  * Demo data is invented. It cannot be verified or edited; it can only be hidden (rejected).
//  * Verification needs a named source and records who/when. Any later content change revokes it.
//  * Reviewed or edited buses are `locked` so re-imports never overwrite them.
//  * Nothing here creates a fare, timing or route out of thin air: every value comes from the admin and
//    every fare needs a source.
import type Database from "better-sqlite3";
import { audit } from "./audit";
import { fail } from "./errors";

type DB = Database.Database;

export const LIMITS = { source: 300, note: 500, name: 80, maxMinutes: 47 * 60 + 59, maxFare: 2000 } as const;

const CONTROL = /[\u0000-\u001F\u007F]/;

/** Trim, collapse inner whitespace, bound the length, reject control characters. */
export function cleanText(value: unknown, field: string, opts: { min?: number; max: number; required?: boolean }): string {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!s) {
    if (opts.required) fail("validation", `${field} is required.`);
    return "";
  }
  if (CONTROL.test(s)) fail("validation", `${field} contains invalid characters.`);
  if (s.length > opts.max) fail("validation", `${field} must be at most ${opts.max} characters.`);
  if (opts.min && s.length < opts.min) fail("validation", `${field} must be at least ${opts.min} characters.`);
  return s;
}

const now = () => new Date().toISOString();

interface ServiceRow {
  id: string;
  name: string;
  data_status: "demo" | "unverified" | "verified";
  rejected_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verified_source: string | null;
  review_note: string | null;
  locked: number;
}

function getService(db: DB, id: string): ServiceRow {
  const row = db
    .prepare(
      "SELECT id, name, data_status, rejected_at, verified_at, verified_by, verified_source, review_note, locked FROM services WHERE id = ?",
    )
    .get(id) as ServiceRow | undefined;
  return row ?? fail("not_found", "Bus not found.");
}

const CLEAR_VERIFICATION = "verified_at = NULL, verified_by = NULL, verified_source = NULL";

// ---------------------------------------------------------------- buses (schedules)

/** Marks a bus's whole schedule as checked against `source`. */
export function verifyService(db: DB, actor: string, serviceId: string, input: { source: unknown; note?: unknown }): void {
  const source = cleanText(input.source, "Source", { min: 3, max: LIMITS.source, required: true });
  const note = cleanText(input.note, "Note", { max: LIMITS.note });
  db.transaction(() => {
    const s = getService(db, serviceId);
    if (s.data_status === "demo") fail("demo_record", "Demo data is invented and cannot be verified.");
    if (s.rejected_at) fail("rejected", "This bus is rejected. Restore it before verifying.");
    const trips = (db.prepare("SELECT COUNT(*) AS n FROM trips WHERE service_id = ?").get(serviceId) as { n: number }).n;
    if (trips === 0) fail("validation", "This bus has no trips to verify.");
    const at = now();
    db.prepare(
      `UPDATE services SET data_status = 'verified', verified_at = ?, verified_by = ?, verified_source = ?,
         review_note = ?, updated_at = ?, locked = 1 WHERE id = ?`,
    ).run(at, actor, source, note || null, at, serviceId);
    audit(db, {
      actor,
      action: "verify",
      entityType: "service",
      entityId: serviceId,
      before: { data_status: s.data_status },
      after: { data_status: "verified", verified_source: source },
      note,
    });
  })();
}

/** Withdraws verification (for example the operator changed the timetable). */
export function unverifyService(db: DB, actor: string, serviceId: string, input: { note: unknown }): void {
  const note = cleanText(input.note, "Reason", { min: 3, max: LIMITS.note, required: true });
  db.transaction(() => {
    const s = getService(db, serviceId);
    if (s.data_status !== "verified") fail("validation", "This bus is not verified.");
    db.prepare(
      `UPDATE services SET data_status = 'unverified', ${CLEAR_VERIFICATION}, review_note = ?, updated_at = ?, locked = 1 WHERE id = ?`,
    ).run(note, now(), serviceId);
    audit(db, {
      actor,
      action: "unverify",
      entityType: "service",
      entityId: serviceId,
      before: { data_status: "verified", verified_source: s.verified_source, verified_at: s.verified_at },
      after: { data_status: "unverified" },
      note,
    });
  })();
}

/** Hides a bus from passengers. The record, its history and its reports are kept. */
export function rejectService(db: DB, actor: string, serviceId: string, input: { reason: unknown }): void {
  const reason = cleanText(input.reason, "Reason", { min: 3, max: LIMITS.note, required: true });
  db.transaction(() => {
    const s = getService(db, serviceId);
    if (s.rejected_at) fail("conflict", "This bus is already rejected.");
    const at = now();
    // A rejected schedule is not trusted, so any verification is withdrawn as well.
    const status = s.data_status === "verified" ? "unverified" : s.data_status;
    db.prepare(
      `UPDATE services SET rejected_at = ?, rejected_by = ?, review_note = ?, data_status = ?, ${CLEAR_VERIFICATION},
         updated_at = ?, locked = 1 WHERE id = ?`,
    ).run(at, actor, reason, status, at, serviceId);
    audit(db, {
      actor,
      action: "reject",
      entityType: "service",
      entityId: serviceId,
      before: { data_status: s.data_status, rejected_at: null },
      after: { data_status: status, rejected_at: at },
      note: reason,
    });
  })();
}

/** Makes a rejected bus visible again, as unverified. */
export function restoreService(db: DB, actor: string, serviceId: string, input: { note?: unknown } = {}): void {
  const note = cleanText(input.note, "Note", { max: LIMITS.note });
  db.transaction(() => {
    const s = getService(db, serviceId);
    if (!s.rejected_at) fail("conflict", "This bus is not rejected.");
    db.prepare(
      "UPDATE services SET rejected_at = NULL, rejected_by = NULL, review_note = ?, updated_at = ?, locked = 1 WHERE id = ?",
    ).run(note || null, now(), serviceId);
    audit(db, { actor, action: "restore", entityType: "service", entityId: serviceId, before: { rejected_at: s.rejected_at }, after: { rejected_at: null }, note });
  })();
}

// ---------------------------------------------------------------- trip times

export interface TripStopInput {
  seq: number;
  arrivalMin: number | null;
  departureMin: number | null;
}

/** "07:05" -> 425. Hours up to 47 so a trip past midnight can be entered as 24:30. Empty -> null. */
export function parseHm(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (!m || Number(m[1]) > 47) return fail("validation", `"${s}" is not a valid time. Use HH:MM (24-hour), for example 07:05.`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Corrects the times of one trip. Stops and their order are not changed here. If the bus was verified, the
 * verification is withdrawn: it no longer describes the data.
 */
export function updateTripTimes(
  db: DB,
  actor: string,
  tripId: number,
  rows: TripStopInput[],
  input: { note?: unknown } = {},
): void {
  const note = cleanText(input.note, "Note", { max: LIMITS.note });
  if (!Number.isInteger(tripId)) fail("validation", "Invalid trip.");
  db.transaction(() => {
    const trip = db.prepare("SELECT id, service_id FROM trips WHERE id = ?").get(tripId) as
      | { id: number; service_id: string }
      | undefined;
    if (!trip) fail("not_found", "Trip not found.");
    const service = getService(db, trip!.service_id);
    if (service.data_status === "demo") fail("demo_record", "Demo data is invented and cannot be edited.");

    const current = db
      .prepare("SELECT seq, arrival_min, departure_min FROM trip_stops WHERE trip_id = ? ORDER BY seq")
      .all(tripId) as { seq: number; arrival_min: number | null; departure_min: number | null }[];
    const bySeq = new Map(current.map((r) => [r.seq, r]));
    const next = new Map(current.map((r) => [r.seq, { arrival: r.arrival_min, departure: r.departure_min }]));

    for (const r of rows) {
      if (!bySeq.has(r.seq)) fail("validation", `Stop #${r.seq} does not exist on this trip.`);
      for (const v of [r.arrivalMin, r.departureMin]) {
        if (v !== null && (!Number.isInteger(v) || v < 0 || v > LIMITS.maxMinutes)) fail("validation", "Time out of range.");
      }
      next.set(r.seq, { arrival: r.arrivalMin, departure: r.departureMin });
    }

    // Every stop needs a time, and times must never go backwards along the trip.
    let last = -1;
    for (const [seq, t] of [...next.entries()].sort((a, b) => a[0] - b[0])) {
      if (t.arrival === null && t.departure === null) fail("validation", `Stop #${seq + 1} needs an arrival or a departure time.`);
      for (const v of [t.arrival, t.departure]) {
        if (v === null) continue;
        if (v < last) fail("validation", `Times go backwards at stop #${seq + 1}.`);
        last = v;
      }
    }

    const changed = current.filter((c) => {
      const n = next.get(c.seq)!;
      return n.arrival !== c.arrival_min || n.departure !== c.departure_min;
    });
    if (changed.length === 0) fail("validation", "No times were changed.");

    const upd = db.prepare("UPDATE trip_stops SET arrival_min = ?, departure_min = ? WHERE trip_id = ? AND seq = ?");
    for (const c of changed) {
      const n = next.get(c.seq)!;
      upd.run(n.arrival, n.departure, tripId, c.seq);
    }

    const at = now();
    const wasVerified = service.data_status === "verified";
    db.prepare(
      `UPDATE services SET updated_at = ?, locked = 1,
         data_status = CASE WHEN data_status = 'verified' THEN 'unverified' ELSE data_status END,
         verified_at = CASE WHEN data_status = 'verified' THEN NULL ELSE verified_at END,
         verified_by = CASE WHEN data_status = 'verified' THEN NULL ELSE verified_by END,
         verified_source = CASE WHEN data_status = 'verified' THEN NULL ELSE verified_source END
       WHERE id = ?`,
    ).run(at, service.id);
    audit(db, {
      actor,
      action: "edit_times",
      entityType: "trip",
      entityId: tripId,
      before: changed.map((c) => ({ seq: c.seq, arrival: c.arrival_min, departure: c.departure_min })),
      after: changed.map((c) => ({ seq: c.seq, ...next.get(c.seq)! })),
      note: wasVerified ? `${note ? note + " " : ""}(verification withdrawn: schedule changed)` : note,
    });
  })();
}

// ---------------------------------------------------------------- stops

interface StopRow {
  id: string;
  name_en: string;
  name_ml: string | null;
  data_status: "demo" | "unverified" | "verified";
}

function getStop(db: DB, id: string): StopRow {
  return (
    (db.prepare("SELECT id, name_en, name_ml, data_status FROM stops WHERE id = ?").get(id) as StopRow | undefined) ??
    fail("not_found", "Stop not found.")
  );
}

/** Corrects a stop name (typically after a passenger report). Withdraws verification of that stop. */
export function renameStop(db: DB, actor: string, stopId: string, input: { nameEn: unknown; nameMl?: unknown; note?: unknown }): void {
  const nameEn = cleanText(input.nameEn, "English name", { min: 2, max: LIMITS.name, required: true });
  const nameMl = cleanText(input.nameMl, "Malayalam name", { max: LIMITS.name });
  const note = cleanText(input.note, "Note", { max: LIMITS.note });
  db.transaction(() => {
    const s = getStop(db, stopId);
    if (s.data_status === "demo") fail("demo_record", "Demo data is invented and cannot be edited.");
    if (s.name_en === nameEn && (s.name_ml ?? "") === nameMl) fail("validation", "No changes.");
    db.prepare(
      `UPDATE stops SET name_en = ?, name_ml = ?, updated_at = ?,
         data_status = CASE WHEN data_status = 'verified' THEN 'unverified' ELSE data_status END,
         verified_at = NULL, verified_by = NULL, verified_source = NULL
       WHERE id = ?`,
    ).run(nameEn, nameMl || null, now(), stopId);
    audit(db, {
      actor,
      action: "rename",
      entityType: "stop",
      entityId: stopId,
      before: { name_en: s.name_en, name_ml: s.name_ml },
      after: { name_en: nameEn, name_ml: nameMl || null },
      note,
    });
  })();
}

export function verifyStop(db: DB, actor: string, stopId: string, input: { source: unknown; note?: unknown }): void {
  const source = cleanText(input.source, "Source", { min: 3, max: LIMITS.source, required: true });
  const note = cleanText(input.note, "Note", { max: LIMITS.note });
  db.transaction(() => {
    const s = getStop(db, stopId);
    if (s.data_status === "demo") fail("demo_record", "Demo data is invented and cannot be verified.");
    const at = now();
    db.prepare(
      "UPDATE stops SET data_status = 'verified', verified_at = ?, verified_by = ?, verified_source = ?, review_note = ?, updated_at = ? WHERE id = ?",
    ).run(at, actor, source, note || null, at, stopId);
    audit(db, { actor, action: "verify", entityType: "stop", entityId: stopId, before: { data_status: s.data_status }, after: { data_status: "verified", verified_source: source }, note });
  })();
}

// ---------------------------------------------------------------- fares

export interface NewFare {
  serviceId: string | null;
  fromStopId: string;
  toStopId: string;
  amountInr: unknown;
  source: unknown; // where the amount comes from (required: we never record an unsourced fare)
  verifiedSource?: unknown; // set to mark it verified right away
}

/** Records a fare an admin has obtained from a real source. There is no other way fares enter the system. */
export function addFare(db: DB, actor: string, input: NewFare): number {
  const source = cleanText(input.source, "Source", { min: 3, max: LIMITS.source, required: true });
  const verifiedSource = cleanText(input.verifiedSource, "Verified against", { min: 3, max: LIMITS.source });
  const amount = typeof input.amountInr === "number" ? input.amountInr : Number(String(input.amountInr ?? "").trim());
  if (!Number.isInteger(amount) || amount < 1 || amount > LIMITS.maxFare) fail("validation", `Fare must be a whole number of rupees between 1 and ${LIMITS.maxFare}.`);
  if (input.fromStopId === input.toStopId) fail("validation", "From and To must be different stops.");

  return db.transaction(() => {
    getStop(db, input.fromStopId);
    getStop(db, input.toStopId);
    if (input.serviceId !== null) getService(db, input.serviceId);
    const dup = db
      .prepare(
        `SELECT id FROM fares WHERE rejected_at IS NULL AND from_stop_id = ? AND to_stop_id = ?
           AND ((service_id IS NULL AND ? IS NULL) OR service_id = ?)`,
      )
      .get(input.fromStopId, input.toStopId, input.serviceId, input.serviceId);
    if (dup) fail("conflict", "A fare for this bus and these stops already exists. Reject it first to replace it.");

    const at = now();
    const status = verifiedSource ? "verified" : "unverified";
    const id = Number(
      db
        .prepare(
          `INSERT INTO fares (service_id, from_stop_id, to_stop_id, amount_inr, data_status, source, verified_at, verified_by, verified_source, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.serviceId,
          input.fromStopId,
          input.toStopId,
          amount,
          status,
          source,
          verifiedSource ? at : null,
          verifiedSource ? actor : null,
          verifiedSource || null,
          at,
        ).lastInsertRowid,
    );
    audit(db, { actor, action: "add_fare", entityType: "fare", entityId: id, after: { ...input, amountInr: amount, data_status: status } });
    return id;
  })();
}

function getFare(db: DB, id: number) {
  return (
    (db.prepare("SELECT id, data_status, rejected_at FROM fares WHERE id = ?").get(id) as
      | { id: number; data_status: "demo" | "unverified" | "verified"; rejected_at: string | null }
      | undefined) ?? fail("not_found", "Fare not found.")
  );
}

export function verifyFare(db: DB, actor: string, fareId: number, input: { source: unknown }): void {
  const source = cleanText(input.source, "Verified against", { min: 3, max: LIMITS.source, required: true });
  db.transaction(() => {
    const f = getFare(db, fareId);
    if (f.data_status === "demo") fail("demo_record", "Demo fares are invented and cannot be verified.");
    if (f.rejected_at) fail("rejected", "This fare is rejected.");
    const at = now();
    db.prepare("UPDATE fares SET data_status = 'verified', verified_at = ?, verified_by = ?, verified_source = ?, updated_at = ? WHERE id = ?").run(at, actor, source, at, fareId);
    audit(db, { actor, action: "verify", entityType: "fare", entityId: fareId, before: { data_status: f.data_status }, after: { data_status: "verified", verified_source: source } });
  })();
}

export function rejectFare(db: DB, actor: string, fareId: number, input: { reason: unknown }): void {
  const reason = cleanText(input.reason, "Reason", { min: 3, max: LIMITS.note, required: true });
  db.transaction(() => {
    const f = getFare(db, fareId);
    if (f.rejected_at) fail("conflict", "This fare is already rejected.");
    const at = now();
    db.prepare(
      `UPDATE fares SET rejected_at = ?, rejected_by = ?, review_note = ?, updated_at = ?,
         data_status = CASE WHEN data_status = 'verified' THEN 'unverified' ELSE data_status END,
         verified_at = NULL, verified_by = NULL, verified_source = NULL WHERE id = ?`,
    ).run(at, actor, reason, at, fareId);
    audit(db, { actor, action: "reject", entityType: "fare", entityId: fareId, before: { data_status: f.data_status }, note: reason });
  })();
}
