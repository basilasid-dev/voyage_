// Place-based traveller contributions. Everything here comes from a real visitor: there are no seeded posts, no
// invented users, no fabricated likes. Rules:
//  * A post belongs to the browser that wrote it (owner = hash of its cookie token) and can only be deleted by it.
//  * One "helpful" vote per visitor per post (toggle), never on their own post.
//  * One report per visitor per post; three different visitors reporting a post hides it until an admin decides.
//  * Every post is "unverified": nothing in this app can prove someone really visited, so there is no verified badge.
import type Database from "better-sqlite3";
import { audit } from "../admin/audit";
import type { Currency } from "./content";
import { VoyageError, currency, dayDate, duration, fail, formatDate, money, notes, oneOf, parseDate, text } from "./validate";

type DB = Database.Database;

export const COMMUNITY_CATEGORIES = ["tip", "review", "story", "food", "landmark", "shopping", "culture", "nature"] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];
export const REPORT_REASONS = ["spam", "inaccurate", "inappropriate", "other"] as const;

export const COMMUNITY_LIMITS = { postsPerDay: 5, reportsToHide: 3, title: 120, content: 2000, name: 40, bestTime: 160 } as const;

export interface CommunityPost {
  id: number;
  createdAt: string;
  authorName: string;
  destinationId: string;
  destinationName: string;
  placeId: string | null;
  placeName: string | null;
  title: string;
  content: string;
  category: CommunityCategory;
  helpfulCount: number;
  status: "published" | "hidden" | "reported";
  visitDate: string | null;
  spendCents: number | null;
  currency: string | null;
  timeNeededMin: number | null;
  bestTime: string | null;
  mine: boolean;
  votedByMe: boolean;
}

interface PostRow {
  id: number;
  created_at: string;
  author_name: string;
  destination_id: string;
  destination_name: string;
  place_id: string | null;
  place_name: string | null;
  title: string;
  content: string;
  category: CommunityCategory;
  status: "published" | "hidden" | "reported";
  visit_date: string | null;
  spend_cents: number | null;
  currency: string | null;
  time_needed_min: number | null;
  best_time: string | null;
  owner: string | null;
  helpful: number;
  voted: number;
}

const SELECT = `
  SELECT cp.*, d.name AS destination_name, p.name AS place_name,
         (SELECT COUNT(*) FROM community_votes v WHERE v.post_id = cp.id) AS helpful,
         (SELECT COUNT(*) FROM community_votes v WHERE v.post_id = cp.id AND v.owner = @me) AS voted
  FROM community_posts cp
  LEFT JOIN destinations d ON cp.destination_id = d.id
  LEFT JOIN places p ON cp.place_id = p.id`;

const toPost = (r: PostRow, me: string | null): CommunityPost => ({
  id: r.id,
  createdAt: r.created_at,
  authorName: r.author_name,
  destinationId: r.destination_id,
  destinationName: r.destination_name,
  placeId: r.place_id,
  placeName: r.place_name,
  title: r.title,
  content: r.content,
  category: r.category,
  helpfulCount: r.helpful,
  status: r.status,
  visitDate: r.visit_date,
  spendCents: r.spend_cents,
  currency: r.currency,
  timeNeededMin: r.time_needed_min,
  bestTime: r.best_time,
  mine: !!me && r.owner === me,
  votedByMe: r.voted > 0,
});

/** Published posts only, most helpful first. `me` (optional) marks the viewer's own posts and votes. */
export function listCommunityPosts(
  db: DB,
  filter: { destinationId?: string; category?: string; placeId?: string; me?: string | null; limit?: number } = {},
): CommunityPost[] {
  const rows = db
    .prepare(
      `${SELECT}
       WHERE cp.status = 'published'
         AND (@dest IS NULL OR cp.destination_id = @dest)
         AND (@cat IS NULL OR cp.category = @cat)
         AND (@place IS NULL OR cp.place_id = @place)
       ORDER BY helpful DESC, cp.created_at DESC LIMIT @limit`,
    )
    .all({
      me: filter.me ?? "",
      dest: filter.destinationId || null,
      cat: filter.category && filter.category !== "all" ? filter.category : null,
      place: filter.placeId || null,
      limit: Math.min(filter.limit ?? 50, 100),
    }) as PostRow[];
  return rows.map((r) => toPost(r, filter.me ?? null));
}

export function getCommunityPost(db: DB, id: number, me: string | null = null): CommunityPost | null {
  const row = db.prepare(`${SELECT} WHERE cp.id = @id`).get({ id, me: me ?? "" }) as PostRow | undefined;
  return row ? toPost(row, me) : null;
}

export interface NewPost {
  authorName?: unknown; // optional display name; empty means "Traveller"
  destinationId?: unknown;
  placeId?: unknown;
  title?: unknown;
  content?: unknown;
  category?: unknown;
  visitDate?: unknown; // YYYY-MM-DD, not in the future
  spend?: unknown; // approximate spend per person, decimal text
  currency?: unknown;
  timeNeededMin?: unknown;
  bestTime?: unknown; // practical advice: when to go
}

export function createCommunityPost(db: DB, owner: string, d: NewPost): number {
  const authorName = text(d.authorName, "Name", { max: COMMUNITY_LIMITS.name }) || "Traveller";
  const title = text(d.title, "Title", { min: 4, max: COMMUNITY_LIMITS.title, required: true });
  const content = notes(d.content, "Your experience", COMMUNITY_LIMITS.content);
  if (content.length < 20) fail("validation", "Please share a little more: at least 20 characters about what you actually experienced.");
  const category = oneOf(d.category, COMMUNITY_CATEGORIES, "Category", "tip");

  let visitDate: string | null = null;
  if (d.visitDate !== undefined && d.visitDate !== null && String(d.visitDate).trim() !== "") {
    const n = parseDate(d.visitDate, "Visit date");
    if (n > Math.floor(Date.now() / 86_400_000)) fail("validation", "The visit date cannot be in the future.");
    visitDate = formatDate(n);
  }
  const spend = money(d.spend, "Approximate spend");
  const timeNeeded = duration(d.timeNeededMin, "Time needed");
  const bestTime = text(d.bestTime, "Best time to go", { max: COMMUNITY_LIMITS.bestTime }) || null;

  return db.transaction(() => {
    const dest = db.prepare("SELECT currency FROM destinations WHERE id = ?").get(String(d.destinationId ?? "")) as { currency: string } | undefined;
    if (!dest) fail("validation", "Choose a destination.");
    let placeId: string | null = null;
    if (typeof d.placeId === "string" && d.placeId) {
      const pl = db.prepare("SELECT destination_id FROM places WHERE id = ?").get(d.placeId) as { destination_id: string } | undefined;
      if (!pl || pl.destination_id !== d.destinationId) fail("validation", "That place does not belong to the chosen destination.");
      placeId = d.placeId;
    }
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const recent = (db.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE owner = ? AND created_at > ?").get(owner, since) as { n: number }).n;
    if (recent >= COMMUNITY_LIMITS.postsPerDay) fail("limit", `You can share at most ${COMMUNITY_LIMITS.postsPerDay} contributions a day. Please come back tomorrow.`);

    return Number(
      db
        .prepare(
          `INSERT INTO community_posts (created_at, author_name, destination_id, place_id, title, content, category, likes_count, is_verified,
             status, owner, visit_date, spend_cents, currency, time_needed_min, best_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'published', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          new Date().toISOString(), authorName, String(d.destinationId), placeId, title, content, category, owner, visitDate, spend,
          spend === null ? null : currency(d.currency, dest!.currency as Currency), timeNeeded, bestTime,
        ).lastInsertRowid,
    );
  })();
}

export function deleteCommunityPost(db: DB, owner: string, id: number): void {
  const r = db.prepare("DELETE FROM community_posts WHERE id = ? AND owner = ?").run(id, owner);
  if (r.changes === 0) fail("not_found", "That contribution was not found.");
}

/** Toggles the visitor's "helpful" vote. Returns true if the vote now exists. */
export function toggleHelpful(db: DB, owner: string, id: number): boolean {
  return db.transaction(() => {
    const post = db.prepare("SELECT owner, status FROM community_posts WHERE id = ?").get(id) as { owner: string | null; status: string } | undefined;
    if (!post || post.status !== "published") return fail("not_found", "That contribution was not found.");
    if (post.owner === owner) return fail("conflict", "You cannot mark your own contribution as helpful.");
    const del = db.prepare("DELETE FROM community_votes WHERE post_id = ? AND owner = ?").run(id, owner);
    if (del.changes > 0) return false;
    db.prepare("INSERT INTO community_votes (post_id, owner, created_at) VALUES (?, ?, ?)").run(id, owner, new Date().toISOString());
    return true;
  })();
}

export function reportCommunityPost(db: DB, owner: string, d: { postId: number; reason: unknown; details?: unknown }): void {
  const reason = oneOf(d.reason, REPORT_REASONS, "Reason");
  const details = text(d.details, "Details", { max: 500 });
  db.transaction(() => {
    const post = db.prepare("SELECT status FROM community_posts WHERE id = ?").get(d.postId);
    if (!post) fail("not_found", "That contribution was not found.");
    if (db.prepare("SELECT 1 FROM community_reports WHERE post_id = ? AND owner = ?").get(d.postId, owner)) {
      fail("conflict", "You have already reported this contribution.");
    }
    db.prepare("INSERT INTO community_reports (created_at, post_id, reason, details, status, owner) VALUES (?, ?, ?, ?, 'open', ?)").run(
      new Date().toISOString(), d.postId, reason, details || null, owner,
    );
    const open = (db.prepare("SELECT COUNT(DISTINCT owner) AS n FROM community_reports WHERE post_id = ? AND status = 'open'").get(d.postId) as { n: number }).n;
    // Several different visitors flagged it: take it off the page until a person has looked.
    if (open >= COMMUNITY_LIMITS.reportsToHide) db.prepare("UPDATE community_posts SET status = 'reported' WHERE id = ? AND status = 'published'").run(d.postId);
  })();
}

// ------------------------------------------------------------------ moderation (admin)

export interface ModerationItem {
  post: CommunityPost;
  openReports: { reason: string; details: string | null; createdAt: string }[];
}

/** Posts that are reported or hidden, or have open reports, newest first. */
export function listForModeration(db: DB): ModerationItem[] {
  const rows = db
    .prepare(
      `${SELECT}
       WHERE cp.status <> 'published'
          OR EXISTS (SELECT 1 FROM community_reports r WHERE r.post_id = cp.id AND r.status = 'open')
       ORDER BY cp.created_at DESC LIMIT 100`,
    )
    .all({ me: "" }) as PostRow[];
  const reports = db.prepare("SELECT reason, details, created_at FROM community_reports WHERE post_id = ? AND status = 'open' ORDER BY id");
  return rows.map((r) => ({
    post: toPost(r, null),
    openReports: (reports.all(r.id) as { reason: string; details: string | null; created_at: string }[]).map((x) => ({
      reason: x.reason, details: x.details, createdAt: x.created_at,
    })),
  }));
}

/** hide = remove from the page; restore = publish again; dismiss = keep published and close the reports. */
export function moderatePost(db: DB, actor: string, postId: number, action: unknown, noteInput?: unknown): void {
  const act = oneOf(action, ["hide", "restore", "dismiss"] as const, "Action");
  const note = text(noteInput, "Note", { max: 500, required: act === "hide" });
  db.transaction(() => {
    const post = db.prepare("SELECT status FROM community_posts WHERE id = ?").get(postId) as { status: string } | undefined;
    if (!post) fail("not_found", "That contribution was not found.");
    const status = act === "hide" ? "hidden" : "published";
    db.prepare("UPDATE community_posts SET status = ? WHERE id = ?").run(status, postId);
    db.prepare("UPDATE community_reports SET status = ? WHERE post_id = ? AND status = 'open'").run(act === "dismiss" || act === "restore" ? "dismissed" : "reviewed", postId);
    audit(db, { actor, action: `community_${act}`, entityType: "community_post", entityId: postId, before: { status: post!.status }, after: { status }, note });
  })();
}

export { VoyageError, dayDate };
