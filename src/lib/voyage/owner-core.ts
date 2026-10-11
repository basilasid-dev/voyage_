// Visitor identity for the travel-planning services. There are no accounts: the browser holds a random 256-bit token
// in an HttpOnly cookie, and the database stores only its SHA-256 as the "owner". Whoever has the cookie can see and
// change those saved items and trips; nobody else can. Clearing cookies or switching browser starts a fresh, empty
// space (there is no cross-device sync).
import { createHash, randomBytes } from "node:crypto";

export const OWNER_COOKIE = "voyage_owner";
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

export const newOwnerToken = (): string => randomBytes(32).toString("base64url");

/** 32 random bytes in base64url are exactly 43 characters. Anything else is not one of ours. */
export const isValidOwnerToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export const hashOwner = (token: string): string => createHash("sha256").update(`voyage:${token}`).digest("hex");
