import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { openDb } from "../src/lib/db/connection";
import { currentVersion, LATEST_VERSION, migrate, MIGRATIONS } from "../src/lib/db/migrations";
import { SCHEMA_SQL } from "../src/lib/db/schema";
import { seedDemoData } from "../src/lib/db/seed";
import { memoryDb } from "./helpers";

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "cbg-mig-"));
const cols = (db: Database.Database, t: string) =>
  (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
const dump = (db: Database.Database, t: string, order: string) => db.prepare(`SELECT * FROM ${t} ORDER BY ${order}`).all();

/** A database exactly as phases 1-3 left it: baseline schema, demo seed, user_version 0. */
function legacyDb(file: string) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  seedDemoData(db);
  return db;
}

describe("migrations", () => {
  it("a fresh database ends at the latest version with every review table and column", () => {
    const db = memoryDb();
    assert.equal(currentVersion(db), LATEST_VERSION);
    assert.equal(LATEST_VERSION, MIGRATIONS.length);
    for (const t of ["stops", "services", "fares"]) {
      for (const c of ["verified_at", "verified_by", "verified_source", "review_note", "updated_at"]) {
        assert.ok(cols(db, t).includes(c), `${t}.${c}`);
      }
    }
    assert.ok(cols(db, "services").includes("locked"));
    assert.ok(cols(db, "services").includes("rejected_at"));
    assert.ok(cols(db, "fares").includes("rejected_by"));
    for (const t of ["reports", "audit_log", "admin_sessions"]) assert.ok(cols(db, t).length > 0, t);
  });

  it("upgrades a phase 1-3 database in place without losing or changing any row", () => {
    const dir = tmpDir();
    const file = path.join(dir, "old.db");
    const old = legacyDb(file);
    assert.equal(currentVersion(old), 0);
    const before = {
      stops: dump(old, "stops", "id"),
      services: dump(old, "services", "id"),
      trips: dump(old, "trips", "id"),
      trip_stops: dump(old, "trip_stops", "trip_id, seq"),
      fares: dump(old, "fares", "id"),
      meta: dump(old, "meta", "key"),
    };
    old.close();

    const db = openDb(file); // runs the migrations
    assert.equal(currentVersion(db), LATEST_VERSION);
    // Every original column value is untouched; the new columns exist and start empty.
    const strip = (rows: Record<string, unknown>[], keep: string[]) => rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])));
    for (const [t, order] of [["stops", "id"], ["services", "id"], ["trips", "id"], ["trip_stops", "trip_id, seq"], ["fares", "id"]] as const) {
      const keep = Object.keys((before as Record<string, Record<string, unknown>[]>)[t][0]);
      assert.deepEqual(strip(dump(db, t, order) as Record<string, unknown>[], keep), (before as Record<string, unknown[]>)[t], t);
    }
    assert.deepEqual(dump(db, "meta", "key").slice(0, before.meta.length), before.meta);
    const svc = db.prepare("SELECT verified_at, rejected_at, locked FROM services LIMIT 1").get();
    assert.deepEqual(svc, { verified_at: null, rejected_at: null, locked: 0 });
    // Demo data is not re-seeded (flag preserved) and is still labelled demo.
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM services").get() as { n: number }).n, before.services.length);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM services WHERE data_status <> 'demo'").get() as { n: number }).n, 0);
    db.close();
  });

  it("writes a consistent backup of the old database once, and never overwrites it", () => {
    const dir = tmpDir();
    const file = path.join(dir, "old.db");
    legacyDb(file).close();
    openDb(file).close();
    const bak = `${file}.pre-v${LATEST_VERSION}.bak`;
    assert.ok(fs.existsSync(bak));
    const b = new Database(bak, { readonly: true });
    assert.equal(currentVersion(b), 0); // the backup is the old schema
    assert.equal((b.prepare("SELECT COUNT(*) AS n FROM trip_stops").get() as { n: number }).n, 142);
    b.close();
    const mtime = fs.statSync(bak).mtimeMs;
    openDb(file).close(); // already migrated: no new backup
    assert.equal(fs.statSync(bak).mtimeMs, mtime);
  });

  it("does not write a backup for a brand-new database", () => {
    const dir = tmpDir();
    const file = path.join(dir, "new.db");
    openDb(file).close();
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".bak")), []);
  });

  it("is idempotent and tolerates a half-applied migration (column already exists)", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    db.exec("ALTER TABLE services ADD COLUMN verified_at TEXT"); // as if a previous run died midway
    migrate(db);
    assert.equal(currentVersion(db), LATEST_VERSION);
    assert.deepEqual(migrate(db), { from: LATEST_VERSION, to: LATEST_VERSION, backup: null });
  });

  it("a failing migration rolls back and leaves the version unchanged", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const broken = { version: 99, name: "broken", up: (d: Database.Database) => { d.exec("ALTER TABLE stops ADD COLUMN oops TEXT"); throw new Error("boom"); } };
    assert.throws(() =>
      db.transaction(() => {
        broken.up(db);
        db.pragma("user_version = 99");
      })(),
    );
    assert.equal(currentVersion(db), 0);
    assert.ok(!cols(db, "stops").includes("oops"));
  });

  it("rejects bad enum values through the new CHECK constraints", () => {
    const db = memoryDb();
    assert.throws(() => db.prepare("INSERT INTO reports (created_at, kind, message) VALUES ('x','nonsense','m')").run());
    assert.throws(() => db.prepare("INSERT INTO reports (created_at, kind, message, status) VALUES ('x','timing','m','weird')").run());
  });
});
