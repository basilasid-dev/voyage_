// Reel-to-Travel: social inspiration -> extracted places -> saved collection -> trip.
// A "capture" is one pasted link and/or caption plus what could honestly be read from it. Its "candidates" are the
// places found; nothing is saved until the person confirms them (after correcting names, categories, destinations).
// Owner-scoped like saved.ts and trips.ts: someone else's capture looks exactly like a missing one.
import type Database from "better-sqlite3";
import { destinationLabel } from "./extract/gazetteer";
import type { Analysis } from "./extract";
import type { Confidence } from "./extract/places-text";
import type { FetchStatus } from "./extract/metadata";
import { createCollection, createSaved, getSaved, savePlace, type SavedItem } from "./saved";
import { addActivitiesFromSaved } from "./trips";
import { CATEGORIES, LIMITS, VoyageError, fail, notes, oneOf, text, type Category, type Platform } from "./validate";

type DB = Database.Database;
const now = () => new Date().toISOString();
const squash = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export const MAX_CAPTURES = 100;

export interface Candidate {
  id: number;
  name: string;
  category: Category;
  destinationId: string | null;
  destinationName: string | null;
  confidence: Confidence;
  evidence: string | null;
  matchedPlaceId: string | null;
  status: "suggested" | "confirmed" | "rejected";
  savedItemId: number | null;
  /** Filled for confirmed candidates: where the saved item is planned. */
  saved: SavedItem | null;
}

export interface Capture {
  id: number;
  url: string | null;
  platform: Platform;
  fetchStatus: FetchStatus;
  fetchReason: string | null;
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  pastedCaption: string | null;
  destinationId: string | null;
  destinationName: string | null;
  createdAt: string;
}

export interface CaptureDetail extends Capture {
  candidates: Candidate[];
}

interface CaptureRow {
  id: number; url: string | null; platform: Platform; fetch_status: FetchStatus; fetch_reason: string | null; title: string | null;
  author: string | null; thumbnail_url: string | null; description: string | null; pasted_caption: string | null;
  destination_id: string | null; destination_name: string | null; created_at: string;
}

const toCapture = (r: CaptureRow): Capture => ({
  id: r.id, url: r.url, platform: r.platform, fetchStatus: r.fetch_status, fetchReason: r.fetch_reason, title: r.title, author: r.author,
  thumbnailUrl: r.thumbnail_url, description: r.description, pastedCaption: r.pasted_caption, destinationId: r.destination_id,
  destinationName: r.destination_name, createdAt: r.created_at,
});

const CAPTURE_SELECT = "SELECT c.*, d.name AS destination_name FROM reel_captures c LEFT JOIN destinations d ON d.id = c.destination_id";

/** Stores an analysis (from extract/analyzeSource) so the person can review it. Nothing is saved to the library yet. */
export function createCapture(db: DB, owner: string, a: Analysis): number {
  return db.transaction(() => {
    const count = (db.prepare("SELECT COUNT(*) AS n FROM reel_captures WHERE owner = ?").get(owner) as { n: number }).n;
    if (count >= MAX_CAPTURES) fail("limit", `You can keep at most ${MAX_CAPTURES} captures. Delete some first.`);
    const dests = a.extraction.destinations;
    const lead = dests[0] && (!dests[1] || dests[0].mentions > dests[1].mentions) ? dests[0].id : null;
    const id = Number(
      db
        .prepare(
          `INSERT INTO reel_captures (owner, url, platform, fetch_status, fetch_reason, title, author, thumbnail_url, description, pasted_caption, destination_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          owner, a.url, a.platform, a.metadata.status, a.metadata.reason, a.metadata.title, a.metadata.author, a.metadata.thumbnailUrl,
          a.metadata.description, a.caption || null, lead, now(),
        ).lastInsertRowid,
    );
    const ins = db.prepare(
      `INSERT INTO reel_candidates (capture_id, name, category, destination_id, confidence, evidence, matched_place_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of a.extraction.candidates) {
      ins.run(id, c.name, c.category === "other" ? "other" : c.category, c.destinationId, c.confidence, c.evidence, c.matchedPlaceId);
    }
    return id;
  })();
}

export function listCaptures(db: DB, owner: string, limit = 12): (Capture & { candidateCount: number; savedCount: number })[] {
  const rows = db
    .prepare(
      `${CAPTURE_SELECT.replace("SELECT c.*,", "SELECT c.*, (SELECT COUNT(*) FROM reel_candidates k WHERE k.capture_id = c.id AND k.status <> 'rejected') AS n, (SELECT COUNT(*) FROM reel_candidates k WHERE k.capture_id = c.id AND k.status = 'confirmed') AS saved,")}
       WHERE c.owner = ? ORDER BY c.id DESC LIMIT ?`,
    )
    .all(owner, limit) as (CaptureRow & { n: number; saved: number })[];
  return rows.map((r) => ({ ...toCapture(r), candidateCount: r.n, savedCount: r.saved }));
}

export function getCapture(db: DB, owner: string, id: number): CaptureDetail | null {
  const row = db.prepare(`${CAPTURE_SELECT} WHERE c.id = ? AND c.owner = ?`).get(id, owner) as CaptureRow | undefined;
  if (!row) return null;
  const rows = db
    .prepare(
      `SELECT k.*, d.name AS destination_name FROM reel_candidates k LEFT JOIN destinations d ON d.id = k.destination_id
       WHERE k.capture_id = ? ORDER BY CASE k.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, k.id`,
    )
    .all(id) as { id: number; name: string; category: Category; destination_id: string | null; destination_name: string | null; confidence: Confidence; evidence: string | null; matched_place_id: string | null; status: Candidate["status"]; saved_item_id: number | null }[];
  return {
    ...toCapture(row),
    candidates: rows.map((k) => ({
      id: k.id, name: k.name, category: k.category, destinationId: k.destination_id, destinationName: k.destination_name,
      confidence: k.confidence, evidence: k.evidence, matchedPlaceId: k.matched_place_id, status: k.status, savedItemId: k.saved_item_id,
      saved: k.saved_item_id ? getSaved(db, owner, k.saved_item_id) : null,
    })),
  };
}

export function deleteCapture(db: DB, owner: string, id: number): void {
  const r = db.prepare("DELETE FROM reel_captures WHERE id = ? AND owner = ?").run(id, owner);
  if (r.changes === 0) fail("not_found", "That capture was not found.");
}

function ownCapture(db: DB, owner: string, id: number): CaptureRow {
  const row = db.prepare(`${CAPTURE_SELECT} WHERE c.id = ? AND c.owner = ?`).get(id, owner) as CaptureRow | undefined;
  return row ?? fail("not_found", "That capture was not found.");
}

/** The person adds a place the finder missed. It starts as a suggestion like any other. */
export function addManualCandidate(db: DB, owner: string, captureId: number, input: { name?: unknown; category?: unknown; destinationId?: unknown }): number {
  return db.transaction(() => {
    ownCapture(db, owner, captureId);
    const name = text(input.name, "Place name", { min: 2, max: LIMITS.title, required: true });
    const category = oneOf(input.category, CATEGORIES, "Category", "other");
    const dest = typeof input.destinationId === "string" && input.destinationId ? input.destinationId : null;
    if (dest && !db.prepare("SELECT 1 FROM destinations WHERE id = ?").get(dest)) fail("validation", "That destination does not exist.");
    const n = (db.prepare("SELECT COUNT(*) AS n FROM reel_candidates WHERE capture_id = ?").get(captureId) as { n: number }).n;
    if (n >= 30) fail("limit", "A capture can hold at most 30 places.");
    return Number(
      db
        .prepare("INSERT INTO reel_candidates (capture_id, name, category, destination_id, confidence, evidence) VALUES (?, ?, ?, ?, 'high', 'Added by you')")
        .run(captureId, name, category, dest).lastInsertRowid,
    );
  })();
}

export function rejectCandidates(db: DB, owner: string, captureId: number, candidateIds: number[]): void {
  db.transaction(() => {
    ownCapture(db, owner, captureId);
    const upd = db.prepare("UPDATE reel_candidates SET status = 'rejected' WHERE id = ? AND capture_id = ? AND status = 'suggested'");
    for (const id of candidateIds) upd.run(id, captureId);
  })();
}

export interface Pick {
  candidateId: number;
  /** The person's corrections. Anything left out keeps the suggested value. */
  name?: unknown;
  category?: unknown;
  destinationId?: unknown;
  notes?: unknown;
}

export interface ConfirmResult {
  saved: { candidateId: number; savedId: number }[];
  /** Places that were already in the library: linked, not duplicated. */
  alreadySaved: { candidateId: number; savedId: number; name: string }[];
  failed: { candidateId: number; reason: string }[];
  collectionId: number | null;
}

/**
 * Saves the places the person confirmed (with their corrections) into their library, optionally into a collection.
 * Duplicates are never created: a place already saved (same curated place, or same name in the same destination) is
 * linked to the existing item instead. The original link, platform, tags and a short source note travel with each item.
 */
export function confirmCandidates(
  db: DB,
  owner: string,
  captureId: number,
  picks: Pick[],
  opts: { collectionId?: unknown; newCollectionName?: unknown; tags?: unknown } = {},
): ConfirmResult {
  return db.transaction(() => {
    const cap = ownCapture(db, owner, captureId);
    if (picks.length === 0) fail("validation", "Select at least one place to save.");

    let collectionId: number | null = null;
    const newName = typeof opts.newCollectionName === "string" ? opts.newCollectionName.trim() : "";
    if (newName) {
      try {
        collectionId = createCollection(db, owner, newName);
      } catch (e) {
        // a collection with that name already exists: use it
        const ex = db.prepare("SELECT id FROM collections WHERE owner = ? AND name = ?").get(owner, newName) as { id: number } | undefined;
        if (e instanceof VoyageError && e.code === "conflict" && ex) collectionId = ex.id;
        else throw e;
      }
    } else if (opts.collectionId !== undefined && opts.collectionId !== null && opts.collectionId !== "") {
      const n = Number(opts.collectionId);
      if (!db.prepare("SELECT 1 FROM collections WHERE id = ? AND owner = ?").get(n, owner)) fail("validation", "That collection does not exist.");
      collectionId = n;
    }

    const result: ConfirmResult = { saved: [], alreadySaved: [], failed: [], collectionId };
    const setCand = db.prepare("UPDATE reel_candidates SET name = ?, category = ?, destination_id = ?, status = 'confirmed', saved_item_id = ? WHERE id = ?");

    for (const pick of picks) {
      const cand = db.prepare("SELECT * FROM reel_candidates WHERE id = ? AND capture_id = ?").get(pick.candidateId, captureId) as
        | { id: number; name: string; category: Category; destination_id: string | null; evidence: string | null; matched_place_id: string | null; status: string }
        | undefined;
      if (!cand || cand.status === "rejected") {
        result.failed.push({ candidateId: pick.candidateId, reason: "That place is not available any more." });
        continue;
      }
      try {
        const name = text(pick.name ?? cand.name, "Place name", { min: 2, max: LIMITS.title, required: true });
        const category = oneOf(pick.category ?? cand.category, CATEGORIES, "Category", "other");
        const destId = (pick.destinationId !== undefined ? String(pick.destinationId) : cand.destination_id) || null;
        if (destId && !db.prepare("SELECT 1 FROM destinations WHERE id = ?").get(destId)) fail("validation", "That destination does not exist.");
        const userNotes = notes(pick.notes, "Notes", 1200);

        // Duplicate: same curated place, or same name in the same destination, already in the library.
        const dup =
          (cand.matched_place_id && (db.prepare("SELECT id, title FROM saved_items WHERE owner = ? AND place_id = ?").get(owner, cand.matched_place_id) as { id: number; title: string } | undefined)) ||
          ((db.prepare("SELECT id, title, destination_id FROM saved_items WHERE owner = ?").all(owner) as { id: number; title: string; destination_id: string | null }[]).find(
            (s) => squash(s.title) === squash(name) && (s.destination_id ?? null) === destId,
          ));
        if (dup) {
          setCand.run(name, category, destId, dup.id, cand.id);
          result.alreadySaved.push({ candidateId: cand.id, savedId: dup.id, name: dup.title });
          if (collectionId !== null) db.prepare("UPDATE saved_items SET collection_id = COALESCE(collection_id, ?) WHERE id = ? AND owner = ?").run(collectionId, dup.id, owner);
          continue;
        }

        const source = [`From ${cap.platform === "manual" ? "pasted text" : cap.platform}`, cand.evidence].filter(Boolean).join(". ");
        const mergedNotes = [userNotes, source].filter(Boolean).join("\n\n").slice(0, 2000);
        let savedId: number;
        if (cand.matched_place_id) {
          // A curated place: start from its real details (area, visit time, cost range), then attach the source.
          savedId = savePlace(db, owner, cand.matched_place_id).id;
          db.prepare("UPDATE saved_items SET title = ?, capture_id = ?, url = COALESCE(url, ?), platform = CASE WHEN url IS NULL AND ? IS NOT NULL THEN ? ELSE platform END, collection_id = COALESCE(?, collection_id), tags = COALESCE(?, tags), notes = ?, updated_at = ? WHERE id = ? AND owner = ?")
            .run(name, captureId, cap.url, cap.url, cap.platform, collectionId, tagsFrom(opts.tags), mergedNotes || null, now(), savedId, owner);
        } else {
          savedId = createSaved(db, owner, {
            title: name, url: cap.url, destinationId: destId, collectionId, category, notes: mergedNotes, tags: opts.tags, captureId,
          });
        }
        setCand.run(name, category, destId, savedId, cand.id);
        result.saved.push({ candidateId: cand.id, savedId });
      } catch (e) {
        if (e instanceof VoyageError) result.failed.push({ candidateId: pick.candidateId, reason: e.message });
        else throw e;
      }
    }
    return result;
  })();
}

const tagsFrom = (v: unknown): string | null => {
  const raw = typeof v === "string" ? v : "";
  const t = [...new Set(raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 6);
  return t.length ? t.join(",") : null;
};

/** Adds every confirmed place of a capture that is not planned in this trip yet to the chosen day. */
export function addCaptureToTrip(db: DB, owner: string, captureId: number, tripId: number, day: unknown) {
  const cap = getCapture(db, owner, captureId);
  if (!cap) fail("not_found", "That capture was not found.");
  const ids = cap!.candidates.filter((c) => c.status === "confirmed" && c.savedItemId).map((c) => c.savedItemId!);
  if (ids.length === 0) fail("validation", "Confirm and save some places first.");
  return addActivitiesFromSaved(db, owner, tripId, day, ids);
}

export { destinationLabel };
