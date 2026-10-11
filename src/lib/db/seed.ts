import type Database from "better-sqlite3";

const SEED_FLAG = "demo_seed_v1";
export const DEMO_SOURCE = "DEMO: invented sample data, not a real timetable or fare";

const STOPS: [id: string, en: string, ml: string][] = [
  ["mananchira", "Mananchira", "മാനാഞ്ചിറ"],
  ["palayam", "Palayam", "പാളയം"],
  ["thondayad", "Thondayad", "തൊണ്ടയാട്"],
  ["medical-college", "Medical College", "മെഡിക്കൽ കോളേജ്"],
  ["kunnamangalam", "Kunnamangalam", "കുന്ദമംഗലം"],
  ["mavoor-road", "Mavoor Road", "മാവൂർ റോഡ്"],
  ["pantheerankavu", "Pantheerankavu", "പന്തീരാങ്കാവ്"],
  ["ramanattukara", "Ramanattukara", "രാമനാട്ടുകര"],
  ["feroke", "Feroke", "ഫറോക്ക്"],
  ["beypore", "Beypore", "ബേപ്പൂർ"],
  ["vellayil", "Vellayil", "വെള്ളയിൽ"],
];

// Each route runs both ways. Times are invented: first departures + 4 min per hop.
const ROUTES: { name: string; stops: string[]; firstDepartures: string[] }[] = [
  {
    name: "DEMO Route 1",
    stops: ["mananchira", "palayam", "thondayad", "medical-college", "kunnamangalam"],
    firstDepartures: ["06:30", "07:00", "07:30", "08:15", "09:00", "10:30"],
  },
  {
    name: "DEMO Route 2",
    stops: ["beypore", "feroke", "ramanattukara", "pantheerankavu", "thondayad"],
    firstDepartures: ["06:20", "07:10", "08:00", "09:10", "10:00"],
  },
  {
    name: "DEMO Route 3",
    stops: ["vellayil", "mananchira", "palayam", "mavoor-road"],
    firstDepartures: ["06:45", "07:45", "08:45", "09:45"],
  },
];

const HOP_MIN = 4;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function seedDemoData(db: Database.Database): void {
  const done = db.prepare("SELECT 1 FROM meta WHERE key = ?").get(SEED_FLAG);
  if (done) return;

  const insStop = db.prepare(
    "INSERT OR IGNORE INTO stops (id, name_en, name_ml, data_status, source) VALUES (?, ?, ?, 'demo', ?)",
  );
  const insService = db.prepare(
    "INSERT OR IGNORE INTO services (id, name, operator, vehicle_number, data_status, source) VALUES (?, ?, 'Demo operator', NULL, 'demo', ?)",
  );
  const insTrip = db.prepare("INSERT INTO trips (service_id, trip_no) VALUES (?, ?)");
  const insTripStop = db.prepare(
    "INSERT INTO trip_stops (trip_id, seq, stop_id, arrival_min, departure_min) VALUES (?, ?, ?, ?, ?)",
  );
  const insFare = db.prepare(
    "INSERT INTO fares (service_id, from_stop_id, to_stop_id, amount_inr, data_status, source) VALUES (?, ?, ?, ?, 'demo', ?)",
  );

  db.transaction(() => {
    for (const [id, en, ml] of STOPS) insStop.run(id, en, ml, DEMO_SOURCE);

    ROUTES.forEach((route, r) => {
      for (const dir of ["out", "back"] as const) {
        const stops = dir === "out" ? route.stops : [...route.stops].reverse();
        const serviceId = `demo-${r + 1}-${dir}`;
        insService.run(serviceId, `${route.name}${dir === "back" ? " (return)" : ""}`, DEMO_SOURCE);

        // Demo fare: 10 base + 3 per hop. Invented.
        for (let i = 0; i < stops.length; i++)
          for (let j = i + 1; j < stops.length; j++)
            insFare.run(serviceId, stops[i], stops[j], 10 + 3 * (j - i), DEMO_SOURCE);

        route.firstDepartures.forEach((dep, t) => {
          const tripId = Number(insTrip.run(serviceId, String(t + 1)).lastInsertRowid);
          stops.forEach((stopId, seq) => {
            const at = toMin(dep) + seq * HOP_MIN;
            insTripStop.run(tripId, seq, stopId, seq === 0 ? null : at, seq === stops.length - 1 ? null : at);
          });
        });
      }
    });

    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(SEED_FLAG, new Date().toISOString());
  })();
}
