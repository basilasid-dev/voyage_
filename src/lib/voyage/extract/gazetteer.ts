// Names the place finder can recognise with confidence. Two kinds of entries:
//  * the curated places in content.ts (matched to their record, so "Add to trip" has full details), and
//  * a short list of other well-known places in the two destinations (recognised by name only).
// This is general knowledge written for this project, not live data. It is deliberately small: the finder never
// pretends to know a place it has not been taught; unknown names are offered with low confidence for the user to check.
import type { PlaceCategory } from "../content";
import { DESTINATIONS, PLACES } from "../content";

export interface GazetteerEntry {
  id: string;
  name: string;
  aliases: string[];
  category: PlaceCategory;
  destinationId: string;
  /** Set for curated places only. */
  placeId: string | null;
}

/** Extra spellings people use for the curated places. */
const ALIASES: Record<string, string[]> = {
  "kozhikode-beach": ["Calicut Beach", "Kozhikode Beach", "Beach Road"],
  "mananchira-square": ["Mananchira", "Mananchira Maidan"],
  "mishkal-mosque": ["Mishkal Palli", "Mithqal Mosque", "Mishkal"],
  "kappad-beach": ["Kappad", "Kappakadavu", "Vasco da Gama landing"],
  "beypore-port": ["Beypore", "Beypore Beach", "Beypore Uru"],
  "thusharagiri-falls": ["Thusharagiri", "Thushara Giri"],
  "paragon-restaurant": ["Paragon", "Paragon Calicut"],
  "sm-street": ["SM Street", "S M Street", "Sweet Meat Street", "Mittai Theruvu", "Mithai Theruvu"],
  "beach-food-stalls": ["Calicut beach stalls"],
  "hagia-sophia": ["Ayasofya", "Aya Sofya", "Ayasofya Mosque", "Haghia Sophia"],
  "blue-mosque": ["Sultanahmet Mosque", "Sultan Ahmed Mosque", "Sultanahmet Camii"],
  "topkapi-palace": ["Topkapi", "Topkapı Sarayı", "Topkapi Sarayi"],
  "galata-tower": ["Galata Kulesi", "Galata"],
  "grand-bazaar": ["Kapalicarsi", "Kapalıçarşı", "Grand Bazar"],
  "karakoy-gulluoglu": ["Gulluoglu", "Güllüoğlu", "Karakoy Gulluoglu"],
  "ciya-sofrasi": ["Ciya", "Çiya", "Ciya Sofrasi"],
  "balik-ekmek-eminonu": ["Balik Ekmek", "Balık Ekmek", "fish sandwich Eminonu", "Eminonu fish sandwich"],
};

/** Other well-known places, recognised by name. */
const EXTRA: Omit<GazetteerEntry, "id" | "placeId">[] = [
  // Istanbul
  { name: "Basilica Cistern", aliases: ["Yerebatan Cistern", "Yerebatan Sarnici"], category: "landmark", destinationId: "istanbul" },
  { name: "Dolmabahçe Palace", aliases: ["Dolmabahce Palace", "Dolmabahce"], category: "landmark", destinationId: "istanbul" },
  { name: "Süleymaniye Mosque", aliases: ["Suleymaniye Mosque", "Suleymaniye"], category: "landmark", destinationId: "istanbul" },
  { name: "Spice Bazaar", aliases: ["Egyptian Bazaar", "Misir Carsisi", "Mısır Çarşısı"], category: "shopping", destinationId: "istanbul" },
  { name: "Galata Bridge", aliases: ["Galata Koprusu"], category: "landmark", destinationId: "istanbul" },
  { name: "Istiklal Avenue", aliases: ["Istiklal Street", "Istiklal Caddesi", "İstiklal Caddesi"], category: "shopping", destinationId: "istanbul" },
  { name: "Taksim Square", aliases: ["Taksim"], category: "landmark", destinationId: "istanbul" },
  { name: "Maiden's Tower", aliases: ["Kiz Kulesi", "Kız Kulesi", "Maidens Tower"], category: "landmark", destinationId: "istanbul" },
  { name: "Pierre Loti Hill", aliases: ["Pierre Loti"], category: "landmark", destinationId: "istanbul" },
  { name: "Ortaköy", aliases: ["Ortakoy", "Ortaköy Mosque", "Ortakoy Mosque"], category: "landmark", destinationId: "istanbul" },
  { name: "Balat", aliases: ["Balat streets", "Fener Balat"], category: "culture", destinationId: "istanbul" },
  { name: "Kadıköy", aliases: ["Kadikoy", "Kadıköy market"], category: "culture", destinationId: "istanbul" },
  { name: "Chora Church", aliases: ["Kariye", "Kariye Camii"], category: "culture", destinationId: "istanbul" },
  { name: "Rumeli Fortress", aliases: ["Rumeli Hisari", "Rumelihisarı"], category: "landmark", destinationId: "istanbul" },
  { name: "Princes' Islands", aliases: ["Princes Islands", "Adalar", "Buyukada", "Büyükada"], category: "nature", destinationId: "istanbul" },
  // Kozhikode
  { name: "Sarovaram Bio Park", aliases: ["Sarovaram"], category: "nature", destinationId: "kozhikode" },
  { name: "Kakkayam", aliases: ["Kakkayam Dam", "Kakkayam Hills"], category: "nature", destinationId: "kozhikode" },
  { name: "Peruvannamuzhi Dam", aliases: ["Peruvannamuzhi"], category: "nature", destinationId: "kozhikode" },
  { name: "Sargaalaya", aliases: ["Sargaalaya Arts and Crafts Village", "Iringal Craft Village"], category: "culture", destinationId: "kozhikode" },
  { name: "Tali Temple", aliases: ["Thali Temple", "Tali Shiva Temple"], category: "culture", destinationId: "kozhikode" },
  { name: "Kozhikode Planetarium", aliases: ["Calicut Planetarium", "Regional Science Centre"], category: "landmark", destinationId: "kozhikode" },
  { name: "Kuttichira", aliases: [], category: "culture", destinationId: "kozhikode" },
];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "Grand Bazaar (Kapalıçarşı)" -> ["Grand Bazaar", "Kapalıçarşı"]; names without parentheses give nothing. */
function parenthesisParts(name: string): string[] {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(name);
  return m ? [m[1].trim(), m[2].trim()].filter((x) => x.length >= 4 && x !== name) : [];
}

export const GAZETTEER: GazetteerEntry[] = [
  ...PLACES.map((p) => ({
    id: p.id,
    name: p.name,
    aliases: [...new Set([...(ALIASES[p.id] ?? []), ...parenthesisParts(p.name)])],
    category: p.category,
    destinationId: p.destinationId,
    placeId: p.id,
  })),
  ...EXTRA.map((e) => ({ ...e, id: `known-${slug(e.name)}`, placeId: null })),
];

/** Names that identify a destination (these are not places to visit by themselves). */
export const DESTINATION_NAMES: Record<string, string[]> = {
  kozhikode: ["Kozhikode", "Calicut", "Kozhikkode", "Malabar", "Kerala"],
  istanbul: ["Istanbul", "İstanbul", "Constantinople", "Bosphorus", "Türkiye", "Turkiye", "Turkey"],
};

export const destinationLabel = (id: string) => DESTINATIONS.find((d) => d.id === id)?.name ?? id;
