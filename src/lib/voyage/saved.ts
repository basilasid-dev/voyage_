// Saved inspiration: links (Pinterest, Instagram, videos, any web page), manual place details and saved curated
// places, organised into collections. Every function takes the owner (a hash of the visitor's cookie token) and
// only ever touches that owner's rows; asking for someone else's row looks exactly like "not found".
import type Database from "better-sqlite3";
import {
  CATEGORIES, LIMITS, PLATFORM_LABEL, currency, duration, fail, money, notes, oneOf, parseLink, text,
  type Category, type Platform,
} from "./validate";

type DB = Database.Database;
const now = () => new Date().toISOString();

export interface SavedInput {
  title?: unknown;
  url?: unknown;
  destinationId?: unknown;
  collectionId?: unknown;
  category?: unknown;
  location?: unknown;
  notes?: unknown;
  durationMin?: unknown;
  cost?: unknown; // decimal text, e.g. "250" or "12.50"
  currency?: unknown;
  tags?: unknown; // comma-separated, e.g. "sunset, street food"
  captureId?: unknown; // the Reel-to-Travel capture this came from
  sourceNote?: unknown; // short excerpt of the original caption, kept with the item
}

export interface SavedItem {
  id: number;
  title: string;
  url: string | null;
  platform: Platform;
  destinationId: string | null;
  destinationName: string | null;
  collectionId: number | null;
  collectionName: string | null;
  placeId: string | null;
  category: Category;
  location: string | null;
  notes: string | null;
  durationMin: number | null;
  costCents: number | null;
  currency: string | null;
  tags: string[];
  captureId: number | null;
  /** Where this item is already planned. Empty = not planned yet. */
  plannedIn: { tripId: number; tripName: string; day: number }[];
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: number;
  title: string;
  url: string | null;
  platform: Platform;
  destination_id: string | null;
  destination_name: string | null;
  collection_id: number | null;
  collection_name: string | null;
  place_id: string | null;
  category: Category;
  location: string | null;
  notes: string | null;
  duration_min: number | null;
  cost_cents: number | null;
  currency: string | null;
  tags: string | null;
  capture_id: number | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `
  SELECT s.*, d.name AS destination_name, c.name AS collection_name
  FROM saved_items s
  LEFT JOIN destinations d ON d.id = s.destination_id
  LEFT JOIN collections c ON c.id = s.collection_id`;

const toItem = (r: Row): SavedItem => ({
  id: r.id,
  title: r.title,
  url: r.url,
  platform: r.platform,
  destinationId: r.destination_id,
  destinationName: r.destination_name,
  collectionId: r.collection_id,
  collectionName: r.collection_name,
  placeId: r.place_id,
  category: r.category,
  location: r.location,
  notes: r.notes,
  durationMin: r.duration_min,
  costCents: r.cost_cents,
  currency: r.currency,
  tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
  captureId: r.capture_id,
  plannedIn: [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ------------------------------------------------------------------ collections

export interface Collection {
  id: number;
  name: string;
  itemCount: number;
}

export function listCollections(db: DB, owner: string): Collection[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM saved_items s WHERE s.collection_id = c.id) AS n
       FROM collections c WHERE c.owner = ? ORDER BY c.name COLLATE NOCASE`,
    )
    .all(owner) as { id: number; name: string; n: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, itemCount: r.n }));
}

function ownCollection(db: DB, owner: string, id: unknown): number {
  const n = Number(id);
  const row = Number.isInteger(n) ? db.prepare("SELECT id FROM collections WHERE id = ? AND owner = ?").get(n, owner) : undefined;
  return row ? n : fail("validation", "That collection does not exist.");
}

export function createCollection(db: DB, owner: string, nameInput: unknown): number {
  const name = text(nameInput, "Collection name", { max: LIMITS.collection, required: true });
  return db.transaction(() => {
    const count = (db.prepare("SELECT COUNT(*) AS n FROM collections WHERE owner = ?").get(owner) as { n: number }).n;
    if (count >= LIMITS.collectionsPerOwner) fail("limit", `You can have at most ${LIMITS.collectionsPerOwner} collections.`);
    if (db.prepare("SELECT 1 FROM collections WHERE owner = ? AND name = ?").get(owner, name)) fail("conflict", "You already have a collection with that name.");
    return Number(db.prepare("INSERT INTO collections (owner, name, created_at) VALUES (?, ?, ?)").run(owner, name, now()).lastInsertRowid);
  })();
}

export function renameCollection(db: DB, owner: string, id: number, nameInput: unknown): void {
  const name = text(nameInput, "Collection name", { max: LIMITS.collection, required: true });
  db.transaction(() => {
    ownCollection(db, owner, id);
    const clash = db.prepare("SELECT id FROM collections WHERE owner = ? AND name = ? AND id <> ?").get(owner, name, id);
    if (clash) fail("conflict", "You already have a collection with that name.");
    db.prepare("UPDATE collections SET name = ? WHERE id = ? AND owner = ?").run(name, id, owner);
  })();
}

/** Deleting a collection keeps its items; they just become uncategorised. */
export function deleteCollection(db: DB, owner: string, id: number): void {
  db.transaction(() => {
    ownCollection(db, owner, id);
    db.prepare("DELETE FROM collections WHERE id = ? AND owner = ?").run(id, owner);
  })();
}

// ------------------------------------------------------------------ items

function destinationOrNull(db: DB, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const id = String(value);
  return db.prepare("SELECT id FROM destinations WHERE id = ?").get(id) ? id : fail("validation", "That destination does not exist.");
}

/** "Sunset, Street Food" -> "sunset,street food". At most 6 tags of 24 characters. */
export function parseTags(value: unknown): string | null {
  const raw = typeof value === "string" ? value : "";
  const NL = String.fromCharCode(10);
  const clean = (t: string) => t.split(" ").filter(Boolean).join(" ").trim().toLowerCase();
  const tags = [...new Set(raw.split(NL).join(",").split(",").map((t) => clean(t.trim().startsWith("#") ? t.trim().slice(1) : t)).filter(Boolean))];
  if (tags.length > 6) fail("validation", "Use at most 6 tags.");
  for (const t of tags) {
    if (t.length > 24) fail("validation", "Each tag can be at most 24 characters.");
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c < 32 || c === 127) fail("validation", "Tags contain invalid characters.");
    }
  }
  return tags.length ? tags.join(",") : null;
}

function normalise(db: DB, owner: string, input: SavedInput) {
  const link = parseLink(input.url);
  let title = text(input.title, "Title", { max: LIMITS.title });
  if (!title) {
    if (!link) fail("validation", "Give the place a title, or paste a link.");
    title = `${PLATFORM_LABEL[link!.platform]} · ${link!.host}`;
  }
  const destinationId = destinationOrNull(db, input.destinationId);
  const collectionId = input.collectionId === undefined || input.collectionId === null || input.collectionId === "" ? null : ownCollection(db, owner, input.collectionId);
  const cost = money(input.cost, "Estimated cost");
  const dest = destinationId ? (db.prepare("SELECT currency FROM destinations WHERE id = ?").get(destinationId) as { currency: string }).currency : "INR";
  return {
    title,
    url: link?.url ?? null,
    platform: (link?.platform ?? "manual") as Platform,
    destinationId,
    collectionId,
    category: oneOf(input.category, CATEGORIES, "Category", "other"),
    location: text(input.location, "Location", { max: LIMITS.location }) || null,
    notes: notes(input.notes) || null,
    durationMin: duration(input.durationMin, "Visit duration"),
    costCents: cost,
    currency: cost === null ? null : currency(input.currency, dest as never),
    tags: parseTags(input.tags),
    captureId: ownCapture(db, owner, input.captureId),
  };
}

/** A capture id is only kept if it is this visitor's own. */
function ownCapture(db: DB, owner: string, value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && db.prepare("SELECT 1 FROM reel_captures WHERE id = ? AND owner = ?").get(n, owner) ? n : null;
}

export function createSaved(db: DB, owner: string, input: SavedInput): number {
  return db.transaction(() => {
    const v = normalise(db, owner, input);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM saved_items WHERE owner = ?").get(owner) as { n: number }).n;
    if (count >= LIMITS.savedPerOwner) fail("limit", `You can save at most ${LIMITS.savedPerOwner} items. Delete some first.`);
    const at = now();
    return Number(
      db
        .prepare(
          `INSERT INTO saved_items (owner, title, url, platform, destination_id, collection_id, category, location, notes,
             duration_min, cost_cents, currency, tags, capture_id, created_at, updated_at)
           VALUES (@owner, @title, @url, @platform, @destinationId, @collectionId, @category, @location, @notes,
             @durationMin, @costCents, @currency, @tags, @captureId, @at, @at)`,
        )
        .run({ owner, ...v, at }).lastInsertRowid,
    );
  })();
}

export function updateSaved(db: DB, owner: string, id: number, input: SavedInput): void {
  db.transaction(() => {
    const cur = db.prepare("SELECT id FROM saved_items WHERE id = ? AND owner = ?").get(id, owner);
    if (!cur) fail("not_found", "That saved item was not found.");
    const v = normalise(db, owner, input);
    db.prepare(
      `UPDATE saved_items SET title = @title, url = @url, platform = @platform, destination_id = @destinationId,
         collection_id = @collectionId, category = @category, location = @location, notes = @notes,
         duration_min = @durationMin, cost_cents = @costCents, currency = @currency, tags = @tags, updated_at = @at
       WHERE id = @id AND owner = @owner`,
    ).run({ id, owner, ...v, at: now() });
  })();
}

export function deleteSaved(db: DB, owner: string, id: number): void {
  db.transaction(() => {
    const r = db.prepare("DELETE FROM saved_items WHERE id = ? AND owner = ?").run(id, owner);
    if (r.changes === 0) fail("not_found", "That saved item was not found.");
  })();
}

/** Moves an item into a collection (or out of every collection with null). */
export function moveToCollection(db: DB, owner: string, id: number, collectionId: number | null): void {
  db.transaction(() => {
    if (collectionId !== null) ownCollection(db, owner, collectionId);
    const r = db.prepare("UPDATE saved_items SET collection_id = ?, updated_at = ? WHERE id = ? AND owner = ?").run(collectionId, now(), id, owner);
    if (r.changes === 0) fail("not_found", "That saved item was not found.");
  })();
}

export function getSaved(db: DB, owner: string, id: number): SavedItem | null {
  const r = db.prepare(`${SELECT} WHERE s.id = ? AND s.owner = ?`).get(id, owner) as Row | undefined;
  return r ? attachPlanned(db, owner, [toItem(r)])[0] : null;
}

export interface SavedFilter {
  destinationId?: string;
  collectionId?: number | "none";
  category?: string;
  q?: string;
  tag?: string;
  planned?: "planned" | "unplanned";
}

export function listSaved(db: DB, owner: string, f: SavedFilter = {}): SavedItem[] {
  const q = f.q?.trim() ? `%${f.q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%` : null;
  const rows = db
    .prepare(
      `${SELECT}
       WHERE s.owner = @owner
         AND (@dest IS NULL OR s.destination_id = @dest)
         AND (@cat IS NULL OR s.category = @cat)
         AND (@col IS NULL OR (@col = -1 AND s.collection_id IS NULL) OR s.collection_id = @col)
         AND (@q IS NULL OR s.title LIKE @q ESCAPE '\\' OR s.notes LIKE @q ESCAPE '\\' OR s.location LIKE @q ESCAPE '\\' OR s.tags LIKE @q ESCAPE '\\')
         AND (@tag IS NULL OR (',' || COALESCE(s.tags, '') || ',') LIKE @tag ESCAPE '\\')
         AND (@planned IS NULL
              OR (@planned = 'planned' AND EXISTS (SELECT 1 FROM voyage_activities a WHERE a.saved_item_id = s.id))
              OR (@planned = 'unplanned' AND NOT EXISTS (SELECT 1 FROM voyage_activities a WHERE a.saved_item_id = s.id)))
       ORDER BY s.updated_at DESC, s.id DESC LIMIT 500`,
    )
    .all({
      owner,
      dest: f.destinationId || null,
      cat: f.category || null,
      col: f.collectionId === undefined ? null : f.collectionId === "none" ? -1 : f.collectionId,
      q,
      tag: f.tag?.trim() ? `%,${f.tag.trim().toLowerCase().replace(/[%_\\]/g, (c) => "\\" + c)},%` : null,
      planned: f.planned ?? null,
    }) as Row[];
  return attachPlanned(db, owner, rows.map(toItem));
}

/** Fills in where each item is already planned (one query for the whole list). */
function attachPlanned(db: DB, owner: string, items: SavedItem[]): SavedItem[] {
  if (items.length === 0) return items;
  const rows = db
    .prepare(
      `SELECT a.saved_item_id AS sid, t.id AS trip_id, t.name AS trip_name, a.day
       FROM voyage_activities a JOIN voyage_trips t ON t.id = a.trip_id
       WHERE t.owner = ? AND a.saved_item_id IS NOT NULL ORDER BY t.start_date, a.day`,
    )
    .all(owner) as { sid: number; trip_id: number; trip_name: string; day: number }[];
  const by = new Map<number, SavedItem["plannedIn"]>();
  for (const r of rows) (by.get(r.sid) ?? by.set(r.sid, []).get(r.sid)!).push({ tripId: r.trip_id, tripName: r.trip_name, day: r.day });
  for (const i of items) i.plannedIn = by.get(i.id) ?? [];
  return items;
}

/**
 * Saves a curated place as an item (once: saving it again returns the existing item). The saved copy starts with the
 * middle of the place's rough cost range; the person can change it.
 */
export function savePlace(db: DB, owner: string, placeId: string): { id: number; created: boolean } {
  return db.transaction(() => {
    const place = db.prepare("SELECT * FROM places WHERE id = ?").get(placeId) as
      | { id: string; destination_id: string; name: string; category: Category; area: string; notes: string | null; duration_min: number; cost_min_cents: number; cost_max_cents: number; currency: string }
      | undefined;
    if (!place) return fail("not_found", "That place was not found.");
    const existing = db.prepare("SELECT id FROM saved_items WHERE owner = ? AND place_id = ?").get(owner, placeId) as { id: number } | undefined;
    if (existing) return { id: existing.id, created: false };
    const count = (db.prepare("SELECT COUNT(*) AS n FROM saved_items WHERE owner = ?").get(owner) as { n: number }).n;
    if (count >= LIMITS.savedPerOwner) fail("limit", `You can save at most ${LIMITS.savedPerOwner} items. Delete some first.`);
    const at = now();
    const id = Number(
      db
        .prepare(
          `INSERT INTO saved_items (owner, title, platform, destination_id, place_id, category, location, notes, duration_min, cost_cents, currency, created_at, updated_at)
           VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(owner, place.name, place.destination_id, place.id, place.category, place.area, place.notes, place.duration_min, Math.round((place.cost_min_cents + place.cost_max_cents) / 2), place.currency, at, at).lastInsertRowid,
    );
    return { id, created: true };
  })();
}

/** Ids of curated places this owner has already saved (to show "Saved" on cards). */
export function savedPlaceIds(db: DB, owner: string): Set<string> {
  return new Set((db.prepare("SELECT place_id FROM saved_items WHERE owner = ? AND place_id IS NOT NULL").all(owner) as { place_id: string }[]).map((r) => r.place_id));
}
