// Finds places, activities and the destination in free text (a title, a description, a caption the user pasted).
// Rule-based and fully explainable: every candidate says WHY it was suggested (evidence) and how sure we are:
//   high    the name is in our gazetteer (a curated place or a well-known place of the destination)
//   medium  the author marked it: a 📍 line or a list item
//   low     a guess: a capitalised phrase after "at/in/near/visit", or a #hashtag that looks like a place
// It never invents a place: if nothing is recognised it returns nothing and says so.
import type { PlaceCategory } from "../content";
import { DESTINATION_NAMES, GAZETTEER, type GazetteerEntry } from "./gazetteer";

export type Confidence = "high" | "medium" | "low";

export interface TextSource {
  label: "title" | "description" | "caption";
  text: string;
}

export interface Candidate {
  name: string;
  category: PlaceCategory;
  destinationId: string | null;
  confidence: Confidence;
  /** Where it came from, e.g. `caption: "…📍 Galata Tower, Istanbul…"`. */
  evidence: string;
  matchedPlaceId: string | null;
}

export interface ExtractionResult {
  candidates: Candidate[];
  destinations: { id: string; mentions: number }[];
  /** Things to do mentioned in the text (sunset, ferry ride, food tour…). */
  activities: string[];
  /** Plain-language reminders of what could not be found. */
  gaps: string[];
  overall: Confidence | "none";
}

// ------------------------------------------------------------------ text helpers

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const squash = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");
const clean = (s: string) => s.normalize("NFKC").replace(/[​-‍﻿]/g, "").replace(/\r\n?/g, "\n");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function snippet(text: string, start: number, end: number, label: string): string {
  const a = Math.max(0, start - 35);
  const b = Math.min(text.length, end + 35);
  return `${label}: “${a > 0 ? "…" : ""}${text.slice(a, b).replace(/\s+/g, " ").trim()}${b < text.length ? "…" : ""}”`;
}

const FOOD = /\b(biryani|restaurant|cafe|café|caf[eé]|bakery|baklava|halwa|kebab|breakfast|brunch|lunch|dinner|street food|seafood|sweets?|dessert|meze|simit|chai|tea garden|coffee|dosa|sulaimani|thali|pastry|ice cream|eatery|diner|grill)\b/i;
const SHOP = /\b(bazaar|bazar|market|shopping|souk|mall|street market)\b/i;
const NATURE = /\b(beach|waterfall|falls|park|hill|hills|dam|island|islands|forest|lake|trek|hike|river|backwater|garden)\b/i;
const CULTURE = /\b(museum|gallery|church|temple|mosque|palace|fort|fortress|heritage|craft|theatre|theater|neighbourhood|neighborhood)\b/i;
const LAND = /\b(tower|bridge|square|monument|lighthouse|cistern|viewpoint|view point|landmark|port|harbour|harbor|waterfront)\b/i;

export function categorize(name: string, context: string): PlaceCategory {
  const s = `${name} ${context}`;
  if (FOOD.test(name)) return "food";
  if (SHOP.test(name)) return "shopping";
  if (NATURE.test(name)) return "nature";
  if (CULTURE.test(name)) return "culture";
  if (LAND.test(name)) return "landmark";
  if (FOOD.test(s)) return "food";
  return "other";
}

const ACTIVITIES: [RegExp, string][] = [
  [/\bsunset\b/i, "sunset"], [/\bsunrise\b/i, "sunrise"], [/\bferry\b/i, "ferry ride"], [/\bboat (ride|trip|tour)\b/i, "boat ride"],
  [/\bfood tour\b|\bstreet food\b/i, "street food"], [/\b(hike|hiking|trek|trekking)\b/i, "hiking"], [/\bwaterfalls?\b/i, "waterfall visit"],
  [/\bshopping\b|\bbargain/i, "shopping"], [/\bphotograph|photo spot|\bphoto walk/i, "photography"], [/\bswim|\bsnorkel/i, "swimming"],
  [/\bwalking tour\b|\bwalk along\b|\bstroll/i, "walking"], [/\bhammam\b|\bturkish bath\b/i, "hammam"], [/\bnight ?life\b/i, "nightlife"],
];

// ------------------------------------------------------------------ the finder

const GENERIC_TAGS = new Set([
  "travel", "traveltok", "travelgram", "reels", "reel", "trending", "viral", "fyp", "foryou", "foryoupage", "instagood", "instatravel", "explore",
  "wanderlust", "foodie", "food", "vlog", "shorts", "love", "india", "turkey", "turkiye", "kerala", "istanbul", "kozhikode", "calicut", "holiday",
  "vacation", "trip", "tourism", "photography", "photooftheday", "nature", "beach", "sunset", "life", "daily", "style", "fashion", "tiktok",
]);
const STOP_NAMES = new Set([
  "i", "we", "you", "the", "this", "that", "my", "our", "instagram", "youtube", "tiktok", "pinterest", "follow", "like", "share", "subscribe", "link",
  "bio", "comment", "video", "reel", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march",
  "april", "may", "june", "july", "august", "september", "october", "november", "december", "day", "part", "pm", "am", "inr", "eur", "usd", "try",
  "india", "turkey", "kerala", "istanbul", "kozhikode", "calicut", "malabar", "europe", "asia", "turkiye", "türkiye",
]);

/** Gazetteer lookup by squashed name, so #GalataTower and 'galatatower' resolve to the known place. */
const GAZ_BY_SQUASH = new Map<string, GazetteerEntry>();
for (const e of GAZETTEER) for (const n of [e.name, ...e.aliases]) GAZ_BY_SQUASH.set(squash(n), e);

interface Hit {
  c: Candidate;
  rank: number;
}
const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function extractFromText(sourcesIn: TextSource[]): ExtractionResult {
  const sources = sourcesIn.map((s) => ({ label: s.label, text: clean(s.text) })).filter((s) => s.text.trim());
  const hits = new Map<string, Hit>(); // key: squashed name
  const destScore = new Map<string, number>();

  const add = (c: Candidate) => {
    const key = c.matchedPlaceId ?? squash(c.name);
    if (!key || STOP_NAMES.has(fold(c.name))) return;
    const prev = hits.get(key);
    if (!prev || RANK[c.confidence] > prev.rank) hits.set(key, { c, rank: RANK[c.confidence] });
  };

  // Gazetteer names, longest first, each text position used once ("Galata Bridge" must not also match "Galata").
  const terms: { entry: GazetteerEntry; term: string }[] = GAZETTEER.flatMap((entry) => [entry.name, ...entry.aliases].map((term) => ({ entry, term })))
    .sort((a, b) => b.term.length - a.term.length);

  for (const src of sources) {
    const folded = fold(src.text);
    const used: [number, number][] = [];
    const taken = (a: number, b: number) => used.some(([x, y]) => a < y && b > x);

    for (const { entry, term } of terms) {
      const re = new RegExp(`(?<![a-z0-9])${escapeRe(fold(term)).replace(/\s+/g, "\\s+")}(?![a-z0-9])`, "g");
      for (const m of folded.matchAll(re)) {
        const a = m.index ?? 0;
        const b = a + m[0].length;
        if (taken(a, b)) continue;
        used.push([a, b]);
        add({
          name: entry.name, category: entry.category, destinationId: entry.destinationId, confidence: "high",
          evidence: snippet(src.text, a, b, src.label), matchedPlaceId: entry.placeId,
        });
        destScore.set(entry.destinationId, (destScore.get(entry.destinationId) ?? 0) + 2);
      }
    }

    // Destination mentions
    for (const [id, names] of Object.entries(DESTINATION_NAMES)) {
      for (const n of new Set(names.map(fold))) {
        const hitsN = folded.match(new RegExp(`(?<![a-z0-9])${escapeRe(n)}(?![a-z0-9])`, "g"));
        if (hitsN) destScore.set(id, (destScore.get(id) ?? 0) + hitsN.length);
      }
    }

    // 📍 lines and "Location:" lines
    for (const m of src.text.matchAll(/(?:📍|📌|Location\s*:|Place\s*:)\s*([^\n]{2,90})/giu)) {
      const raw = m[1].split(/[|•#]|\s[-–—]\s|\s{2,}/)[0].replace(/[.!,;:]+$/, "").trim();
      const name = firstPlacePart(raw);
      if (name && name.length >= 3) {
        add({
          name, category: categorize(name, src.text), destinationId: null, confidence: "medium",
          evidence: snippet(src.text, m.index ?? 0, (m.index ?? 0) + m[0].length, src.label), matchedPlaceId: null,
        });
      }
    }

    // List items: "1. Name - description", "• Name", "- Name"
    for (const m of src.text.matchAll(/^[ \t]*(?:\d{1,2}[.)]|[-•*▪▫→✅🔹🔸⭐])[ \t]+([^\n]{3,100})$/gmu)) {
      const head = m[1].split(/\s[-–—:]\s|:\s|\s\(|\s{2,}/)[0].replace(/[.!,;:]+$/, "").trim();
      if (/^[\p{Lu}0-9]/u.test(head) && head.split(/\s+/).length <= 6 && head.length >= 3) {
        add({
          name: head, category: categorize(head, m[1]), destinationId: null, confidence: "medium",
          evidence: snippet(src.text, m.index ?? 0, (m.index ?? 0) + m[0].length, src.label), matchedPlaceId: null,
        });
      }
    }

    // "at/in/near/visit <Capitalised Name>"
    for (const m of src.text.matchAll(/\b(?:at|in|near|visit(?:ing)?|from|to|try|tried|eat(?:ing)? at)\s+((?:[\p{Lu}][\p{L}'’.-]+)(?:\s+(?:of|the|de|al|el)?\s*[\p{Lu}][\p{L}'’.-]+){0,3})/gu)) {
      const name = m[1].replace(/[.'’-]+$/, "").trim();
      if (name.length >= 4 && !STOP_NAMES.has(fold(name)) && !isDestinationName(name)) {
        add({
          name, category: categorize(name, src.text), destinationId: null, confidence: "low",
          evidence: snippet(src.text, m.index ?? 0, (m.index ?? 0) + m[0].length, src.label), matchedPlaceId: null,
        });
      }
    }

    // #HashtagsLikeThis that look like a place name
    for (const m of src.text.matchAll(/#([\p{L}][\p{L}0-9_]{5,40})/gu)) {
      const tag = m[1];
      if (GENERIC_TAGS.has(fold(tag))) continue;
      const words = tag.replace(/_/g, " ").replace(/(?<=[\p{Ll}0-9])(?=[\p{Lu}])/gu, " ").split(/\s+/);
      if (words.length >= 2 && words.length <= 3 && words.every((w) => w.length >= 3) && /[\p{Lu}]/u.test(tag.slice(1))) {
        const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
        const known = GAZ_BY_SQUASH.get(squash(name));
        if (known) {
          add({
            name: known.name, category: known.category, destinationId: known.destinationId, confidence: "high",
            evidence: snippet(src.text, m.index ?? 0, (m.index ?? 0) + m[0].length, src.label), matchedPlaceId: known.placeId,
          });
          destScore.set(known.destinationId, (destScore.get(known.destinationId) ?? 0) + 2);
        } else if (!isDestinationName(name)) {
          add({
            name, category: categorize(name, src.text), destinationId: null, confidence: "low",
            evidence: snippet(src.text, m.index ?? 0, (m.index ?? 0) + m[0].length, src.label), matchedPlaceId: null,
          });
        }
      }
    }
  }

  // Destination inference: the destination with the most evidence, if it clearly leads.
  const ranked = [...destScore.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  const inferred = top && (!second || top[1] > second[1]) ? top[0] : null;
  for (const { c } of hits.values()) if (!c.destinationId && inferred) c.destinationId = inferred;

  const candidates = [...hits.values()]
    .sort((a, b) => b.rank - a.rank)
    .map((h) => h.c)
    .slice(0, 14);

  const all = sources.map((s) => s.text).join("\n");
  const activities = ACTIVITIES.filter(([re]) => re.test(all)).map(([, label]) => label).slice(0, 6);
  const overall: ExtractionResult["overall"] = candidates.some((c) => c.confidence === "high")
    ? "high" : candidates.some((c) => c.confidence === "medium") ? "medium" : candidates.length ? "low" : "none";

  const gaps: string[] = [];
  if (sources.length === 0) gaps.push("There was no text to read. Paste the caption or describe the places.");
  else if (candidates.length === 0) gaps.push("No place names were recognised in this text. Add them yourself below, or paste a fuller caption.");
  if (candidates.length > 0 && overall === "low") gaps.push("Only low-confidence guesses were found. Please check every name before saving.");
  if (sources.length > 0 && !inferred) gaps.push("The destination is not clear from the text. Choose it when you confirm the places.");

  return {
    candidates,
    destinations: ranked.map(([id, mentions]) => ({ id, mentions })),
    activities,
    gaps,
    overall,
  };
}

function isDestinationName(name: string): boolean {
  const f = fold(name);
  return Object.values(DESTINATION_NAMES).some((names) => names.some((n) => fold(n) === f));
}

/** "Galata Tower, Istanbul" -> "Galata Tower". Keeps a leading place, drops city/country tails. */
function firstPlacePart(raw: string): string {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  return isDestinationName(first) ? "" : first;
}
