import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listAudit } from "../src/lib/admin/audit";
import { AdminError } from "../src/lib/admin/errors";
import { openDb } from "../src/lib/db/connection";
import {
  countReports, createReport, getReport, listReports, REPORT_LIMITS, updateReport, validateReportInput, type ReportInput,
} from "../src/lib/reports";
import { addTrip, hm, memoryDb } from "./helpers";

const good = (over: Record<string, unknown> = {}) => ({
  kind: "timing",
  message: "The 7:00 bus actually leaves at 7:10.",
  suggestion: "7:10",
  contact: "",
  lang: "en",
  serviceId: "bus1",
  tripId: 1,
  fromStopId: "a",
  toStopId: "c",
  website: "",
  ...over,
});
const valid = (raw: unknown) => {
  const r = validateReportInput(raw);
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: ReportInput }).value;
};
const errors = (raw: unknown) => {
  const r = validateReportInput(raw);
  assert.ok(!r.ok);
  return (r as { ok: false; errors: Record<string, string>; spam?: boolean });
};

describe("validateReportInput", () => {
  it("accepts a good report and normalises it", () => {
    const v = valid(good({ message: "  Line one\r\nline two is wrong  " }));
    assert.equal(v.message, "Line one\nline two is wrong");
    assert.equal(v.lang, "en");
    assert.equal(v.tripId, 1);
  });
  it("rejects unknown kinds, short, empty and oversized messages", () => {
    assert.equal(errors(good({ kind: "hack" })).errors.kind, "invalid");
    assert.equal(errors(good({ message: "" })).errors.message, "required");
    assert.equal(errors(good({ message: "too short" })).errors.message, "too_short");
    assert.equal(errors(good({ message: "x".repeat(REPORT_LIMITS.messageMax + 1) })).errors.message, "too_long");
    assert.equal(errors(good({ message: "bad \u0000 byte in message" })).errors.message, "invalid");
    assert.equal(errors(good({ suggestion: "y".repeat(REPORT_LIMITS.suggestion + 1) })).errors.suggestion, "too_long");
    assert.equal(errors(good({ contact: "z".repeat(REPORT_LIMITS.contact + 1) })).errors.contact, "too_long");
  });
  it("rejects malformed ids and non-objects", () => {
    assert.equal(errors(good({ serviceId: "x'; DROP TABLE services;--" })).errors.serviceId, "invalid");
    assert.equal(errors(good({ fromStopId: "../etc" })).errors.fromStopId, "invalid");
    assert.equal(errors(good({ tripId: "1; DROP" })).errors.tripId, "invalid");
    assert.equal(errors(good({ tripId: -4 })).errors.tripId, "invalid");
    for (const raw of [null, "text", 42, [], undefined]) assert.equal(errors(raw).errors.message, "invalid");
  });
  it("treats a filled honeypot as spam", () => {
    assert.equal(errors(good({ website: "http://spam.example" })).spam, true);
  });
  it("accepts Malayalam text", () => {
    assert.equal(valid(good({ message: "ഈ ബസിന്റെ സമയം തെറ്റാണ്, ഏഴര ആണ്.", lang: "ml" })).lang, "ml");
  });
});

describe("createReport and handling", () => {
  const setup = () => {
    const db = memoryDb();
    const trip = addTrip(db, "bus1", [["a", null, hm(7)], ["c", hm(7, 40), null]]);
    return { db, trip };
  };

  it("stores the report with a readable snapshot of what it was about", () => {
    const { db, trip } = setup();
    const id = createReport(db, valid(good({ tripId: trip })));
    const r = getReport(db, id)!;
    assert.equal(r.status, "open");
    assert.equal(r.kind, "timing");
    assert.equal(r.serviceId, "bus1");
    assert.match(r.contextLabel ?? "", /bus1/);
    assert.match(r.contextLabel ?? "", /7:00 AM/);
    assert.match(r.contextLabel ?? "", /A → C/);
    assert.equal(r.contact, null);
  });

  it("drops context ids that don't exist instead of trusting them", () => {
    const { db } = setup();
    const id = createReport(db, valid(good({ serviceId: "ghost", tripId: 777, fromStopId: "nowhere", toStopId: "c" })));
    const r = getReport(db, id)!;
    assert.deepEqual([r.serviceId, r.tripId, r.fromStopId, r.toStopId], [null, null, null, "c"]);
  });

  it("stores SQL-looking text as plain text", () => {
    const { db } = setup();
    const text = "Robert'); DROP TABLE reports;-- is not a stop";
    const id = createReport(db, valid(good({ message: text })));
    assert.equal(getReport(db, id)!.message, text);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM reports").get() as { n: number }).n, 1);
  });

  it("is hidden from passengers: reports are never part of search or stop data", () => {
    const { db } = setup();
    createReport(db, valid(good()));
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM stops").all()).includes("leaves at 7:10"));
  });

  it("an admin moves reports through the workflow and every step is audited", () => {
    const { db } = setup();
    const id = createReport(db, valid(good()));
    updateReport(db, "tester", id, { status: "in_review" });
    assert.equal(getReport(db, id)!.status, "in_review");
    // closing needs a note
    assert.throws(() => updateReport(db, "tester", id, { status: "resolved", note: "" }), (e) => e instanceof AdminError && e.code === "validation");
    updateReport(db, "tester", id, { status: "resolved", note: "Corrected to 7:10, verified with operator" });
    const r = getReport(db, id)!;
    assert.deepEqual([r.status, r.handledBy, r.resolutionNote], ["resolved", "tester", "Corrected to 7:10, verified with operator"]);
    assert.ok(r.handledAt);
    assert.deepEqual(listAudit(db, { entityType: "report" }).map((e) => e.action), ["report_resolved", "report_in_review"]);
    assert.throws(() => updateReport(db, "tester", id, { status: "nonsense" }), (e) => e instanceof AdminError);
    assert.throws(() => updateReport(db, "tester", 9999, { status: "dismissed", note: "no such report" }), (e) => e instanceof AdminError && e.code === "not_found");
  });

  it("lists open reports first and filters", () => {
    const { db } = setup();
    const a = createReport(db, valid(good({ message: "first report about timing" })));
    const b = createReport(db, valid(good({ kind: "stop_name", message: "second report about a stop name", stopId: "a" })));
    updateReport(db, "t", a, { status: "dismissed", note: "not an issue" });
    assert.deepEqual(listReports(db).map((r) => r.id), [b, a]);
    assert.deepEqual(listReports(db, { status: "active" }).map((r) => r.id), [b]);
    assert.deepEqual(listReports(db, { kind: "timing" }).map((r) => r.id), [a]);
    assert.deepEqual(listReports(db, { stopId: "a" }).map((r) => r.id), [b]);
    assert.deepEqual(countReports(db), { open: 1, in_review: 0, resolved: 0, dismissed: 1 });
  });

  it("works on a database upgraded from the older schema", () => {
    const db = openDb(":memory:");
    assert.ok(createReport(db, valid(good({ serviceId: "demo-1-out", fromStopId: "mananchira", toStopId: "palayam" }))) > 0);
  });
});
