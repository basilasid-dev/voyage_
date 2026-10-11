import "server-only";
import { cookies } from "next/headers";
import { OWNER_COOKIE, OWNER_COOKIE_MAX_AGE, hashOwner, isValidOwnerToken, newOwnerToken } from "./owner-core";

/**
 * The visitor's private space, or null if they have none yet (pages then show empty lists). Reading never sets a
 * cookie: that only happens when the visitor first saves something (ensureOwner, in a server action).
 */
export async function currentOwner(): Promise<string | null> {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  return isValidOwnerToken(token) ? hashOwner(token) : null;
}

/** Returns the visitor's owner id, creating the cookie on first use. Only call from server actions. */
export async function ensureOwner(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(OWNER_COOKIE)?.value;
  if (isValidOwnerToken(existing)) return hashOwner(existing);
  const token = newOwnerToken();
  jar.set(OWNER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.ADMIN_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: OWNER_COOKIE_MAX_AGE,
  });
  return hashOwner(token);
}
