import type Database from "better-sqlite3";
import { APPROX_COORDS, DESTINATIONS, PLACES } from "./content";

/**
 * Copies the curated content (content.ts) into the database. Idempotent: rows are upserted by id, so editing
 * the content file updates them on the next start, and places that were removed from the file are deleted
 * (saved items and trip activities that referenced them keep their own copy of the details).
 * Never touches the bus tables or any user data.
 */
export function seedVoyageContent(db: Database.Database): void {
  const upDest = db.prepare(
    `INSERT INTO destinations (id, name, country, summary, currency, image, image_alt, sort)
     VALUES (@id, @name, @country, @summary, @currency, @image, @imageAlt, @sort)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, country = excluded.country, summary = excluded.summary,
       currency = excluded.currency, image = excluded.image, image_alt = excluded.image_alt, sort = excluded.sort`,
  );
  const upPlace = db.prepare(
    `INSERT INTO places (id, destination_id, name, category, area, description, notes, duration_min, cost_min_cents,
       cost_max_cents, currency, cost_note, image, image_alt, sort, lat, lng)
     VALUES (@id, @destinationId, @name, @category, @area, @description, @notes, @durationMin, @costMin, @costMax,
       @currency, @costNote, @image, @imageAlt, @sort, @lat, @lng)
     ON CONFLICT(id) DO UPDATE SET destination_id = excluded.destination_id, name = excluded.name,
       category = excluded.category, area = excluded.area, description = excluded.description, notes = excluded.notes,
       duration_min = excluded.duration_min, cost_min_cents = excluded.cost_min_cents,
       cost_max_cents = excluded.cost_max_cents, currency = excluded.currency, cost_note = excluded.cost_note,
       image = excluded.image, image_alt = excluded.image_alt, sort = excluded.sort, lat = excluded.lat, lng = excluded.lng`,
  );

  db.transaction(() => {
    DESTINATIONS.forEach((d, i) => upDest.run({ ...d, sort: i }));
    PLACES.forEach((p, i) =>
      upPlace.run({
        ...p,
        notes: p.notes ?? null,
        costNote: p.costNote ?? null,
        costMin: p.costMin * 100,
        costMax: p.costMax * 100,
        sort: i,
        lat: APPROX_COORDS[p.id]?.[0] ?? null,
        lng: APPROX_COORDS[p.id]?.[1] ?? null,
      }),
    );
    const keep = PLACES.map(() => "?").join(",");
    db.prepare(`DELETE FROM places WHERE id NOT IN (${keep})`).run(...PLACES.map((p) => p.id));
    const keepD = DESTINATIONS.map(() => "?").join(",");
    db.prepare(`DELETE FROM destinations WHERE id NOT IN (${keepD}) AND id NOT IN (SELECT destination_id FROM voyage_trips)`).run(
      ...DESTINATIONS.map((d) => d.id),
    );
  })();
}
