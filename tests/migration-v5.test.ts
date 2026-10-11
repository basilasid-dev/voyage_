import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { currentVersion, LATEST_VERSION, migrate, MIGRATIONS } from "../src/lib/db/migrations";
import { seedVoyageContent } from "../src/lib/voyage/seed";

/** A database exactly as the previous release left it: migrations 1-4 applied, version 4. */
function v4() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const m of MIGRATIONS.filter((x) => x.version <= 4)) m.up(db);
  db.pragma("user_version = 4");
  return db;
}

const post = (db: Database.Database, author: string, title: string, verified: number, owner?: string) => {
  const cols = owner === undefined ? "" : "";
  void cols;
  db.prepare(
    `INSERT INTO community_posts (created_at, author_name, destination_id, title, content, category, likes_count, is_verified, status)
     VALUES ('2026-01-01T00:00:00Z', ?, 'kozhikode', ?, 'content content content content', 'tip', 12, ?, 'published')`,
  ).run(author, title, verified);
};

describe("migration v5 (reel-to-travel and real community)", () => {
  it("removes only the six invented starter posts and keeps everything else", () => {
    const db = v4();
    db.exec("INSERT INTO destinations (id, name, country, summary, currency, image, image_alt) VALUES ('kozhikode','Kozhikode','India','s','INR','x','x')");
    const cols = (db.prepare("PRAGMA table_info(destinations)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(cols.includes("currency"));
    post(db, "Priya M.", "Try the pickled mango and crushed ice on Beach Road", 1);
    post(db, "Caner Y.", "Sit on the plastic stools under Galata Bridge", 1);
    post(db, "Priya M.", "A real post by someone with the same name", 0); // same author, different title
    post(db, "Priya M.", "Try the pickled mango and crushed ice on Beach Road", 0); // same text but not marked verified: not a seed
    assert.equal(currentVersion(db), 4);

    const r = migrate(db);
    assert.deepEqual([r.from, r.to], [4, LATEST_VERSION]);
    const left = db.prepare("SELECT title, is_verified FROM community_posts ORDER BY id").all() as { title: string; is_verified: number }[];
    assert.equal(left.length, 2);
    assert.ok(left.every((p) => p.is_verified === 0));
  });

  it("adds the new tables and columns and leaves the bus tables untouched", () => {
    const db = v4();
    const busBefore = ["stops", "services", "trips", "trip_stops", "fares"].map(
      (t) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name).join(","),
    );
    migrate(db);
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    for (const t of ["reel_captures", "reel_candidates", "community_votes"]) assert.ok(cols(t).length > 0, t);
    assert.ok(cols("places").includes("lat") && cols("places").includes("lng"));
    assert.ok(cols("saved_items").includes("capture_id"));
    for (const c of ["owner", "visit_date", "spend_cents", "currency", "time_needed_min", "best_time"]) assert.ok(cols("community_posts").includes(c), c);
    assert.ok(cols("community_reports").includes("owner"));
    const busAfter = ["stops", "services", "trips", "trip_stops", "fares"].map((t) => cols(t).join(","));
    assert.deepEqual(busAfter, busBefore);
  });

  it("is idempotent and curated content is seeded with approximate coordinates", () => {
    const db = v4();
    migrate(db);
    assert.equal(currentVersion(db), LATEST_VERSION);
    assert.deepEqual(migrate(db), { from: LATEST_VERSION, to: LATEST_VERSION, backup: null });
    seedVoyageContent(db);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM places WHERE lat IS NOT NULL AND lng IS NOT NULL").get() as { n: number }).n;
    assert.ok(n > 0);
  });
});

