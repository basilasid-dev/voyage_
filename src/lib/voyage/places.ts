// Read-side queries for the curated destinations and places. The database is a parameter.
import type Database from "better-sqlite3";
import type { Category } from "./validate";

type DB = Database.Database;

export interface Destination {
  id: string;
  name: string;
  country: string;
  summary: string;
  currency: string;
  image: string;
  imageAlt: string;
  placeCount: number;
}

export interface Place {
  id: string;
  destinationId: string;
  name: string;
  category: Category;
  area: string;
  description: string;
  notes: string | null;
  durationMin: number;
  costMinCents: number;
  costMaxCents: number;
  currency: string;
  costNote: string | null;
  image: string;
  imageAlt: string;
}

interface PlaceRow {
  id: string;
  destination_id: string;
  name: string;
  category: Category;
  area: string;
  description: string;
  notes: string | null;
  duration_min: number;
  cost_min_cents: number;
  cost_max_cents: number;
  currency: string;
  cost_note: string | null;
  image: string;
  image_alt: string;
}

const toPlace = (r: PlaceRow): Place => ({
  id: r.id,
  destinationId: r.destination_id,
  name: r.name,
  category: r.category,
  area: r.area,
  description: r.description,
  notes: r.notes,
  durationMin: r.duration_min,
  costMinCents: r.cost_min_cents,
  costMaxCents: r.cost_max_cents,
  currency: r.currency,
  costNote: r.cost_note,
  image: r.image,
  imageAlt: r.image_alt,
});

export function listDestinations(db: DB): Destination[] {
  const rows = db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM places p WHERE p.destination_id = d.id) AS place_count
       FROM destinations d ORDER BY d.sort, d.name`,
    )
    .all() as { id: string; name: string; country: string; summary: string; currency: string; image: string; image_alt: string; place_count: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, country: r.country, summary: r.summary, currency: r.currency, image: r.image, imageAlt: r.image_alt, placeCount: r.place_count }));
}

export function getDestination(db: DB, id: string): Destination | null {
  return listDestinations(db).find((d) => d.id === id) ?? null;
}

/** `group`: landmarks tab = everything that is not food. */
export function listPlaces(db: DB, destinationId: string, group: "all" | "landmarks" | "food" = "all"): Place[] {
  const rows = db
    .prepare(
      `SELECT * FROM places WHERE destination_id = @dest
         AND (@group = 'all' OR (@group = 'food' AND category = 'food') OR (@group = 'landmarks' AND category <> 'food'))
       ORDER BY sort`,
    )
    .all({ dest: destinationId, group }) as PlaceRow[];
  return rows.map(toPlace);
}

export function getPlace(db: DB, id: string): Place | null {
  const r = db.prepare("SELECT * FROM places WHERE id = ?").get(id) as PlaceRow | undefined;
  return r ? toPlace(r) : null;
}
