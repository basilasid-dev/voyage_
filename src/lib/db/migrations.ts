// Versioned schema migrations, tracked with SQLite's PRAGMA user_version.
//
//  v1  baseline        The schema of phases 1-3 (schema.ts, frozen: never edit it, add a migration).
//  v2  review-workflow Verification metadata, rejection, admin sessions, audit log, passenger reports.
//  v3  voyage-travel-planning  Destinations, places, saved inspiration, trips (separate from the bus tables).
//
// Rules: migrations only ADD (tables, columns); they never drop or rewrite existing rows. Each one runs in a
// transaction together with its version bump, so a failure leaves the database at the previous version.
// Before the first migration touches a database that already has data, a consistent copy is written next
// to it (<file>.pre-v<N>.bak, via VACUUM INTO). Existing backups are never overwritten.
import fs from "node:fs";
import type Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const columns = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

/** ALTER TABLE ... ADD COLUMN, skipped when the column exists (makes a half-applied run safe to repeat). */
function addColumn(db: Database.Database, table: string, name: string, definition: string) {
  if (!columns(db, table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline",
    up: (db) => db.exec(SCHEMA_SQL), // idempotent (IF NOT EXISTS): adopts databases created before versioning
  },
  {
    version: 2,
    name: "review-workflow",
    up: (db) => {
      // Provenance and verification, on every record type.
      //   source            where the data came from (set on creation/import, never overwritten by review)
      //   verified_at/by    when and by whom a person confirmed it
      //   verified_source   what it was confirmed against (e.g. "Operator timetable, photo 2026-10-12")
      //   review_note       free text from the last review
      //   updated_at        last change made through the admin tools
      const review = [
        ["verified_at", "TEXT"],
        ["verified_by", "TEXT"],
        ["verified_source", "TEXT"],
        ["review_note", "TEXT"],
        ["updated_at", "TEXT"],
      ] as const;
      for (const table of ["stops", "services", "fares"]) for (const [c, d] of review) addColumn(db, table, c, d);

      // Rejected records stay in the database (history, audit) but are hidden from passengers.
      for (const table of ["services", "fares"]) {
        addColumn(db, table, "rejected_at", "TEXT");
        addColumn(db, table, "rejected_by", "TEXT");
      }
      // locked = a person has reviewed or edited this bus. Re-imports skip locked buses so they never
      // overwrite verified or hand-edited schedules.
      addColumn(db, "services", "locked", "INTEGER NOT NULL DEFAULT 0");

      db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('timing','route','stop_name','other')),
  message TEXT NOT NULL,
  suggestion TEXT,
  contact TEXT,                 -- optional, only if the passenger chose to give it
  lang TEXT,
  service_id TEXT,              -- context ids are NOT foreign keys: reports must outlive re-imports
  trip_id INTEGER,
  stop_id TEXT,
  from_stop_id TEXT,
  to_stop_id TEXT,
  context_label TEXT,           -- human-readable snapshot taken when the report was filed
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','dismissed')),
  resolution_note TEXT,
  handled_by TEXT,
  handled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_service ON reports(service_id);
CREATE INDEX IF NOT EXISTS idx_reports_stop ON reports(stop_id);

-- Append-only record of every admin action.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

-- Only a SHA-256 of the session token is stored; the token itself lives in the browser cookie.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`);
    },
  },
  {
    version: 3,
    name: "voyage-travel-planning",
    // Adds the travel-planning services (destinations, saved inspiration, trips). Entirely separate tables, all
    // named so they cannot collide with the bus tables (the bus service already owns "trips"; the planner uses
    // voyage_trips, voyage_activities, voyage_expenses). Money is stored in minor units (cents) as integers.
    up: (db) => {
      db.exec(`
-- Curated content, written by the app from src/lib/voyage/content.ts on startup (read-only for users).
CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  summary TEXT NOT NULL,
  currency TEXT NOT NULL,
  image TEXT NOT NULL,
  image_alt TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('landmark','food','nature','culture','shopping','stay','other')),
  area TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  cost_min_cents INTEGER NOT NULL CHECK (cost_min_cents >= 0),
  cost_max_cents INTEGER NOT NULL CHECK (cost_max_cents >= cost_min_cents),
  currency TEXT NOT NULL,
  cost_note TEXT,
  image TEXT NOT NULL,
  image_alt TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_places_dest ON places(destination_id, category, sort);

-- Per-visitor data. 'owner' is a SHA-256 of a random cookie token: there are no accounts, and nobody can read or
-- change another browser's saved items or trips.
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  UNIQUE (owner, name)
);

CREATE TABLE IF NOT EXISTS saved_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  platform TEXT NOT NULL DEFAULT 'manual' CHECK (platform IN ('pinterest','instagram','youtube','tiktok','vimeo','web','manual')),
  destination_id TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('landmark','food','nature','culture','shopping','stay','other')),
  location TEXT,
  notes TEXT,
  duration_min INTEGER,
  cost_cents INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_owner ON saved_items(owner, updated_at);

CREATE TABLE IF NOT EXISTS voyage_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  destination_id TEXT NOT NULL REFERENCES destinations(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voyage_trips_owner ON voyage_trips(owner, start_date);

-- An activity is a snapshot copied from a saved item or curated place, so later edits or deletions of the
-- source never change a trip that is already planned.
CREATE TABLE IF NOT EXISTS voyage_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day >= 1),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('landmark','food','nature','culture','shopping','stay','other')),
  location TEXT,
  notes TEXT,
  duration_min INTEGER,
  cost_cents INTEGER,
  currency TEXT,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  saved_item_id INTEGER REFERENCES saved_items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voyage_activities_trip ON voyage_activities(trip_id, day, position);

CREATE TABLE IF NOT EXISTS voyage_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  day INTEGER CHECK (day IS NULL OR day >= 1),
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('transport','food','entry','stay','shopping','other')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voyage_expenses_trip ON voyage_expenses(trip_id, day);
`);
    },
  },
  {
    version: 4,
    name: "voyage-community-and-enhanced-planning",
    up: (db) => {
      db.exec(`
CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  author_name TEXT NOT NULL,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'tip' CHECK (category IN ('tip','review','story','food','photo','landmark','shopping','culture','nature')),
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','reported'))
);
CREATE INDEX IF NOT EXISTS idx_community_dest ON community_posts(destination_id, created_at);

CREATE TABLE IF NOT EXISTS community_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam','inaccurate','inappropriate','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed'))
);
CREATE INDEX IF NOT EXISTS idx_community_reports_post ON community_reports(post_id);
`);
      addColumn(db, "saved_items", "tags", "TEXT");
      addColumn(db, "voyage_activities", "start_time", "TEXT");
    },
  },
  {
    version: 5,
    name: "reel-to-travel-and-real-community",
    // Reel-to-Travel captures and the places extracted from them; approximate coordinates on curated places (only
    // used to suggest a visiting order); real community contributions (one vote / one report per visitor, visit
    // details) and removal of the six invented starter posts that earlier versions seeded.
    up: (db) => {
      db.exec(`
CREATE TABLE IF NOT EXISTS reel_captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  url TEXT,
  platform TEXT NOT NULL,
  fetch_status TEXT NOT NULL CHECK (fetch_status IN ('retrieved','partial','blocked','unavailable','skipped')),
  fetch_reason TEXT,
  title TEXT,
  author TEXT,
  thumbnail_url TEXT,
  description TEXT,
  pasted_caption TEXT,
  destination_id TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reel_captures_owner ON reel_captures(owner, created_at);

CREATE TABLE IF NOT EXISTS reel_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id INTEGER NOT NULL REFERENCES reel_captures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('landmark','food','nature','culture','shopping','stay','other')),
  destination_id TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  evidence TEXT,
  matched_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed','rejected')),
  saved_item_id INTEGER REFERENCES saved_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reel_candidates_capture ON reel_candidates(capture_id);

CREATE TABLE IF NOT EXISTS community_votes (
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, owner)
);
`);
      addColumn(db, "saved_items", "capture_id", "INTEGER REFERENCES reel_captures(id) ON DELETE SET NULL");
      addColumn(db, "places", "lat", "REAL");
      addColumn(db, "places", "lng", "REAL");
      for (const [c, d] of [
        ["owner", "TEXT"],
        ["visit_date", "TEXT"],
        ["spend_cents", "INTEGER"],
        ["currency", "TEXT"],
        ["time_needed_min", "INTEGER"],
        ["best_time", "TEXT"],
      ] as const) addColumn(db, "community_posts", c, d);
      addColumn(db, "community_reports", "owner", "TEXT");
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reports_owner ON community_reports(post_id, owner) WHERE owner IS NOT NULL",
      );

      // The six invented "starter tips" (fake travellers, fabricated likes, pre-marked verified) that earlier versions
      // seeded. Matched on the exact author AND title, and only rows with no owner (no real visitor wrote them).
      const seeded: [string, string][] = [
        ["Priya M.", "Try the pickled mango and crushed ice on Beach Road"],
        ["Arjun R.", "Arrive before 12:30 PM for lunch biryani"],
        ["Ece D.", "Climb up 45 minutes before sunset for the golden hour"],
        ["Marcus T.", "Get the Havuç Dilimi (carrot slice) baklava with kaymak"],
        ["Ananya K.", "Fresh coconut oil halwa lasts weeks"],
        ["Caner Y.", "Sit on the plastic stools under Galata Bridge"],
      ];
      const del = db.prepare("DELETE FROM community_posts WHERE author_name = ? AND title = ? AND owner IS NULL AND is_verified = 1");
      for (const [author, title] of seeded) del.run(author, title);
    },
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

const hasData = (db: Database.Database) =>
  (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'stops'").get() as { n: number })
    .n > 0;

export function currentVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

/** Brings the database to LATEST_VERSION. `file` enables the pre-migration backup (omit for :memory:). */
export function migrate(db: Database.Database, file?: string): { from: number; to: number; backup: string | null } {
  const from = currentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (pending.length === 0) return { from, to: from, backup: null };

  let backup: string | null = null;
  if (file && file !== ":memory:" && hasData(db)) {
    backup = `${file}.pre-v${pending[pending.length - 1].version}.bak`;
    if (fs.existsSync(backup)) backup = null; // keep the first backup, never overwrite it
    else db.prepare("VACUUM INTO ?").run(backup);
  }

  for (const m of pending) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  return { from, to: LATEST_VERSION, backup };
}
