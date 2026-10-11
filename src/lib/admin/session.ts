import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/connection";
import { adminConfig, createSession, destroySession, RateLimiter, SESSION_TTL_MS, validateSession } from "./auth-core";

export const SESSION_COOKIE = "cbg_admin";

interface Limiters {
  login: RateLimiter; // per client address
  loginAll: RateLimiter; // all clients together: bounds guessing even if addresses are forged
  report: RateLimiter;
  reportAll: RateLimiter;
}
const g = globalThis as unknown as { __cbgLimiters?: Limiters };
export const limiters: Limiters = (g.__cbgLimiters ??= {
  login: new RateLimiter(5, 15 * 60_000),
  loginAll: new RateLimiter(25, 15 * 60_000),
  report: new RateLimiter(5, 10 * 60_000),
  reportAll: new RateLimiter(120, 60 * 60_000),
});

/**
 * Best-effort client address. X-Forwarded-For can be forged unless a trusted proxy sets it, which is why the
 * limiters above also have a global bucket. Never used for anything but throttling.
 */
export function clientKey(h: Headers): string {
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (xff || h.get("x-real-ip") || "unknown").slice(0, 64);
}

const cookieOptions = (expires?: Date) => ({
  httpOnly: true, // not readable from scripts
  sameSite: "strict" as const, // not sent on cross-site requests
  secure: process.env.NODE_ENV === "production" && process.env.ADMIN_INSECURE_COOKIES !== "1",
  path: "/",
  ...(expires ? { expires } : { maxAge: 0 }),
});

/** The signed-in admin, or null. Always re-checked against the database. */
export async function currentAdmin(): Promise<{ actor: string } | null> {
  const cfg = adminConfig();
  if (!cfg.configured) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(getDb(), token) ? { actor: cfg.actor } : null;
}

/** For pages: send visitors who are not signed in to the login page. */
export async function requireAdmin(): Promise<{ actor: string }> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function startAdminSession(): Promise<void> {
  const { token, expiresAt } = createSession(getDb());
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  destroySession(getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE, "", cookieOptions());
}

export const requestKey = async () => clientKey(await headers());
export { SESSION_TTL_MS };
