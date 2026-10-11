// Passenger feedback: validation, storage and the admin-side handling of reports.
// Client-safe pieces (kinds, limits, validateReportInput) are used by the form and by the API route; the
// functions that take a database are server-only in practice (only called from route handlers / actions).
import type Database from "better-sqlite3";
import { audit } from "./admin/audit";
import { cleanText } from "./admin/review";
import { AdminError, fail } from "./admin/errors";

export const REPORT_KINDS = ["timing", "route", "stop_name", "other"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_LIMITS = { messageMin: 10, messageMax: 1000, suggestion: 300, contact: 120 } as const;

/** Stable machine-readable error codes. The UI maps them to translated messages. */
export type ReportFieldError = "required" | "too_short" | "too_long" | "invalid";

export interface ReportInput {
  kind: ReportKind;
  message: string;
  suggestion: string;
  contact: string;
  lang: "en" | "ml";
  serviceId: string | null;
  tripId: number | null;
  stopId: string | null;
  fromStopId: string | null;
  toStopId: string | null;
}

export type ValidationResult =
  | { ok: true; value: ReportInput }
  | { ok: false; errors: Partial<Record<keyof ReportInput | "website", ReportFieldError>>; spam?: boolean };

const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

/** Validates raw JSON from the browser. Pure function: no I/O. */
export function validateReportInput(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: { message: "invalid" } };
  const r = raw as Record<string, unknown>;
  // Honeypot: a hidden field real people never fill. Bots do. Treated as spam, not as an error.
  if (str(r.website).trim() !== "") return { ok: false, errors: {}, spam: true };

  const errors: Partial<Record<keyof ReportInput, ReportFieldError>> = {};

  const kind = REPORT_KINDS.find((k) => k === r.kind);
  if (!kind) errors.kind = "invalid";

  const message = norm(str(r.message));
  if (!message) errors.message = "required";
  else if (message.length < REPORT_LIMITS.messageMin) errors.message = "too_short";
  else if (message.length > REPORT_LIMITS.messageMax) errors.message = "too_long";
  else if (CONTROL.test(message)) errors.message = "invalid";

  const suggestion = norm(str(r.suggestion));
  if (suggestion.length > REPORT_LIMITS.suggestion) errors.suggestion = "too_long";
  else if (CONTROL.test(suggestion)) errors.suggestion = "invalid";

  const contact = norm(str(r.contact));
  if (contact.length > REPORT_LIMITS.contact) errors.contact = "too_long";
  else if (/[\n\r]|[\u0000-\u001F]/.test(contact)) errors.contact = "invalid";

  const id = (v: unknown, key: keyof ReportInput): string | null => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !ID.test(v)) {
      errors[key] = "invalid";
      return null;
    }
    return v;
  };
  const serviceId = id(r.serviceId, "serviceId");
  const stopId = id(r.stopId, "stopId");
  const fromStopId = id(r.fromStopId, "fromStopId");
  const toStopId = id(r.toStopId, "toStopId");

  let tripId: number | null = null;
  if (r.tripId !== undefined && r.tripId !== null && r.tripId !== "") {
    if (typeof r.tripId === "number" && Number.isInteger(r.tripId) && r.tripId > 0) tripId = r.tripId;
    else errors.tripId = "invalid";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind!,
      message,
      suggestion,
      contact,
      lang: r.lang === "ml" ? "ml" : "en",
      serviceId,
      tripId,
      stopId,
      fromStopId,
      toStopId,
    },
  };
}

const MAX_OPEN_REPORTS = 5000; // a flood guard on top of per-IP rate limits

const fmt = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Stores a report. Context ids are only kept if they exist, and a readable snapshot (bus, stops, time) is saved
 * with it, so the report still makes sense after a re-import changes or removes those rows.
 */
export function createReport(db: Database.Database, input: ReportInput): number {
  const open = (db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status IN ('open','in_review')").get() as { n: number }).n;
  if (open >= MAX_OPEN_REPORTS) throw new AdminError("conflict", "Too many open reports.");

  const stopName = (id: string | null) =>
    id ? ((db.prepare("SELECT name_en FROM stops WHERE id = ?").get(id) as { name_en: string } | undefined)?.name_en ?? null) : null;
  const stop = (id: string | null) => (stopName(id) ? id : null);

  const service = input.serviceId
    ? (db.prepare("SELECT id, name, data_status FROM services WHERE id = ?").get(input.serviceId) as
        | { id: string; name: string; data_status: string }
        | undefined)
    : undefined;
  const trip = input.tripId
    ? (db
        .prepare(
          `SELECT t.id, t.service_id, MIN(COALESCE(ts.departure_min, ts.arrival_min)) AS first_min
           FROM trips t JOIN trip_stops ts ON ts.trip_id = t.id WHERE t.id = ? GROUP BY t.id`,
        )
        .get(input.tripId) as { id: number; service_id: string; first_min: number | null } | undefined)
    : undefined;

  const parts: string[] = [];
  if (service) parts.push(`${service.name} [${service.data_status}]`);
  if (trip?.first_min != null) parts.push(`trip starting ${fmt(trip.first_min)}`);
  const from = stopName(input.fromStopId);
  const to = stopName(input.toStopId);
  if (from && to) parts.push(`${from} → ${to}`);
  const stopLabel = stopName(input.stopId);
  if (stopLabel) parts.push(`stop: ${stopLabel}`);

  const id = Number(
    db
      .prepare(
        `INSERT INTO reports (created_at, kind, message, suggestion, contact, lang, service_id, trip_id, stop_id, from_stop_id, to_stop_id, context_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        new Date().toISOString(),
        input.kind,
        input.message,
        input.suggestion || null,
        input.contact || null,
        input.lang,
        service?.id ?? null,
        trip?.id ?? null,
        stop(input.stopId),
        stop(input.fromStopId),
        stop(input.toStopId),
        parts.join(" · ") || null,
      ).lastInsertRowid,
  );
  return id;
}

export interface ReportRow {
  id: number;
  createdAt: string;
  kind: ReportKind;
  message: string;
  suggestion: string | null;
  contact: string | null;
  lang: string | null;
  serviceId: string | null;
  tripId: number | null;
  stopId: string | null;
  fromStopId: string | null;
  toStopId: string | null;
  contextLabel: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  handledBy: string | null;
  handledAt: string | null;
}

interface RawReport {
  id: number;
  created_at: string;
  kind: ReportKind;
  message: string;
  suggestion: string | null;
  contact: string | null;
  lang: string | null;
  service_id: string | null;
  trip_id: number | null;
  stop_id: string | null;
  from_stop_id: string | null;
  to_stop_id: string | null;
  context_label: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
}

const toRow = (r: RawReport): ReportRow => ({
  id: r.id,
  createdAt: r.created_at,
  kind: r.kind,
  message: r.message,
  suggestion: r.suggestion,
  contact: r.contact,
  lang: r.lang,
  serviceId: r.service_id,
  tripId: r.trip_id,
  stopId: r.stop_id,
  fromStopId: r.from_stop_id,
  toStopId: r.to_stop_id,
  contextLabel: r.context_label,
  status: r.status,
  resolutionNote: r.resolution_note,
  handledBy: r.handled_by,
  handledAt: r.handled_at,
});

export function listReports(
  db: Database.Database,
  opts: { status?: ReportStatus | "active"; kind?: ReportKind; serviceId?: string; stopId?: string; limit?: number; offset?: number } = {},
): ReportRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM reports
       WHERE (@status IS NULL OR (@status = 'active' AND status IN ('open','in_review')) OR status = @status)
         AND (@kind IS NULL OR kind = @kind)
         AND (@service IS NULL OR service_id = @service)
         AND (@stop IS NULL OR stop_id = @stop)
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, id DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({
      status: opts.status ?? null,
      kind: opts.kind ?? null,
      service: opts.serviceId ?? null,
      stop: opts.stopId ?? null,
      limit: Math.min(opts.limit ?? 50, 200),
      offset: opts.offset ?? 0,
    }) as RawReport[];
  return rows.map(toRow);
}

export function getReport(db: Database.Database, id: number): ReportRow | null {
  const r = db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as RawReport | undefined;
  return r ? toRow(r) : null;
}

export function countReports(db: Database.Database): Record<ReportStatus, number> {
  const out: Record<ReportStatus, number> = { open: 0, in_review: 0, resolved: 0, dismissed: 0 };
  for (const r of db.prepare("SELECT status, COUNT(*) AS n FROM reports GROUP BY status").all() as { status: ReportStatus; n: number }[]) out[r.status] = r.n;
  return out;
}

/** Admin: move a report through open → in_review → resolved / dismissed. Closing needs a note. */
export function updateReport(
  db: Database.Database,
  actor: string,
  id: number,
  input: { status: unknown; note?: unknown },
): void {
  const status = REPORT_STATUSES.find((s) => s === input.status);
  if (!status) fail("validation", "Invalid status.");
  const closing = status === "resolved" || status === "dismissed";
  const note = cleanText(input.note, "Note", { min: closing ? 3 : 0, max: 500, required: closing });
  db.transaction(() => {
    const cur = db.prepare("SELECT status FROM reports WHERE id = ?").get(id) as { status: ReportStatus } | undefined;
    if (!cur) fail("not_found", "Report not found.");
    db.prepare("UPDATE reports SET status = ?, resolution_note = ?, handled_by = ?, handled_at = ? WHERE id = ?").run(
      status,
      note || null,
      actor,
      new Date().toISOString(),
      id,
    );
    audit(db, { actor, action: `report_${status}`, entityType: "report", entityId: id, before: { status: cur!.status }, after: { status }, note });
  })();
}
