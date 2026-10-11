// Creates the SQLite file, schema and demo seed. `--reset` deletes the DB file first.
import fs from "node:fs";
import { dbPath, openDb } from "../src/lib/db/connection";

const file = dbPath();
if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  console.log(`Removed ${file}`);
}
const db = openDb(file);
const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
console.log(`Database ready at ${file}`);
for (const t of ["stops", "services", "trips", "trip_stops", "fares"]) console.log(`  ${t}: ${count(t)}`);
db.close();
