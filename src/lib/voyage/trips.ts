// Trip planner: trips with a destination and dates, activities arranged day by day, and estimated expenses.
// Same rules as saved.ts: every function takes the owner and only touches that owner's trips; a trip that belongs to
// someone else looks like "not found".
//
//  * Days are not stored: a trip of N days (start..end inclusive) has days 1..N, dated start + day - 1.
//  * An activity is a snapshot copied from a saved item or curated place. Editing or deleting the original later
//    never changes a trip that is already planned.
//  * Money is integers in minor units (cents). Totals are kept per currency: there is no conversion and no exchange
//    rate (so no external service and nothing invented).
import type Database from "better-sqlite3";
import {
  CATEGORIES, EXPENSE_CATEGORIES, LIMITS, VoyageError, currency, dayDate, duration, fail, money, notes, oneOf, text, tripLength,
  type Category, type ExpenseCategory,
} from "./validate";

type DB = Database.Database;
const now = () => new Date().toISOString();

export type Money = Record<string, number>;
const addTo = (m: Money, cur: string | null, cents: number | null) => {
  if (cur && cents !== null) m[cur] = (m[cur] ?? 0) + cents;
};

export interface Activity {
  id: number;
  day: number;
  position: number;
  title: string;
  category: Category;
  location: string | null;
  notes: string | null;
  durationMin: number | null;
  costCents: number | null;
  currency: string | null;
  placeId: string | null;
  savedItemId: number | null;
  /** "HH:MM" (24 h) or null. */
  startTime: string | null;
  /** Approximate coordinates of the curated place, when the activity is one. Used only to suggest an order. */
  lat: number | null;
  lng: number | null;
}

export interface Expense {
  id: number;
  day: number | null;
  label: string;
  category: ExpenseCategory;
  amountCents: number;
  currency: string;
  notes: string | null;
}

export interface TripRow {
  id: number;
  name: string;
  destinationId: string;
  destinationName: string;
  startDate: string;
  endDate: string;
  currency: string;
  notes: string | null;
  days: number;
}

export interface TripListItem extends TripRow {
  activityCount: number;
}

export interface TripDay {
  day: number;
  date: string;
  activities: Activity[];
  expenses: Expense[];
  totals: { activities: Money; expenses: Money };
  /** Plain-language notes, e.g. two activities with overlapping times. */
  warnings: string[];
}

export interface TripDetail {
  trip: TripRow;
  days: TripDay[];
  tripWideExpenses: Expense[]; // expenses not tied to a day (for example flights, hotel)
  totals: { activities: Money; expenses: Money; combined: Money };
  totalDurationMin: number;
}

// ------------------------------------------------------------------ trips

interface RawTrip {
  id: number;
  name: string;
  destination_id: string;
  destination_name: string;
  start_date: string;
  end_date: string;
  currency: string;
  notes: string | null;
}

const toTrip = (r: RawTrip): TripRow => ({
  id: r.id,
  name: r.name,
  destinationId: r.destination_id,
  destinationName: r.destination_name,
  startDate: r.start_date,
  endDate: r.end_date,
  currency: r.currency,
  notes: r.notes,
  days: tripLength(r.start_date, r.end_date),
});

function loadTrip(db: DB, owner: string, id: number): TripRow {
  const r = db
    .prepare(
      `SELECT t.*, d.name AS destination_name FROM voyage_trips t JOIN destinations d ON d.id = t.destination_id
       WHERE t.id = ? AND t.owner = ?`,
    )
    .get(id, owner) as RawTrip | undefined;
  return r ? toTrip(r) : fail("not_found", "That trip was not found.");
}

export interface TripInput {
  name?: unknown;
  destinationId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  currency?: unknown;
  notes?: unknown;
}

function tripFields(db: DB, input: TripInput) {
  const name = text(input.name, "Trip name", { max: LIMITS.tripName, required: true });
  const destId = typeof input.destinationId === "string" ? input.destinationId : "";
  const dest = db.prepare("SELECT id, currency FROM destinations WHERE id = ?").get(destId) as { id: string; currency: string } | undefined;
  if (!dest) fail("validation", "Choose a destination.");
  const days = tripLength(input.startDate, input.endDate);
  return {
    name,
    destinationId: dest!.id,
    startDate: String(input.startDate).trim(),
    endDate: String(input.endDate).trim(),
    currency: currency(input.currency, dest!.currency as never),
    notes: notes(input.notes) || null,
    days,
  };
}

export function createTrip(db: DB, owner: string, input: TripInput): number {
  return db.transaction(() => {
    const v = tripFields(db, input);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM voyage_trips WHERE owner = ?").get(owner) as { n: number }).n;
    if (count >= LIMITS.tripsPerOwner) fail("limit", `You can have at most ${LIMITS.tripsPerOwner} trips. Delete one first.`);
    const at = now();
    return Number(
      db
        .prepare(
          `INSERT INTO voyage_trips (owner, name, destination_id, start_date, end_date, currency, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(owner, v.name, v.destinationId, v.startDate, v.endDate, v.currency, v.notes, at, at).lastInsertRowid,
    );
  })();
}

/** Changing the dates is refused if it would leave activities or expenses on days that no longer exist. */
export function updateTrip(db: DB, owner: string, id: number, input: TripInput): void {
  db.transaction(() => {
    loadTrip(db, owner, id);
    const v = tripFields(db, input);
    const lastUsed = db
      .prepare(
        `SELECT MAX(d) AS d FROM (SELECT MAX(day) AS d FROM voyage_activities WHERE trip_id = @id
                                  UNION ALL SELECT MAX(day) FROM voyage_expenses WHERE trip_id = @id)`,
      )
      .get({ id }) as { d: number | null };
    if (lastUsed.d !== null && lastUsed.d > v.days) {
      fail("validation", `Day ${lastUsed.d} still has activities or expenses. Move or remove them before shortening the trip to ${v.days} day${v.days === 1 ? "" : "s"}.`);
    }
    db.prepare(
      `UPDATE voyage_trips SET name = ?, destination_id = ?, start_date = ?, end_date = ?, currency = ?, notes = ?, updated_at = ?
       WHERE id = ? AND owner = ?`,
    ).run(v.name, v.destinationId, v.startDate, v.endDate, v.currency, v.notes, now(), id, owner);
  })();
}

export function deleteTrip(db: DB, owner: string, id: number): void {
  db.transaction(() => {
    loadTrip(db, owner, id);
    db.prepare("DELETE FROM voyage_trips WHERE id = ? AND owner = ?").run(id, owner); // activities and expenses cascade
  })();
}

export function listTrips(db: DB, owner: string): TripListItem[] {
  const rows = db
    .prepare(
      `SELECT t.*, d.name AS destination_name, (SELECT COUNT(*) FROM voyage_activities a WHERE a.trip_id = t.id) AS n
       FROM voyage_trips t JOIN destinations d ON d.id = t.destination_id WHERE t.owner = ? ORDER BY t.start_date, t.id`,
    )
    .all(owner) as (RawTrip & { n: number })[];
  return rows.map((r) => ({ ...toTrip(r), activityCount: r.n }));
}

// ------------------------------------------------------------------ activities

export interface ActivityInput {
  title?: unknown;
  category?: unknown;
  location?: unknown;
  notes?: unknown;
  durationMin?: unknown;
  cost?: unknown;
  currency?: unknown;
  startTime?: unknown; // "HH:MM"
}

/** "09:30" -> "09:30"; empty -> null; anything else is refused. */
export function parseStartTime(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value).trim());
  if (!m) return fail("validation", "Start time must look like 09:30 (24-hour).");
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function checkDay(trip: TripRow, day: unknown): number {
  const n = Number(day);
  if (!Number.isInteger(n) || n < 1 || n > trip.days) fail("validation", `Choose a day between 1 and ${trip.days}.`);
  return n;
}

interface ActivityData {
  title: string;
  category: Category;
  location: string | null;
  notes: string | null;
  durationMin: number | null;
  costCents: number | null;
  currency: string | null;
  placeId: string | null;
  savedItemId: number | null;
  startTime: string | null;
}

/** The same saved item or curated place is only planned once per trip: say where it already is. */
function assertNotPlanned(db: DB, tripId: number, kind: { savedId: number } | { placeId: string }): void {
  const row =
    "savedId" in kind
      ? (db.prepare("SELECT day, title FROM voyage_activities WHERE trip_id = ? AND saved_item_id = ? LIMIT 1").get(tripId, kind.savedId) as { day: number; title: string } | undefined)
      : (db.prepare("SELECT day, title FROM voyage_activities WHERE trip_id = ? AND place_id = ? LIMIT 1").get(tripId, kind.placeId) as { day: number; title: string } | undefined);
  if (row) fail("conflict", `“${row.title}” is already planned on day ${row.day} of this trip.`);
}

function insertActivity(db: DB, trip: TripRow, day: number, a: ActivityData): number {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM voyage_activities WHERE trip_id = ?").get(trip.id) as { n: number }).n;
  if (count >= LIMITS.activitiesPerTrip) fail("limit", `A trip can have at most ${LIMITS.activitiesPerTrip} activities.`);
  const pos = (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM voyage_activities WHERE trip_id = ? AND day = ?").get(trip.id, day) as { p: number }).p;
  return Number(
    db
      .prepare(
        `INSERT INTO voyage_activities (trip_id, day, position, title, category, location, notes, duration_min, cost_cents, currency, place_id, saved_item_id, start_time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(trip.id, day, pos, a.title, a.category, a.location, a.notes, a.durationMin, a.costCents, a.currency, a.placeId, a.savedItemId, a.startTime, now()).lastInsertRowid,
  );
}

export function addCustomActivity(db: DB, owner: string, tripId: number, day: unknown, input: ActivityInput): number {
  return db.transaction(() => {
    const trip = loadTrip(db, owner, tripId);
    const d = checkDay(trip, day);
    const cost = money(input.cost, "Estimated cost");
    return insertActivity(db, trip, d, {
      title: text(input.title, "Title", { max: LIMITS.title, required: true }),
      category: oneOf(input.category, CATEGORIES, "Category", "other"),
      location: text(input.location, "Location", { max: LIMITS.location }) || null,
      notes: notes(input.notes) || null,
      durationMin: duration(input.durationMin, "Duration"),
      costCents: cost,
      currency: cost === null ? null : currency(input.currency, trip.currency as never),
      placeId: null,
      savedItemId: null,
      startTime: parseStartTime(input.startTime),
    });
  })();
}

export function addActivityFromSaved(db: DB, owner: string, tripId: number, day: unknown, savedId: number): number {
  return db.transaction(() => {
    const trip = loadTrip(db, owner, tripId);
    const d = checkDay(trip, day);
    assertNotPlanned(db, tripId, { savedId });
    const s = db.prepare("SELECT * FROM saved_items WHERE id = ? AND owner = ?").get(savedId, owner) as
      | { id: number; title: string; category: Category; location: string | null; notes: string | null; duration_min: number | null; cost_cents: number | null; currency: string | null; place_id: string | null }
      | undefined;
    if (!s) return fail("not_found", "That saved item was not found.");
    return insertActivity(db, trip, d, {
      title: s.title, category: s.category, location: s.location, notes: s.notes, durationMin: s.duration_min,
      costCents: s.cost_cents, currency: s.currency, placeId: s.place_id, savedItemId: s.id, startTime: null,
    });
  })();
}

/**
 * Adds several saved items to one day. Items already planned in this trip are skipped (and reported), never
 * duplicated; one bad item does not stop the others.
 */
export function addActivitiesFromSaved(
  db: DB, owner: string, tripId: number, day: unknown, savedIds: number[],
): { added: number[]; skipped: { savedId: number; reason: string }[] } {
  const added: number[] = [];
  const skipped: { savedId: number; reason: string }[] = [];
  loadTrip(db, owner, tripId); // fail early if the trip is not theirs
  for (const savedId of [...new Set(savedIds)]) {
    try {
      added.push(addActivityFromSaved(db, owner, tripId, day, savedId));
    } catch (e) {
      if (e instanceof VoyageError && (e.code === "conflict" || e.code === "not_found")) skipped.push({ savedId, reason: e.message });
      else throw e;
    }
  }
  return { added, skipped };
}

export function addActivityFromPlace(db: DB, owner: string, tripId: number, day: unknown, placeId: string): number {
  return db.transaction(() => {
    const trip = loadTrip(db, owner, tripId);
    const d = checkDay(trip, day);
    assertNotPlanned(db, tripId, { placeId });
    const p = db.prepare("SELECT * FROM places WHERE id = ?").get(placeId) as
      | { id: string; name: string; category: Category; area: string; notes: string | null; duration_min: number; cost_min_cents: number; cost_max_cents: number; currency: string }
      | undefined;
    if (!p) return fail("not_found", "That place was not found.");
    return insertActivity(db, trip, d, {
      title: p.name, category: p.category, location: p.area, notes: p.notes, durationMin: p.duration_min,
      costCents: Math.round((p.cost_min_cents + p.cost_max_cents) / 2), currency: p.currency, placeId: p.id, savedItemId: null, startTime: null,
    });
  })();
}

interface RawActivity {
  id: number;
  trip_id: number;
  day: number;
  position: number;
  title: string;
  category: Category;
  location: string | null;
  notes: string | null;
  duration_min: number | null;
  cost_cents: number | null;
  currency: string | null;
  place_id: string | null;
  saved_item_id: number | null;
  start_time: string | null;
  lat?: number | null;
  lng?: number | null;
}

const toActivity = (r: RawActivity): Activity => ({
  id: r.id, day: r.day, position: r.position, title: r.title, category: r.category, location: r.location, notes: r.notes,
  durationMin: r.duration_min, costCents: r.cost_cents, currency: r.currency, placeId: r.place_id, savedItemId: r.saved_item_id,
  startTime: r.start_time, lat: r.lat ?? null, lng: r.lng ?? null,
});

function ownActivity(db: DB, owner: string, id: number): { activity: RawActivity; trip: TripRow } {
  const a = db
    .prepare("SELECT a.* FROM voyage_activities a JOIN voyage_trips t ON t.id = a.trip_id WHERE a.id = ? AND t.owner = ?")
    .get(id, owner) as RawActivity | undefined;
  if (!a) return fail("not_found", "That activity was not found.");
  return { activity: a!, trip: loadTrip(db, owner, a!.trip_id) };
}

/** Rewrites positions of one day as 0..n-1 in their current order. */
function compact(db: DB, tripId: number, day: number): void {
  const ids = db.prepare("SELECT id FROM voyage_activities WHERE trip_id = ? AND day = ? ORDER BY position, id").all(tripId, day) as { id: number }[];
  const upd = db.prepare("UPDATE voyage_activities SET position = ? WHERE id = ?");
  ids.forEach((r, i) => upd.run(i, r.id));
}

/** Edits an activity; `input.day` moves it to the end of another day. */
export function updateActivity(db: DB, owner: string, id: number, input: ActivityInput & { day?: unknown }): void {
  db.transaction(() => {
    const { activity, trip } = ownActivity(db, owner, id);
    const cost = money(input.cost, "Estimated cost");
    db.prepare(
      `UPDATE voyage_activities SET title = ?, category = ?, location = ?, notes = ?, duration_min = ?, cost_cents = ?, currency = ?, start_time = ?
       WHERE id = ?`,
    ).run(
      text(input.title, "Title", { max: LIMITS.title, required: true }),
      oneOf(input.category, CATEGORIES, "Category", "other"),
      text(input.location, "Location", { max: LIMITS.location }) || null,
      notes(input.notes) || null,
      duration(input.durationMin, "Duration"),
      cost,
      cost === null ? null : currency(input.currency, trip.currency as never),
      parseStartTime(input.startTime),
      id,
    );
    if (input.day !== undefined && input.day !== "" && Number(input.day) !== activity.day) moveToDay(db, trip, activity, checkDay(trip, input.day));
  })();
}

function moveToDay(db: DB, trip: TripRow, a: RawActivity, day: number): void {
  const pos = (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM voyage_activities WHERE trip_id = ? AND day = ?").get(trip.id, day) as { p: number }).p;
  db.prepare("UPDATE voyage_activities SET day = ?, position = ? WHERE id = ?").run(day, pos, a.id);
  compact(db, trip.id, a.day);
}

export function moveActivityToDay(db: DB, owner: string, id: number, day: unknown): void {
  db.transaction(() => {
    const { activity, trip } = ownActivity(db, owner, id);
    const d = checkDay(trip, day);
    if (d !== activity.day) moveToDay(db, trip, activity, d);
  })();
}

/** Reorders within the day: swaps with the neighbour. Moving past the first or last position does nothing. */
export function moveActivity(db: DB, owner: string, id: number, direction: "up" | "down"): void {
  if (direction !== "up" && direction !== "down") fail("validation", "Invalid direction.");
  db.transaction(() => {
    const { activity } = ownActivity(db, owner, id);
    compact(db, activity.trip_id, activity.day);
    const rows = db.prepare("SELECT id, position FROM voyage_activities WHERE trip_id = ? AND day = ? ORDER BY position").all(activity.trip_id, activity.day) as { id: number; position: number }[];
    const i = rows.findIndex((r) => r.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return;
    const upd = db.prepare("UPDATE voyage_activities SET position = ? WHERE id = ?");
    upd.run(rows[j].position, rows[i].id);
    upd.run(rows[i].position, rows[j].id);
  })();
}

export function removeActivity(db: DB, owner: string, id: number): void {
  db.transaction(() => {
    const { activity } = ownActivity(db, owner, id);
    db.prepare("DELETE FROM voyage_activities WHERE id = ?").run(id);
    compact(db, activity.trip_id, activity.day);
  })();
}

// ------------------------------------------------------------------ expenses

export interface ExpenseInput {
  label?: unknown;
  category?: unknown;
  amount?: unknown;
  currency?: unknown;
  day?: unknown; // empty = applies to the whole trip
  notes?: unknown;
}

function expenseFields(trip: TripRow, input: ExpenseInput) {
  const amount = money(input.amount, "Amount");
  if (amount === null) fail("validation", "Amount is required.");
  const day = input.day === undefined || input.day === null || input.day === "" ? null : checkDay(trip, input.day);
  return {
    label: text(input.label, "Label", { max: LIMITS.expenseLabel, required: true }),
    category: oneOf(input.category, EXPENSE_CATEGORIES, "Category", "other"),
    amount: amount!,
    currency: currency(input.currency, trip.currency as never),
    day,
    notes: notes(input.notes, "Notes", 500) || null,
  };
}

export function addExpense(db: DB, owner: string, tripId: number, input: ExpenseInput): number {
  return db.transaction(() => {
    const trip = loadTrip(db, owner, tripId);
    const v = expenseFields(trip, input);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM voyage_expenses WHERE trip_id = ?").get(tripId) as { n: number }).n;
    if (count >= LIMITS.expensesPerTrip) fail("limit", `A trip can have at most ${LIMITS.expensesPerTrip} expenses.`);
    return Number(
      db
        .prepare(
          `INSERT INTO voyage_expenses (trip_id, day, label, category, amount_cents, currency, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(tripId, v.day, v.label, v.category, v.amount, v.currency, v.notes, now()).lastInsertRowid,
    );
  })();
}

function ownExpense(db: DB, owner: string, id: number): { tripId: number; trip: TripRow } {
  const r = db
    .prepare("SELECT e.trip_id FROM voyage_expenses e JOIN voyage_trips t ON t.id = e.trip_id WHERE e.id = ? AND t.owner = ?")
    .get(id, owner) as { trip_id: number } | undefined;
  if (!r) return fail("not_found", "That expense was not found.");
  return { tripId: r!.trip_id, trip: loadTrip(db, owner, r!.trip_id) };
}

export function updateExpense(db: DB, owner: string, id: number, input: ExpenseInput): void {
  db.transaction(() => {
    const { trip } = ownExpense(db, owner, id);
    const v = expenseFields(trip, input);
    db.prepare("UPDATE voyage_expenses SET day = ?, label = ?, category = ?, amount_cents = ?, currency = ?, notes = ? WHERE id = ?").run(
      v.day, v.label, v.category, v.amount, v.currency, v.notes, id,
    );
  })();
}

export function removeExpense(db: DB, owner: string, id: number): void {
  db.transaction(() => {
    ownExpense(db, owner, id);
    db.prepare("DELETE FROM voyage_expenses WHERE id = ?").run(id);
  })();
}

// ------------------------------------------------------------------ the whole trip

export function getTrip(db: DB, owner: string, id: number): TripDetail | null {
  let trip: TripRow;
  try {
    trip = loadTrip(db, owner, id);
  } catch {
    return null;
  }
  const acts = (db.prepare("SELECT a.*, p.lat AS lat, p.lng AS lng FROM voyage_activities a LEFT JOIN places p ON p.id = a.place_id WHERE a.trip_id = ? ORDER BY a.day, a.position, a.id").all(id) as RawActivity[]).map(toActivity);
  const exps = (
    db.prepare("SELECT * FROM voyage_expenses WHERE trip_id = ? ORDER BY day IS NULL, day, id").all(id) as {
      id: number; day: number | null; label: string; category: ExpenseCategory; amount_cents: number; currency: string; notes: string | null;
    }[]
  ).map((e): Expense => ({ id: e.id, day: e.day, label: e.label, category: e.category, amountCents: e.amount_cents, currency: e.currency, notes: e.notes }));

  const totals = { activities: {} as Money, expenses: {} as Money, combined: {} as Money };
  let totalDurationMin = 0;
  const days: TripDay[] = Array.from({ length: trip.days }, (_, i) => ({
    day: i + 1,
    date: dayDate(trip.startDate, i + 1),
    activities: [],
    expenses: [],
    totals: { activities: {}, expenses: {} },
    warnings: [],
  }));
  for (const a of acts) {
    const d = days[a.day - 1];
    if (!d) continue;
    d.activities.push(a);
    addTo(d.totals.activities, a.currency, a.costCents);
    addTo(totals.activities, a.currency, a.costCents);
    addTo(totals.combined, a.currency, a.costCents);
    totalDurationMin += a.durationMin ?? 0;
  }
  const tripWideExpenses: Expense[] = [];
  for (const e of exps) {
    const d = e.day ? days[e.day - 1] : undefined;
    if (d) {
      d.expenses.push(e);
      addTo(d.totals.expenses, e.currency, e.amountCents);
    } else tripWideExpenses.push(e);
    addTo(totals.expenses, e.currency, e.amountCents);
    addTo(totals.combined, e.currency, e.amountCents);
  }
  for (const d of days) d.warnings = dayWarnings(d.activities);
  return { trip, days, tripWideExpenses, totals, totalDurationMin };
}

// ------------------------------------------------------------------ day checks and a suggested order

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Plain-language notes about a day: overlapping start times and a very full day. Pure, no database. */
export function dayWarnings(activities: Pick<Activity, "title" | "startTime" | "durationMin">[]): string[] {
  const out: string[] = [];
  const timed = activities
    .filter((a) => a.startTime && a.durationMin)
    .map((a) => ({ title: a.title, from: toMin(a.startTime!), to: toMin(a.startTime!) + a.durationMin! }))
    .sort((a, b) => a.from - b.from);
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    if (timed[i].from < prev.to) out.push(`“${timed[i].title}” starts before “${prev.title}” has finished.`);
  }
  const total = activities.reduce((sum, a) => sum + (a.durationMin ?? 0), 0);
  if (total > 10 * 60) out.push(`This day has about ${Math.round(total / 60)} hours of activities planned. Consider moving something to another day.`);
  return out;
}

const rad = (d: number) => (d * Math.PI) / 180;
/** Straight-line distance in km (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export interface OrderSuggestion {
  /** Activity ids in the suggested order. */
  order: number[];
  changed: boolean;
  /** Activities with a start time keep their place relative to each other; those without coordinates stay at the end. */
  note: string;
  totalKm: number | null;
}

/**
 * Suggests a visiting order for one day: starting from the first activity, always go to the nearest next one
 * (straight-line distance between the approximate coordinates of curated places). Only activities with known
 * coordinates are reordered; the rest stay at the end in their current order. If fewer than 3 places have
 * coordinates there is nothing useful to suggest. It only proposes: nothing changes until applyOrder().
 */
export function suggestOrder(db: DB, owner: string, tripId: number, day: unknown): OrderSuggestion {
  loadTrip(db, owner, tripId);
  const d = Number(day);
  const rows = db
    .prepare(
      `SELECT a.id, a.start_time, p.lat, p.lng FROM voyage_activities a LEFT JOIN places p ON p.id = a.place_id
       WHERE a.trip_id = ? AND a.day = ? ORDER BY a.position, a.id`,
    )
    .all(tripId, d) as { id: number; start_time: string | null; lat: number | null; lng: number | null }[];
  const current = rows.map((r) => r.id);
  const located = rows.filter((r) => r.lat !== null && r.lng !== null && !r.start_time);
  const rest = rows.filter((r) => !located.includes(r));
  if (located.length < 3) {
    return { order: current, changed: false, totalKm: null, note: "Not enough places with known locations on this day to suggest an order (at least 3 are needed)." };
  }
  const left = [...located];
  const path = [left.shift()!];
  while (left.length) {
    const last = path[path.length - 1];
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (distanceKm({ lat: last.lat!, lng: last.lng! }, { lat: left[i].lat!, lng: left[i].lng! }) < distanceKm({ lat: last.lat!, lng: last.lng! }, { lat: left[best].lat!, lng: left[best].lng! })) best = i;
    }
    path.push(left.splice(best, 1)[0]);
  }
  // Keep timed activities and unlocated ones where they were relative to the end; located ones fill the front.
  const order = [...path.map((r) => r.id), ...rest.map((r) => r.id)];
  let km = 0;
  for (let i = 1; i < path.length; i++) km += distanceKm({ lat: path[i - 1].lat!, lng: path[i - 1].lng! }, { lat: path[i].lat!, lng: path[i].lng! });
  return {
    order,
    changed: order.some((id, i) => id !== current[i]),
    totalKm: Math.round(km * 10) / 10,
    note: "Based on straight-line distances between approximate locations. Check real travel times and opening hours on a map.",
  };
}

/** Applies an order (for example one returned by suggestOrder). The ids must be exactly this day's activities. */
export function applyOrder(db: DB, owner: string, tripId: number, day: unknown, ids: number[]): void {
  db.transaction(() => {
    loadTrip(db, owner, tripId);
    const d = Number(day);
    const current = (db.prepare("SELECT id FROM voyage_activities WHERE trip_id = ? AND day = ?").all(tripId, d) as { id: number }[]).map((r) => r.id);
    if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((i) => current.includes(i))) {
      fail("validation", "The suggested order no longer matches this day. Reload the page and try again.");
    }
    const upd = db.prepare("UPDATE voyage_activities SET position = ? WHERE id = ?");
    ids.forEach((id, i) => upd.run(i, id));
  })();
}
