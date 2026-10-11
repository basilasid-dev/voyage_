// Input validation shared by saved items and trips. Pure functions; every failure is a VoyageError whose message
// is safe to show to the person who typed the value.
import { CURRENCIES, type Currency } from "./content";

export type VoyageErrorCode = "not_found" | "validation" | "limit" | "conflict";

export class VoyageError extends Error {
  constructor(
    public code: VoyageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoyageError";
  }
}
export const fail = (code: VoyageErrorCode, message: string): never => {
  throw new VoyageError(code, message);
};

export const CATEGORIES = ["landmark", "food", "nature", "culture", "shopping", "stay", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const EXPENSE_CATEGORIES = ["transport", "food", "entry", "stay", "shopping", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const PLATFORMS = ["pinterest", "instagram", "youtube", "tiktok", "vimeo", "web", "manual"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const LIMITS = {
  title: 120,
  location: 160,
  notes: 2000,
  url: 2000,
  collection: 40,
  tripName: 80,
  expenseLabel: 80,
  maxTripDays: 60,
  maxDuration: 24 * 60,
  maxMoneyCents: 1_000_000_000, // 10 million units
  savedPerOwner: 500,
  collectionsPerOwner: 30,
  tripsPerOwner: 50,
  activitiesPerTrip: 300,
  expensesPerTrip: 500,
} as const;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_NO_NEWLINE = /[\u0000-\u001F\u007F]/;

/** Single-line text: collapses whitespace, bounds the length, rejects control characters. */
export function text(value: unknown, field: string, o: { max: number; min?: number; required?: boolean }): string {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!s) {
    if (o.required) fail("validation", `${field} is required.`);
    return "";
  }
  if (CONTROL_NO_NEWLINE.test(s)) fail("validation", `${field} contains invalid characters.`);
  if (s.length > o.max) fail("validation", `${field} must be at most ${o.max} characters.`);
  if (o.min && s.length < o.min) fail("validation", `${field} must be at least ${o.min} characters.`);
  return s;
}

/** Multi-line notes: keeps line breaks, trims each line's ends, bounds the length. */
export function notes(value: unknown, field = "Notes", max: number = LIMITS.notes): string {
  const s = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  if (!s) return "";
  if (CONTROL.test(s)) fail("validation", `${field} contains invalid characters.`);
  if (s.length > max) fail("validation", `${field} must be at most ${max} characters.`);
  return s;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const hit = allowed.find((a) => a === value);
  return hit ?? fail("validation", `${field} is not valid.`);
}

export const currency = (value: unknown, fallback?: Currency): Currency =>
  oneOf(typeof value === "string" ? value.toUpperCase() : value, CURRENCIES, "Currency", fallback);

/** Whole minutes between 1 and 24 hours; empty means "unknown". */
export function duration(value: unknown, field = "Duration"): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxDuration) fail("validation", `${field} must be a whole number of minutes between 1 and ${LIMITS.maxDuration}.`);
  return n;
}

/** "12", "12.5", "1,250.00" -> cents. Empty means "none". At most two decimals; never negative. */
export function money(value: unknown, field = "Amount"): number | null {
  if (value === undefined || value === null) return null;
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (raw === "") return null;
  const cleaned = raw.replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) fail("validation", `${field} must be a positive number with at most two decimals.`);
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents > LIMITS.maxMoneyCents) fail("validation", `${field} is too large.`);
  return cents;
}

export function formatMoney(cents: number, cur: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: cur,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

export function formatRange(minCents: number, maxCents: number, cur: string): string {
  if (maxCents === 0) return "Free";
  if (minCents === maxCents) return formatMoney(minCents, cur);
  return `${formatMoney(minCents, cur)} – ${formatMoney(maxCents, cur)}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ------------------------------------------------------------------ dates (calendar dates, no time zones)

/** Strict YYYY-MM-DD that is a real calendar date. Returns the UTC day number (days since 1970-01-01). */
export function parseDate(value: unknown, field = "Date"): number {
  const s = typeof value === "string" ? value.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return fail("validation", `${field} must be a date (YYYY-MM-DD).`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (y < 1990 || y > 2100 || back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return fail("validation", `${field} is not a real date.`);
  }
  return Math.round(t / 86_400_000);
}

export const formatDate = (dayNumber: number): string => new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);

/** Number of days in a trip, inclusive of both ends. */
export function tripLength(startDate: unknown, endDate: unknown): number {
  const a = parseDate(startDate, "Start date");
  const b = parseDate(endDate, "End date");
  if (b < a) fail("validation", "The end date must be on or after the start date.");
  const n = b - a + 1;
  if (n > LIMITS.maxTripDays) fail("validation", `A trip can be at most ${LIMITS.maxTripDays} days.`);
  return n;
}

export const dayDate = (startDate: string, day: number): string => formatDate(parseDate(startDate) + day - 1);

// ------------------------------------------------------------------ links

export interface ParsedLink {
  url: string;
  platform: Platform;
  host: string;
}

const PLATFORM_HOSTS: [Platform, RegExp][] = [
  // Real Pinterest domains only: pinterest.com, pinterest.co.uk, pinterest.com.au, pinterest.de ... (not pinterest.com.evil.example)
  ["pinterest", /(^|\.)pinterest\.(com|co\.uk|com\.au|[a-z]{2})$|^pin\.it$/],
  ["instagram", /(^|\.)instagram\.com$|^instagr\.am$/],
  ["youtube", /(^|\.)youtube\.com$|^youtu\.be$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["vimeo", /(^|\.)vimeo\.com$/],
];

export const PLATFORM_LABEL: Record<Platform, string> = {
  pinterest: "Pinterest",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  vimeo: "Vimeo",
  web: "Web link",
  manual: "Manual entry",
};

/**
 * Accepts only http(s) links. The link is stored and shown as a link; the app never fetches it, so there is no
 * server-side request to a user-supplied address. `javascript:`, `data:`, `file:` and similar are rejected.
 */
export function parseLink(value: unknown): ParsedLink | null {
  if (value === undefined || value === null) return null;
  let raw = String(value).trim();
  if (raw === "") return null;
  if (raw.length > LIMITS.url) fail("validation", `The link must be at most ${LIMITS.url} characters.`);
  if (CONTROL_NO_NEWLINE.test(raw) || /\s/.test(raw)) fail("validation", "The link must not contain spaces or control characters.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`; // "pinterest.com/pin/123" -> https://...
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail("validation", "That does not look like a valid link.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") fail("validation", "Only http and https links can be saved.");
  if (u.username || u.password) fail("validation", "Links must not contain a username or password.");
  const host = u.hostname.toLowerCase();
  if (!host.includes(".")) fail("validation", "That does not look like a valid link.");
  const platform = PLATFORM_HOSTS.find(([, re]) => re.test(host))?.[0] ?? "web";
  return { url: u.toString(), platform, host };
}
