// Usage:
//   pnpm db:import <path-to-kozhikkode.json> [--replace-demo]
//
// Reads a JSON file you have downloaded yourself. This script never downloads anything: the upstream
// dataset has no licence, so obtaining it (and the right to use it) is your decision. See README.
// Imported rows are stored as 'unverified'.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { openDb } from "../src/lib/db/connection";
import { importKeralaPrivateBus } from "../src/lib/importers/kerala-private-bus";

const args = process.argv.slice(2);
const replaceDemo = args.includes("--replace-demo");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("Usage: pnpm db:import <path-to-kozhikkode.json> [--replace-demo]");
  process.exit(1);
}

try {
  const text = fs.readFileSync(file, "utf8");
  const db = openDb();
  const fingerprint = createHash("sha256").update(text).digest("hex");
  const { possibleDuplicates, ...summary } = importKeralaPrivateBus(db, JSON.parse(text), fingerprint);
  if (replaceDemo) {
    db.transaction(() => {
      db.prepare("DELETE FROM services WHERE data_status = 'demo'").run(); // cascades trips, trip_stops, fares
      db.prepare("DELETE FROM stops WHERE data_status = 'demo'").run();
    })();
    console.log("Removed demo records.");
  }
  console.log("Imported (all marked 'unverified'):", summary);
  if (possibleDuplicates.length) {
    console.log("\nPossible duplicate stop names (NOT merged; review, then add to STOP_ALIASES if they are the same place):");
    for (const d of possibleDuplicates) console.log(`  ${d.a} (${d.usesA})  ~  ${d.b} (${d.usesB})`);
  }
  db.close();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
