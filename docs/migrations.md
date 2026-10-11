# Database migrations

The schema is versioned with SQLite's `PRAGMA user_version`. The app applies pending migrations automatically when it first opens the database (`pnpm dev`, `pnpm start`, `pnpm db:init`, `pnpm db:import`). Migrations live in [`src/lib/db/migrations.ts`](../src/lib/db/migrations.ts).

## Rules

- Migrations only **add** things (tables, columns, indexes). They never drop, rename or rewrite existing rows.
- Each migration runs in one transaction together with its version bump. If it fails, the database stays at the previous version.
- Before the first migration touches a database that already holds data, a consistent copy is written next to it as `<file>.pre-v<N>.bak` (`VACUUM INTO`). An existing backup is never overwritten. A brand-new database gets no backup.
- Re-running is safe: columns are only added if missing.
- `src/lib/db/schema.ts` is the frozen v1 schema. Do not edit it; add a new migration instead.
- A running dev server notices a newer schema version and reconnects, so the migration runs without a manual restart.

## History

| Version | Name | What it does |
| --- | --- | --- |
| 1 | `baseline` | The schema of phases 1 to 3: `meta`, `stops`, `services`, `trips`, `trip_stops`, `fares`. Adopts databases created before versioning (they are at `user_version` 0). |
| 2 | `review-workflow` | See below. |
| 3 | `voyage-travel-planning` | The travel-planning services (below). |

### v2: `review-workflow`

New columns (all nullable except `locked`, which defaults to 0), so every existing row keeps its values:

| Table | Added columns |
| --- | --- |
| `stops` | `verified_at`, `verified_by`, `verified_source`, `review_note`, `updated_at` |
| `services` | the same five, plus `rejected_at`, `rejected_by`, `locked` (integer, default 0) |
| `fares` | the same five, plus `rejected_at`, `rejected_by` |

New tables:

| Table | Purpose |
| --- | --- |
| `reports` | Passenger feedback (kind, message, optional suggestion and contact, status, who handled it, a readable snapshot of what it was about). Context ids are deliberately not foreign keys so a report outlives re-imports. |
| `audit_log` | Append-only history of every admin action, with before/after values. |
| `admin_sessions` | Admin sign-in sessions. Only a SHA-256 of the session token is stored. |

Meaning of the provenance columns, on every record type:

- `source`: where the data came from (set at import or creation; review never overwrites it).
- `data_status`: `demo` (invented), `unverified`, or `verified`.
- `verified_at` / `verified_by` / `verified_source`: when, by whom and against what a person confirmed it. Cleared whenever the content changes.
- `rejected_at` / `rejected_by`: hidden from passengers, kept for history.
- `locked`: a person has reviewed or edited this bus. Re-imports skip locked buses.

### v3: `voyage-travel-planning`

Only new tables; no existing table or row is touched. The planner's tables are prefixed or named so they can never collide with the bus tables (the bus service already owns `trips`, `trip_stops`, `reports`):

| Table | Purpose |
| --- | --- |
| `destinations`, `places` | Curated content, written from `src/lib/voyage/content.ts` at start-up (upserted by id; removed places are deleted). Costs are integer cents. |
| `collections`, `saved_items` | A visitor's saved links and places. `owner` is the SHA-256 of a random cookie token. |
| `voyage_trips`, `voyage_activities`, `voyage_expenses` | Trips, the activities planned on each day (copies of the saved item or place) and estimated expenses. Deleting a trip cascades to its activities and expenses. |

A test asserts that `trips` still has exactly the bus columns `id, service_id, trip_no` after the migration.

## Checking and rolling back

Check the version:

```bash
sqlite3 data/calicut-bus.db "PRAGMA user_version;"   # 3 after the upgrade
```

To go back to the state before the upgrade, stop the app and restore the backup:

```bash
cp data/calicut-bus.db.pre-v3.bak data/calicut-bus.db   # (the file is named for the version being migrated to)
rm -f data/calicut-bus.db-wal data/calicut-bus.db-shm
```

Note that restoring discards everything entered after the upgrade (reports, reviews, saved items, trips). The older app version works on the old file; the newer one will migrate it again.

## Verified against real files

The migration test suite (`tests/migrations.test.ts`) builds a database exactly as phases 1 to 3 left it, upgrades it, and compares every row of every table before and after. A copy of the real working database (11 stops, 6 services, 30 trips, 142 trip stops, 52 fares) was also upgraded with identical counts and a `.pre-v2.bak` backup was written.

## Version 4 and 5 (Voyage community, Reel-to-Travel)

- **v4** adds `community_posts`, `community_reports`, `saved_items.tags` and `voyage_activities.start_time`.
- **v5** adds `reel_captures`, `reel_candidates`, `community_votes`, `saved_items.capture_id`, approximate `places.lat/lng` and the visit-detail and owner columns on community posts and reports, with a unique index so one visitor can report a post once. It also **deletes the six invented starter posts** earlier versions seeded (matched on exact author and title, only rows with no owner and marked verified). Real posts are untouched. Only additions and that one deletion; the bus tables keep their exact shape (tested in `tests/migration-v5.test.ts`).
- A backup `<file>.pre-v5.bak` is written before upgrading a file database. To go back, stop the app and restore it as described above; this discards anything entered after the upgrade.
