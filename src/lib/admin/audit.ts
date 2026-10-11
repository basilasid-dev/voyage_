import type Database from "better-sqlite3";

export interface AuditEntry {
  actor: string;
  action: string;
  entityType: "service" | "trip" | "stop" | "fare" | "report" | "community_post";
  entityId: string | number;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before: string | null;
  after: string | null;
  note: string | null;
}

/** Append-only. There is intentionally no update or delete function for the audit log. */
export function audit(db: Database.Database, e: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (at, actor, action, entity_type, entity_id, before_json, after_json, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    e.actor,
    e.action,
    e.entityType,
    String(e.entityId),
    e.before === undefined ? null : JSON.stringify(e.before),
    e.after === undefined ? null : JSON.stringify(e.after),
    e.note ?? null,
  );
}

export function listAudit(
  db: Database.Database,
  opts: { entityType?: string; entityId?: string; limit?: number; offset?: number } = {},
): AuditRow[] {
  const rows = db
    .prepare(
      `SELECT id, at, actor, action, entity_type, entity_id, before_json, after_json, note FROM audit_log
       WHERE (@type IS NULL OR entity_type = @type) AND (@id IS NULL OR entity_id = @id)
       ORDER BY id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({
      type: opts.entityType ?? null,
      id: opts.entityId ?? null,
      limit: Math.min(opts.limit ?? 50, 200),
      offset: opts.offset ?? 0,
    }) as {
    id: number;
    at: string;
    actor: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before_json: string | null;
    after_json: string | null;
    note: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before_json,
    after: r.after_json,
    note: r.note,
  }));
}

/** History of one bus: its own entries plus those of its trips and fares. */
export function listAuditForService(db: Database.Database, serviceId: string, limit = 50): AuditRow[] {
  const rows = db
    .prepare(
      `SELECT id, at, actor, action, entity_type, entity_id, before_json, after_json, note FROM audit_log
       WHERE (entity_type = 'service' AND entity_id = @id)
          OR (entity_type = 'trip' AND entity_id IN (SELECT CAST(id AS TEXT) FROM trips WHERE service_id = @id))
          OR (entity_type = 'fare' AND entity_id IN (SELECT CAST(id AS TEXT) FROM fares WHERE service_id = @id))
       ORDER BY id DESC LIMIT @limit`,
    )
    .all({ id: serviceId, limit: Math.min(limit, 200) }) as {
    id: number; at: string; actor: string; action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null; note: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id, at: r.at, actor: r.actor, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    before: r.before_json, after: r.after_json, note: r.note,
  }));
}
