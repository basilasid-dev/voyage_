// Stop-name handling for imports.
//
// Two levels, on purpose:
//  1. Automatic and safe: case, punctuation (dots, hyphens) and spacing differences collapse to one
//     key ("KODUVALLY." = "KODUVALLY", "R.E.C" = "REC", "NOORAM THODE" = "NOORAMTHODE").
//  2. Reviewed aliases (STOP_ALIASES): known spelling variants of the SAME place. Every entry was
//     checked by a person. Similar-looking names are never merged by guessing, because a wrong merge
//     creates routes that do not exist. Possible duplicates are only reported (findPossibleDuplicates).
//
// Deliberately NOT merged: CITY, KOZHIKKODE, KOZHIKODE CITY, CITY STAND, RAILWAY STATION ... These
// may be different physical stops in the city. The UI offers them as "similar stops" instead.

/** Uppercase, dots removed, other punctuation -> space, whitespace collapsed. Keeps word breaks. */
export function normalizeStopName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[^A-Z0-9]+/g, " ") // ASCII only: keys become stop ids that the API validates
    .trim();
}

/** Spaceless key used to identify a stop. */
export const baseKey = (raw: string): string => normalizeStopName(raw).replace(/ /g, "");

/** variant key -> canonical key (both spaceless, uppercase). Reviewed spelling variants only. */
export const STOP_ALIASES: Record<string, string> = {
  KOZHIKODE: "KOZHIKKODE",
  GOTHESWARAM: "GOTHEESWARAM",
  CHEEKILODE: "CHEEKKILODE",
  OORKADAVU: "OORKKADAVU",
  THOTTUMUKAM: "THOTTUMUKKAM",
  KUNNAMANGALM: "KUNNAMANGALAM",
  MUKKOM: "MUKKAM",
  AREAKODE: "AREEKODE",
  TIRUR: "THIRUR",
  // Added after reviewing the "possible duplicates" report of the full dataset. Same pronunciation,
  // different spelling. A local person should re-check these; differently-named places such as
  // Mavoor/Mokavoor or Palangad/Pavangad are real, separate places and are NOT here.
  KOODARANHI: "KOODARANJI",
  KUNNATHUPALAM: "KUNNATHPALAM",
  PANTHEERANKAVU: "PANTHEERANKAVE",
  KUNDOOPARAMBA: "KUNDUPARAMBA",
  KODANCHERY: "KODENCHERY",
  MANAKKADAVU: "MANAKKADAVE",
  POOLAKADAVU: "POOLAKKADAVE",
  BHUTTROAD: "BHATTROAD",
};

export const canonicalKey = (raw: string): string => {
  const k = baseKey(raw);
  return STOP_ALIASES[k] ?? k;
};

/** Malayalam names (developer transliterations, unverified). Keyed by canonical key. */
export const MALAYALAM_NAMES: Record<string, string> = {
  MEDICALCOLLEGE: "മെഡിക്കൽ കോളേജ്",
  KOZHIKKODE: "കോഴിക്കോട്",
  CITY: "സിറ്റി",
  THAMARASSERY: "താമരശ്ശേരി",
  NARIKKUNI: "നരിക്കുനി",
  MUKKAM: "മുക്കം",
  BALUSSERI: "ബാലുശ്ശേരി",
  KUNNAMANGALAM: "കുന്ദമംഗലം",
  POOVATTUPARAMBA: "പൂവാട്ടുപറമ്പ്",
  BEYPORE: "ബേപ്പൂർ",
  MAVOOR: "മാവൂർ",
  PERUMANNA: "പെരുമണ്ണ",
  KODUVALLY: "കൊടുവള്ളി",
  FEROKE: "ഫറോക്ക്",
  RAMANATTUKARA: "രാമനാട്ടുകര",
  OMASSERY: "ഓമശ്ശേരി",
  THIRUVAMBADI: "തിരുവമ്പാടി",
  VELLIMADUKUNNU: "വെള്ളിമാടുകുന്ന്",
  PANTHEERANKAVE: "പന്തീരാങ്കാവ്",
  RAILWAYSTATIONKOZHIKODE: "റെയിൽവേ സ്റ്റേഷൻ കോഴിക്കോട്",
  KODENCHERY: "കോടഞ്ചേരി",
  MEENCHANDA: "മീഞ്ചന്ത",
  MARADBEACH: "മാറാട് ബീച്ച്",
  EDAVANNAPARA: "എടവണ്ണപ്പാറ",
  ELATHUR: "എലത്തൂർ",
  AREEKODE: "അരീക്കോട്",
  KUNDUPARAMBA: "കുണ്ടുപറമ്പ്",
  MANKAVU: "മാങ്കാവ്",
  CHELAVOOR: "ചേലവൂർ",
  PARAMBILBAZAR: "പറമ്പിൽ ബസാർ",
  KOYILANDY: "കൊയിലാണ്ടി",
  VADAKARA: "വടകര",
  THIRUR: "തിരൂർ",
  PALAYAM: "പാളയം",
  MANANCHIRA: "മാനാഞ്ചിറ",
};

const DISPLAY_OVERRIDES: Record<string, string> = { REC: "REC", KSRTC: "KSRTC" };

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** English display name from a normalized name. */
export const displayName = (normalized: string): string =>
  DISPLAY_OVERRIDES[normalized.replace(/ /g, "")] ?? titleCase(normalized);

/** Plain Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
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

/**
 * Pairs of different stops whose names are within 2 edits. For human review only: nothing is merged.
 * `uses` maps canonical key -> how many times it appears, so the report can show the busier name first.
 */
export function findPossibleDuplicates(
  names: Map<string, string>, // key -> display name
  uses: Map<string, number>,
  limit = 25,
): { a: string; b: string; usesA: number; usesB: number }[] {
  const keys = [...names.keys()].filter((k) => k.length >= 6);
  const out: { a: string; b: string; usesA: number; usesB: number }[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (editDistance(keys[i], keys[j], 2) <= 2) {
        const [x, y] = (uses.get(keys[i]) ?? 0) >= (uses.get(keys[j]) ?? 0) ? [keys[i], keys[j]] : [keys[j], keys[i]];
        out.push({ a: names.get(x)!, b: names.get(y)!, usesA: uses.get(x) ?? 0, usesB: uses.get(y) ?? 0 });
      }
    }
  }
  return out.sort((p, q) => p.usesB - q.usesB).reverse().slice(0, limit);
}
