// Admin authentication primitives. No Next.js imports, so everything here is unit-testable.
//
//  * Passwords: scrypt with a random salt, compared in constant time. Format (safe in .env files, no "$"):
//      scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
//  * Sessions: a random 256-bit token lives in an httpOnly cookie; only its SHA-256 is stored in the database,
//    so a leaked database does not leak usable sessions, and logging out truly revokes the session.
//  * Admin access fails closed: with no password configured nobody can log in.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false;
  try {
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (expected.length === 0) return false;
    const actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: 128 * n * r * 2 });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export interface AdminConfig {
  configured: boolean;
  /** Name recorded in the audit log. */
  actor: string;
  verify: (password: string) => boolean;
  /** Why admin is unavailable, for the login page and logs. */
  problem?: string;
}

/**
 * ADMIN_PASSWORD_HASH (recommended, see `pnpm admin:hash`) works everywhere.
 * ADMIN_PASSWORD (plain text) is accepted only outside production, for local development.
 */
export function adminConfig(env: Record<string, string | undefined> = process.env): AdminConfig {
  const actor = (env.ADMIN_NAME ?? "").trim().slice(0, 40) || "admin";
  const hash = env.ADMIN_PASSWORD_HASH?.trim();
  if (hash) {
    if (!/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/.test(hash)) {
      return { configured: false, actor, verify: () => false, problem: "ADMIN_PASSWORD_HASH is not a valid hash. Generate it with `pnpm admin:hash`." };
    }
    return { configured: true, actor, verify: (pw) => verifyPassword(pw, hash) };
  }
  const plain = env.ADMIN_PASSWORD;
  if (plain && env.NODE_ENV !== "production") {
    const want = digest(plain);
    return { configured: true, actor, verify: (pw) => timingSafeEqual(digest(pw), want) };
  }
  return {
    configured: false,
    actor,
    verify: () => false,
    problem:
      env.NODE_ENV === "production" && plain
        ? "Plain ADMIN_PASSWORD is ignored in production. Use ADMIN_PASSWORD_HASH."
        : "Admin is not configured. Set ADMIN_PASSWORD_HASH (see README).",
  };
}

// ------------------------------------------------------------------ sessions

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSession(db: Database.Database, now = Date.now()): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(new Date(now).toISOString()); // tidy up
  db.prepare("INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    new Date(now).toISOString(),
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function validateSession(db: Database.Database, token: string | undefined, now = Date.now()): boolean {
  if (!token || token.length < 20 || token.length > 100) return false;
  const row = db.prepare("SELECT expires_at FROM admin_sessions WHERE token_hash = ?").get(hashToken(token)) as
    | { expires_at: string }
    | undefined;
  if (!row) return false;
  if (row.expires_at <= new Date(now).toISOString()) {
    destroySession(db, token);
    return false;
  }
  return true;
}

export function destroySession(db: Database.Database, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(hashToken(token));
}

// ------------------------------------------------------------------ rate limiting

/**
 * Sliding-window limiter, in memory (one per server process). Used for login attempts and passenger reports.
 * `key` is usually a client address. Because an address can be forged when the app is not behind a trusted
 * proxy, callers also use a second limiter with a global key so total volume stays bounded either way.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
    private clock: () => number = Date.now,
  ) {}

  private prune(key: string): number[] {
    const cutoff = this.clock() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** True if another event is allowed right now (does not record anything). */
  allowed(key: string): boolean {
    return this.prune(key).length < this.max;
  }

  /** Records an event. */
  record(key: string): void {
    const list = this.prune(key);
    list.push(this.clock());
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.hits.delete(this.hits.keys().next().value as string); // bound memory
  }

  /** Seconds until the key is allowed again (0 if allowed). */
  retryAfter(key: string): number {
    const list = this.prune(key);
    if (list.length < this.max) return 0;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - this.clock()) / 1000));
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
