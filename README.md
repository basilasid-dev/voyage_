# Calicut Bus Guide · കാലിക്കറ്റ് ബസ് ഗൈഡ്

Next.js app with two parts: a mobile-first **bus guide** for private bus routes, timings and fares in Kozhikode, Kerala (English and Malayalam, with an admin area where a person checks the data before passengers are told it is verified), and **Voyage**, a small travel-planning service for Kozhikode and Istanbul (destinations, saved inspiration and a day-by-day trip planner).

> **All bundled data is DEMO data.** The stops are real place names, but every timetable and fare is invented so the app works out of the box. Every result is labelled "Demo data" in the UI, and demo data can never be marked verified. Do not use it for real travel.
>
> The app shows **scheduled timetables only**: no live tracking and no real-time arrival information. A fare appears only where one is recorded together with its source; none is ever calculated or estimated.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · SQLite via `better-sqlite3` · pnpm

## Setup

Requires Node.js 20+ and pnpm (`npm i -g pnpm` or `corepack enable`).

```bash
pnpm install
pnpm db:init     # optional: creates/upgrades data/calicut-bus.db and the demo seed
pnpm dev         # http://localhost:3000
```

The database is also created and upgraded automatically the first time the server opens it. See [docs/migrations.md](docs/migrations.md).

- `better-sqlite3` is a native module. If no prebuilt binary exists for your Node version, pnpm compiles it and needs a C++ toolchain (on Windows: Visual Studio Build Tools). Build scripts for `better-sqlite3` and `esbuild` are allowed in `pnpm-workspace.yaml`.
- Windows PowerShell may block `pnpm` ("running scripts is disabled"). Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- If an install fails with `EPERM ... better_sqlite3.node`, a running `next dev` is holding the file. Stop it, then install again.

| Command | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (Node's built-in runner, in-memory SQLite) |
| `pnpm db:init` | Create or upgrade the database and the demo seed (safe to repeat) |
| `pnpm db:reset` | Delete the database file and recreate it |
| `pnpm db:import <file>` | Import the Kerala Private Bus dataset from a local file |
| `pnpm admin:hash` | Create the value for `ADMIN_PASSWORD_HASH` |

Environment variables (see `.env.example`; put real values in `.env.local`, which is git-ignored): `DATABASE_PATH`, `NEXT_DIST_DIR`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`, and for local development only `ADMIN_PASSWORD`.

## For passengers

Pick **From** and **To** by typing (spelling variations such as "kozhikode"/"calicut" and typos such as "medicl" work). ⇅ swaps them. Optionally set **Leave after** (or press **Now**), then **Find My Bus**.

- **Direct buses** and **buses with one change** show boarding and drop-off stops, times, duration, stops and fare.
- Every bus and fare carries a badge: **Demo data** (invented), **Unverified** (imported, not checked) or **Verified**. A verified bus also says when it was verified and against what ("Verified on 2026-10-12 against: operator timetable").
- If a fare is not recorded: "Fare not available". The app never estimates one.
- **Report a problem**: every bus has a "Report a wrong time" button; empty results and the results list offer "Report a wrong or missing route"; a "Report a wrong stop name" link sits under the data panel. The form is a modal dialog (a bottom sheet on phones), works in both languages and with the keyboard, and asks for no personal details. A contact phone or email is optional and is seen only by people who review reports. Nothing changes on the timetable until an admin has checked it.
- The **About this data** panel shows what is loaded, the import date and the upstream dataset's date.
- Searches are shareable links: `/?from=beypore&to=medical-college&after=07:00`.
- Language switch (മലയാളം / English) in the header, remembered per browser.

## Voyage: destinations, saved inspiration and trip planner

Separate from the bus service (which is unchanged and still lives at `/`), these pages help plan a trip. They are English only and are not linked from the bus pages.

| Page | What it does |
| --- | --- |
| `/explore` | Destinations: **Kozhikode, India** and **Istanbul, Türkiye**. |
| `/explore/<destination>` | Landmark and food-place cards with a static picture, short description, area, estimated visit time and estimated cost; filter All / Landmarks / Food. |
| `/explore/<destination>/<place>` | Place details: name, category, location, notes, estimated visit time, estimated cost, **Save**, and **Add to a trip** (choose the day). |
| `/saved` | **Save inspiration**: paste a Pinterest, Instagram, video (YouTube, TikTok, Vimeo) or any web link, and/or enter place details by hand (title, destination, category, location, notes, visit time, cost estimate). Organise into **collections**, filter and search, edit, delete, and add any item to a trip. |
| `/saved/<id>` | Edit or delete one saved item. |
| `/trips` | Your trips; create one with a name, destination, dates and budget currency. |
| `/trips/<id>` | The plan, one section per day: add saved places, curated places or custom activities; **edit, remove, reorder (↑ ↓) and move activities between days**; record **estimated expenses** (per day or for the whole trip); a budget summary with totals per currency; change the dates or delete the trip. |

How it behaves:

- **Everything is a working feature.** Every button saves to the database; there are no placeholders. Tests and a browser run cover each action.
- **No accounts.** The first time you save something, the browser gets a random private token in an `HttpOnly` cookie (`voyage_owner`, one year). The database stores only its SHA-256. Your saved items and trips belong to that browser: nobody else can read, change or delete them (another person asking for your trip or item gets the same 404 as for a missing one). Clearing cookies or using another browser or device starts an empty list; there is no sync. Browsing destinations sets no cookie.
- **Links are only stored and linked, never fetched.** Only `http`/`https` links are accepted (`javascript:`, `data:`, `file:` and links with a username or password are refused), the platform is recognised from the real domain (`pinterest.com.evil.example` is not Pinterest), and links open in a new tab with `noopener noreferrer nofollow`. The app calls no external API and uses no extra dependency.
- **An activity is a copy.** Adding a saved item or place to a day copies its details, so editing or deleting the original later never changes a plan.
- **Money is estimates, per currency.** Amounts are stored as integer cents. Totals are kept separately for each currency and **nothing is converted**, because no exchange rates are used. Every cost range on a place is labelled **Estimate**. Istanbul figures are given in euros because lira prices change quickly. All limits (500 saved items, 30 collections, 50 trips, 300 activities and 500 expenses per trip, 60-day trips) are enforced on the server.
- **The curated content is general knowledge, not live data.** It lives in `src/lib/voyage/content.ts` (6 Kozhikode landmarks and 3 food places, 5 Istanbul landmarks and 3 food places) and is copied into the database on start-up. The descriptions, durations and costs are rough planning estimates written for this project and have not been verified against live sources: opening rules, tickets and prices change, and the pages say so. Please review and correct them before relying on them publicly.
- **Pictures are original illustrations, not photographs.** `node scripts/make-images.mjs` generates the SVGs in `public/img` (about 26 KB in total). To use real photographs, add licensed files to `public/img` and change the `image` paths in `content.ts`.

Database (migration v3, see [docs/migrations.md](docs/migrations.md)): `destinations`, `places`, `collections`, `saved_items`, `voyage_trips`, `voyage_activities`, `voyage_expenses`. The names deliberately avoid the bus service's `trips` table; the migration only adds tables, and a test checks that the bus tables keep their exact shape.

## Admin area (`/admin`)

Administrators review, approve, reject and correct data, and work through passenger reports. The admin area is English only, is never linked from the public pages, and is **off until you configure a password**.

### Admin setup

```bash
pnpm admin:hash          # asks for a password (12+ characters), prints the lines to add
```

Put the output in `.env.local`:

```
ADMIN_PASSWORD_HASH=scrypt:16384:8:1:...
ADMIN_NAME=your-name
```

Restart the server and open `http://localhost:3000/admin`. For quick local tests only, `ADMIN_PASSWORD=...` is accepted when `NODE_ENV` is not `production`; it is ignored in production.

### What an admin can do

| Page | Purpose |
| --- | --- |
| **Overview** | Counts (open reports, buses awaiting verification, verified, demo, rejected, fares), last import, recent activity. |
| **Reports** | Passenger reports with what they were about, the message, a suggested correction and the optional contact. Move them *open → in review → resolved / dismissed*; closing needs a note. Links to the bus or stop concerned. |
| **Buses** | Filter by status, open reports or rejected; search by name or vehicle number. |
| **Bus page** | Source and verification details; **Approve** (mark verified), **Withdraw verification**, **Reject** (hide from passengers), **Restore**; correct the times of each trip; record, verify or reject fares; the bus's reports and history. |
| **Stops** | Correct English and Malayalam names, mark a stop name verified. |
| **History** | Every admin action with who, when, before and after. It cannot be edited from the app. |

### Verification rules (enforced in code, tested)

- **Approve needs a named source** ("Operator timetable photographed 2026-10-12"). The system records who, when and against what.
- **Demo data can never be verified or edited.** It can only be hidden (rejected). Demo fares cannot be verified either.
- **Any change withdraws verification.** Editing a verified bus's times or renaming a verified stop sets it back to unverified.
- **Rejecting hides a record from passengers** and withdraws its verification. The record, its reports and its history are kept; a rejected bus can be restored (as unverified).
- **Fares are only ever entered by an admin, and always with a source.** A fare can be verified at once (with a "verified against") or later. Whole rupees, 1 to 2000, one active fare per bus and stop pair. Rejected fares disappear from passenger results; there is no estimate or default.
- **Reviewed buses are protected from re-imports.** Verified, hand-edited and rejected buses are *locked*; `pnpm db:import` skips them and reports how many.
- **Original provenance is never overwritten.** `source` keeps where the data came from; review adds `verified_source`, `verified_at` and `verified_by` next to it.

### Admin security

- **Sign-in**: scrypt password hash (or none = admin disabled, it fails closed). Wrong passwords are throttled: 5 failures per address in 15 minutes lock that address out, and a global cap of 25 bounds guessing even if an address is forged. A failed attempt is slowed by about half a second.
- **Sessions**: a random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production), valid for 8 hours. Only its SHA-256 is stored, so signing out really revokes it. Admin pages are `no-store` and `noindex`.
- **Every action re-checks the session** itself, not only the page that showed the form. Next.js Server Actions add a built-in same-origin check; the cookie is `SameSite=Strict`.
- **All input is validated again on the server** (lengths, control characters, ranges, ids); SQL uses bound parameters throughout; list searches escape `%` and `_`.
- **Audit log** records every change in the same transaction as the change.
- Security headers on every page (`nosniff`, frame deny, referrer policy, permissions policy). No Content-Security-Policy is set yet.
- There is a single shared admin password (with a name label in the log), not per-person accounts.

If you deploy behind a reverse proxy, make it set `X-Forwarded-For` (and strip any value sent by clients). The throttles use it to tell clients apart; without a trusted proxy the global caps still apply.

## Passenger reports: API and abuse protection

`POST /api/reports` accepts same-origin JSON only (`Content-Type: application/json`, body up to 8 KB). It validates every field again, keeps context ids only if they exist, saves a readable snapshot of what was reported, and never returns stored data. Protections: per-address limit of 5 reports per 10 minutes plus a global limit of 120 per hour (HTTP 429 with `Retry-After`), a hidden honeypot field (bots get a normal-looking success and nothing is stored), a cap on open reports, and rejection of cross-site `Origin`. Responses are `no-store`.

## Data model and provenance

Every stop, bus and fare has `data_status` (`demo`, `unverified`, `verified`), `source`, and, once reviewed, `verified_at`, `verified_by`, `verified_source`, `review_note`, `updated_at`. Buses and fares can also be `rejected`. Trips take the status of their bus. Details and the migration history: [docs/migrations.md](docs/migrations.md).

## Importing real data: Kerala Private Bus Timing

**This project never downloads the dataset for you.** The upstream data has no licence, so getting it, and the right to use or share it, is your decision. The file is not in this repository and `data/*.db` is git-ignored; do not commit a database built from it unless you have permission.

What exists (checked 2026-10):

- There is no hosted API. The data is the community repo [amith-vp/Kerala-Private-Bus-Timing](https://github.com/amith-vp/Kerala-Private-Bus-Timing): static JSON files, including `kozhikkode.json` (double "k"), converted from RTI-obtained PDFs.
- `kozhikkode.json` (about 4 MB) has 647 buses, 9,290 trips and 401 distinct station names.
- No licence is stated. Last commit 2024-09-03; the schedules come from an RTI request and may be out of date. No fares are included.
- Its README warns of PDF-parsing errors. We saw 10 trips whose times run backwards and 2,112 trips with only one usable station.

To import, obtain `kozhikkode.json` yourself (with whatever permission you need), then:

```bash
pnpm db:import path/to/kozhikkode.json
pnpm db:import path/to/kozhikkode.json --replace-demo   # also remove the demo records
```

With the current file this yields about 643 buses, 7,168 trips and 379 stops. Everything imported is `unverified` with no fares, and Malayalam names only for the ~35 best-known stops (developer transliterations, unverified).

**Safety**: one transaction (a malformed file changes nothing); re-running is safe (a bus's trips are replaced as a whole, identical trips stored once, unused stops removed, stops with recorded fares kept); **buses a person verified, edited or rejected are skipped** and counted as `skippedProtected`; the last import (time, SHA-256, counts) is stored and shown.

**Stop-name matching** is deliberately conservative, because a wrong merge creates bus connections that do not exist. Automatic: case, punctuation and spacing. Reviewed aliases in `src/lib/importers/stop-names.ts` (spelling variants of the same place; **a local person should re-check them**). Everything else is *not* merged, even when similar (`Mavoor`/`Mokavoor` are different places); the import prints a "possible duplicates" list to review. `CITY`, `KOZHIKKODE` and `KOZHIKODE CITY` may be different stops, so the UI offers them as "similar stops" instead.

## Translations

`src/lib/i18n.ts` holds every message in English and Malayalam, and the same keys are used for validation, error, empty and loading states. Tests enforce: identical keys and `{placeholders}` in both languages, no untranslated English left in Malayalam, and one Malayalam term per key concept:

| Concept | Malayalam |
| --- | --- |
| verified / unverified | സ്ഥിരീകരിച്ച / സ്ഥിരീകരിച്ചിട്ടില്ല |
| demo | ഡെമോ |
| fare | നിരക്ക് |
| stop | സ്റ്റോപ്പ് |
| bus change | ബസ് മാറ്റം |
| report / report a problem | അറിയിപ്പ് / പ്രശ്നം അറിയിക്കുക |
| bus operator | ബസ് ഉടമ |

Style: polite imperative ("…ചെയ്യുക"). The Malayalam was written by the developer and checked for consistency by tests, **not by a native-speaker proofreader. Please have one review it** before a public launch (especially the legal-sounding sentences about verification). The admin area is English only.

## Accessibility and mobile

Skip link; labelled form controls, errors tied to fields with `aria-describedby` and announced as alerts; the stop picker is an ARIA combobox with keyboard support; the report form is a native modal `<dialog>` (focus trap, Esc, focus returns to the button); live regions for results and admin confirmations; visible 3px focus outlines; touch targets of at least 40px; text contrast checked; `prefers-reduced-motion` respected; zoom is not disabled; safe-area padding on notched phones; the `lang` attribute follows the chosen language. Automated axe-core scans (WCAG 2.0/2.1/2.2 A and AA plus best practices) found no serious or critical issues on the pages listed under Tests. Automated scans cannot prove full accessibility; a manual screen-reader pass (TalkBack, VoiceOver, NVDA) is still recommended.

## Tests

- `pnpm test`: 166 unit tests (118 for the bus service and admin, 48 for Voyage) covering search and fares, the demo seed, the importer and stop-name rules, **migrations** (a v1 database upgrades with every row intact, backup written once, atomic and idempotent), **review operations** (verify needs a source, demo can't be verified, reject hides from search, edits withdraw verification, fares need a source, audit log, importer leaves reviewed buses alone), **passenger reports** (validation, honeypot, snapshot, workflow), **authentication** (hashing, sessions, expiry, rate limiter, fail-closed configuration) **translations**, and Voyage: link validation (Pinterest/Instagram/video recognition, look-alike domains, dangerous schemes), money and date handling, saved items and collections, trips, activities, reordering, expenses, per-visitor privacy, limits, content integrity (including that every image file exists) and a guard that the bus tables are untouched.
- Browser checks (Playwright against Microsoft Edge, production build, phone 390×844 and desktop 1280×800): the earlier 94 passenger checks plus 105 Phase 4 checks: report dialog (open, validate, submit, Esc, focus return, Malayalam, all entry points), report API abuse cases, admin access control (unauthenticated redirects, fails closed when unconfigured, cookie flags, sign-out, lockout), the full review workflow on imported data (report → in review → verify → passenger sees "Verified on … against …" in both languages → edit withdraws verification → fare added, verified, rejected → reject and restore → stop rename → audit), demo records refusing verification, a stale-session action being refused, a re-import leaving the reviewed bus untouched, and axe scans. The scripts live outside this repository and are not part of `pnpm test`.

## Deployment requirements

- A Node.js server with a **writable, persistent disk** for the SQLite file (`DATABASE_PATH`). Serverless or read-only hosts (for example Vercel) will not keep the database, reports or sessions.
- **HTTPS in production.** The admin cookie is `Secure`, so sign-in does not work over plain http (unless `ADMIN_INSECURE_COOKIES=1`, only for a private network).
- Set `ADMIN_PASSWORD_HASH` (and `ADMIN_NAME`) in the server environment. Without them `/admin` stays off.
- Build with `pnpm build`, run with `pnpm start`; build `better-sqlite3` for the target OS and Node version.
- One app instance per database file (rate limits and sessions' throttles are per process). Run imports while the app is idle or against a copy.
- The first start after upgrading migrates the database and writes `<file>.pre-v2.bak`. Keep backups of the `.db` file: it now also holds reports, reviews and the audit log.
- Behind a proxy: pass and sanitise `X-Forwarded-For`.
- Before public launch: resolve the dataset licence question; have the Malayalam reviewed; decide who the admins are and how reports are triaged; consider adding a Content-Security-Policy and per-person admin accounts.

## Known limitations

- Only one bus change; no walking between nearby stops.
- No day-of-week information in the dataset: every listed time is shown as running daily. Holidays and strikes are not modelled.
- Source names are free text; unmerged spelling variants can hide real connections (see "similar stops").
- Imported stops mostly have English names only; the Malayalam transliterations are unverified.
- No fares in the dataset; fares exist only where an admin has entered them with a source.
- Timetable data only: no live positions, delays or cancellations.
- One shared admin login; no email notification of new reports (check the Reports page); a report cannot be answered, because contact details are optional and no message is sent.
- Rate limits are in memory and reset when the server restarts.
