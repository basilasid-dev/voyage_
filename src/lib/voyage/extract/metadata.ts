// Reads the public metadata a platform publishes for a shared link. Honest by construction: every outcome carries a
// status and a reason, and a blocked or empty answer is reported as blocked or empty, never as success.
import type { ParsedLink } from "../validate";
import { fetchPublic, isAllowedUrl, type FetchLike } from "./safe-fetch";

export type FetchStatus = "retrieved" | "partial" | "blocked" | "unavailable" | "skipped";

export interface SourceMetadata {
  status: FetchStatus;
  /** Plain-language explanation, always set unless status is "retrieved". */
  reason: string | null;
  title: string | null;
  author: string | null;
  description: string | null;
  /** Only ever an https image on the platform's own CDN. */
  thumbnailUrl: string | null;
}

const empty = (status: FetchStatus, reason: string): SourceMetadata => ({ status, reason, title: null, author: null, description: null, thumbnailUrl: null });

// ------------------------------------------------------------------ pure parsers (unit-tested)

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };
export function decodeEntities(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (ENTITIES[e.toLowerCase()] !== undefined) return ENTITIES[e.toLowerCase()];
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return m;
    })
    .trim();
}

/** Reads <meta property|name="og:*" content="..."> and <title> from an HTML page. Order of attributes does not matter. */
export function parseOpenGraph(html: string): { title: string | null; description: string | null; image: string | null; siteName: string | null } {
  const meta = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    const value = content ? (content[1] ?? content[2]) : undefined;
    if (key && value !== undefined && !meta.has(key)) meta.set(key, decodeEntities(value));
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const val = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v && v.trim()) ?? null;
  return {
    title: val("og:title", "twitter:title") ?? (titleTag ? decodeEntities(titleTag) : null),
    description: val("og:description", "twitter:description", "description"),
    image: val("og:image", "twitter:image"),
    siteName: val("og:site_name"),
  };
}

export function parseOEmbed(body: string): { title: string | null; author: string | null; description: string | null; thumbnail: string | null } | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null) return null;
  const s = (k: string) => (typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string).trim() : null);
  return { title: s("title"), author: s("author_name"), description: s("description"), thumbnail: s("thumbnail_url") };
}

/** Thumbnails are only kept when they are https images on the platform's own CDN. */
const CDN: Record<string, RegExp> = {
  youtube: /^i\d*\.ytimg\.com$|^img\.youtube\.com$/,
  vimeo: /(^|\.)vimeocdn\.com$/,
  tiktok: /(^|\.)tiktokcdn(-us)?\.com$|(^|\.)tiktokv\.com$/,
  pinterest: /^i\.pinimg\.com$/,
  instagram: /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/,
};
export function safeThumbnail(platform: string, raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && CDN[platform]?.test(u.hostname.toLowerCase()) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Generic login-wall / placeholder titles that mean "we were not shown the post". */
const WALL = /^(instagram|log in|login|sign up|pinterest|pinterest\s*[-–|]|tiktok\s*[-–|]\s*make your day)\b/i;
const LOGIN_HINT = /login|log in|sign up|accounts\/login/i;

// ------------------------------------------------------------------ orchestration

export async function readSourceMetadata(link: ParsedLink, deps: { fetchImpl?: FetchLike } = {}): Promise<SourceMetadata> {
  const { platform, url } = link;
  if (platform === "web" || platform === "manual") {
    return empty("skipped", "Only YouTube, Vimeo, TikTok, Pinterest and Instagram links are read. Paste the caption or description below instead.");
  }

  const oembed: Partial<Record<string, string>> = {
    youtube: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    vimeo: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  };

  // 1) oEmbed (YouTube, Vimeo, TikTok): official, public, small.
  const endpoint = oembed[platform];
  if (endpoint) {
    if (!isAllowedUrl(endpoint)) return empty("unavailable", "This link cannot be read.");
    const r = await fetchPublic(endpoint, { fetchImpl: deps.fetchImpl, accept: "application/json" });
    if (!r.ok) return failureToMeta(r.reason, platform);
    const o = parseOEmbed(r.body);
    if (!o || (!o.title && !o.description)) return empty("unavailable", `${labelOf(platform)} returned nothing we could read.`);
    const hasDesc = !!o.description;
    return {
      status: hasDesc ? "retrieved" : "partial",
      reason: hasDesc ? null : `${labelOf(platform)} shares only the title and channel publicly, not the full description. Paste the description or caption below for a deeper read.`,
      title: o.title, author: o.author, description: o.description, thumbnailUrl: safeThumbnail(platform, o.thumbnail),
    };
  }

  // 2) Open Graph tags (Pinterest, Instagram): what the page offers to anonymous visitors.
  const r = await fetchPublic(url, { fetchImpl: deps.fetchImpl, accept: "text/html" });
  if (!r.ok) return failureToMeta(r.reason, platform);
  const og = parseOpenGraph(r.body);
  const title = og.title && !WALL.test(og.title.trim()) ? og.title : null;
  const description = og.description && !LOGIN_HINT.test(og.description.slice(0, 80)) ? og.description : null;
  if (!title && !description) {
    return empty("blocked", `${labelOf(platform)} did not show this post to an anonymous reader (it asks visitors to log in). Paste the caption or describe the places below.`);
  }
  const both = !!title && !!description;
  return {
    status: both ? "retrieved" : "partial",
    reason: both ? null : `Only part of the post was visible to an anonymous reader. Paste the full caption below for a better read.`,
    title, author: null, description, thumbnailUrl: safeThumbnail(platform, og.image),
  };
}

function labelOf(platform: string): string {
  return { youtube: "YouTube", vimeo: "Vimeo", tiktok: "TikTok", pinterest: "Pinterest", instagram: "Instagram" }[platform] ?? platform;
}

function failureToMeta(reason: string, platform: string): SourceMetadata {
  const p = labelOf(platform);
  if (reason === "disabled") return empty("skipped", "Reading links is switched off on this server. Paste the caption below.");
  if (reason === "timeout") return empty("unavailable", `${p} did not answer in time. Try again, or paste the caption below.`);
  if (reason === "http_401" || reason === "http_403" || reason === "http_429") return empty("blocked", `${p} refused to share this post with an anonymous reader. Paste the caption below.`);
  if (reason === "http_404") return empty("unavailable", `${p} says this link does not exist or is private. Check the link, or paste the caption below.`);
  return empty("unavailable", `${p} could not be reached (${reason.replace(/_/g, " ")}). Paste the caption below.`);
}
