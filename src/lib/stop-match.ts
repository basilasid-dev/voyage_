// Client-safe stop search. Used by the stop picker (typing) and by the "similar stops" hints.
// It only ever helps a person choose a stop. It never changes which routes exist.
import { stopName } from "./i18n";
import type { Lang, Stop } from "./types";

/** Lowercase, letters and digits only (Malayalam letters kept). */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9ഀ-ൿ]+/g, "");

/** Folds common Malayali-English spelling differences: double letters, oo/u, ee/i, w/v, zh/l, th/t. */
export function looseKey(s: string): string {
  return squash(s)
    .replace(/oo/g, "u") // before collapsing, or "oo" would become "o"
    .replace(/ee/g, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/w/g, "v")
    .replace(/zh/g, "l")
    .replace(/th/g, "t")
    .replace(/ou/g, "u");
}

/** Words people type that are not in stop names. */
const SYNONYMS: Record<string, string> = { calicut: "kozhikode", kozhikkode: "kozhikode", kozhicode: "kozhikode" };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9ഀ-ൿ]+/).filter(Boolean);

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** 0 = best. Infinity = no match. */
function score(query: string, stop: Stop): number {
  const q = squash(query);
  if (!q) return 0;
  const qLoose = looseKey(SYNONYMS[q] ?? q);
  let best = Infinity;
  for (const name of [stop.nameEn, stop.nameMl ?? ""]) {
    if (!name) continue;
    const n = squash(name);
    const nLoose = looseKey(name);
    if (n === q) best = Math.min(best, 0);
    else if (qLoose && nLoose === qLoose) best = Math.min(best, 0.5); // same name, different spelling
    else if (n.startsWith(q)) best = Math.min(best, 1);
    else if (words(name).some((w) => w.startsWith(query.toLowerCase().trim()))) best = Math.min(best, 2);
    else if (n.includes(q)) best = Math.min(best, 3);
    else if (qLoose && nLoose.includes(qLoose)) best = Math.min(best, 4);
    else if (qLoose.length >= 4) {
      // Typo tolerance: one edit against the start of the name or against any single word.
      const candidates = [nLoose.slice(0, qLoose.length), ...words(name).map(looseKey)];
      if (candidates.some((c) => c.length >= 3 && editDistance(qLoose, c, 1) <= 1)) best = Math.min(best, 5);
    }
  }
  return best;
}

/** Stops matching what the user typed, best first. Empty query returns everything alphabetically. */
export function matchStops(query: string, stops: Stop[], lang: Lang, limit = 60): Stop[] {
  const byName = (a: Stop, b: Stop) => stopName(a, lang).localeCompare(stopName(b, lang), lang);
  if (!squash(query)) return [...stops].sort(byName).slice(0, limit);
  return stops
    .map((s) => ({ s, sc: score(query, s) }))
    .filter((x) => x.sc !== Infinity)
    .sort((a, b) => a.sc - b.sc || byName(a.s, b.s))
    .slice(0, limit)
    .map((x) => x.s);
}

/**
 * Other stops that might be the same place under a different name ("City" vs "Kozhikode City",
 * "Mukkam" vs "Mukkom"). Suggestions only: the user decides, routes are never merged.
 */
export function similarStops(stop: Stop, all: Stop[], limit = 5): Stop[] {
  const mine = looseKey(stop.nameEn);
  const myWords = words(stop.nameEn).map(looseKey);
  const scored: { s: Stop; sc: number }[] = [];
  for (const o of all) {
    if (o.id === stop.id) continue;
    const theirs = looseKey(o.nameEn);
    const theirWords = words(o.nameEn).map(looseKey);
    let sc = Infinity;
    if (theirs === mine) sc = 0;
    else if (mine.length >= 4 && editDistance(mine, theirs, 1) <= 1) sc = 1;
    else if (myWords.length === 1 && theirWords.includes(myWords[0]) && myWords[0].length >= 4) sc = 2; // "City" in "Kozhikode City"
    else if (theirWords.length === 1 && myWords.includes(theirWords[0]) && theirWords[0].length >= 4) sc = 2;
    if (sc !== Infinity) scored.push({ s: o, sc });
  }
  return scored.sort((a, b) => a.sc - b.sc || a.s.nameEn.localeCompare(b.s.nameEn)).slice(0, limit).map((x) => x.s);
}

/** Display label that tells apart stops sharing the same name (e.g. a demo stop and an imported one). */
export function stopLabels(stops: Stop[], lang: Lang, statusWord: (s: Stop) => string): Map<string, string> {
  const count = new Map<string, number>();
  for (const s of stops) count.set(stopName(s, lang), (count.get(stopName(s, lang)) ?? 0) + 1);
  return new Map(
    stops.map((s) => {
      const n = stopName(s, lang);
      return [s.id, (count.get(n) ?? 0) > 1 ? `${n} (${statusWord(s)})` : n];
    }),
  );
}
