// Plain DB connection + migrations. Used by the server-only modules (queries.ts, search.ts, admin) and by
// CLI scripts. Never import this from a client component.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LATEST_VERSION, migrate } from "./migrations";
import { seedVoyageContent } from "../voyage/seed";
import { seedDemoData } from "./seed";

const globalForDb = globalThis as unknown as { __calicutDb?: { db: Database.Database; version: number } };

export function dbPath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "calicut-bus.db");
}

export function openDb(file = dbPath()): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000"); // wait instead of failing when another process (e.g. an import) is writing
  migrate(db, file); // adds only; a backup is written first when the file already holds data
  seedDemoData(db); // idempotent: runs once, guarded by a meta flag
  seedVoyageContent(db); // idempotent upsert of the curated travel content (separate tables from the bus data)
  return db;
}

/**
 * Singleton (survives Next.js dev hot reloads). If the code's schema version changed since the connection
 * was opened (a dev server that kept running across an upgrade), it reconnects so migrations run.
 */
export function getDb(): Database.Database {
  const cached = globalForDb.__calicutDb;
  if (cached && cached.version === LATEST_VERSION) return cached.db;
  cached?.db.close();
  const db = openDb();
  globalForDb.__calicutDb = { db, version: LATEST_VERSION };
  return db;
}
