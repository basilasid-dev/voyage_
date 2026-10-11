"use server";

// Every admin operation. Each action checks the session itself (never rely on the page that rendered the
// form), re-validates all input in the core module, and returns a message instead of throwing.
// Server Actions also get Next.js' built-in same-origin (CSRF) check, on top of the SameSite=Strict cookie.
import { revalidatePath } from "next/cache";
import { AdminError } from "@/lib/admin/errors";
import {
  addFare, parseHm, rejectFare, rejectService, renameStop, restoreService, unverifyService, updateTripTimes,
  verifyFare, verifyService, verifyStop, type TripStopInput,
} from "@/lib/admin/review";
import { currentAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { updateReport } from "@/lib/reports";
import { moderatePost } from "@/lib/voyage/community";

export type ActionState = { ok: boolean; message: string } | null;

const val = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");

async function run(fn: (actor: string, db: ReturnType<typeof getDb>) => string, paths: string[]): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, message: "Your session has expired. Sign in again." };
  try {
    const message = fn(admin.actor, getDb());
    for (const p of paths) revalidatePath(p);
    return { ok: true, message };
  } catch (err) {
    if (err instanceof AdminError) return { ok: false, message: err.message };
    console.error("admin action failed", err);
    return { ok: false, message: "Something went wrong. Nothing was changed." };
  }
}

const busPaths = (id: string) => [`/admin/buses/${encodeURIComponent(id)}`, "/admin/buses", "/admin"];

export async function verifyServiceAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => (verifyService(db, a, id, { source: val(f, "source"), note: val(f, "note") }), "Bus verified."), busPaths(id));
}
export async function unverifyServiceAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => (unverifyService(db, a, id, { note: val(f, "note") }), "Verification withdrawn."), busPaths(id));
}
export async function rejectServiceAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => (rejectService(db, a, id, { reason: val(f, "reason") }), "Bus rejected. Passengers no longer see it."), busPaths(id));
}
export async function restoreServiceAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => (restoreService(db, a, id, { note: val(f, "note") }), "Bus restored as unverified."), busPaths(id));
}

export async function updateTripTimesAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => {
    const tripId = Number(val(f, "tripId"));
    const rows: TripStopInput[] = [];
    for (const key of f.keys()) {
      const m = /^arr_(\d+)$/.exec(key);
      if (!m) continue;
      const seq = Number(m[1]);
      rows.push({ seq, arrivalMin: parseHm(val(f, `arr_${seq}`)), departureMin: parseHm(val(f, `dep_${seq}`)) });
    }
    updateTripTimes(db, a, tripId, rows, { note: val(f, "note") });
    return "Times saved. If this bus was verified, verification was withdrawn and it needs checking again.";
  }, busPaths(id));
}

export async function renameStopAction(_: ActionState, f: FormData) {
  const id = val(f, "stopId");
  return run((a, db) => (renameStop(db, a, id, { nameEn: val(f, "nameEn"), nameMl: val(f, "nameMl"), note: val(f, "note") }), "Stop saved."), [`/admin/stops/${encodeURIComponent(id)}`, "/admin/stops"]);
}
export async function verifyStopAction(_: ActionState, f: FormData) {
  const id = val(f, "stopId");
  return run((a, db) => (verifyStop(db, a, id, { source: val(f, "source"), note: val(f, "note") }), "Stop verified."), [`/admin/stops/${encodeURIComponent(id)}`, "/admin/stops"]);
}

export async function addFareAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => {
    addFare(db, a, {
      serviceId: id,
      fromStopId: val(f, "fromStopId"),
      toStopId: val(f, "toStopId"),
      amountInr: val(f, "amountInr"),
      source: val(f, "source"),
      verifiedSource: val(f, "verifiedSource"),
    });
    return "Fare recorded.";
  }, busPaths(id));
}
export async function verifyFareAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => (verifyFare(db, a, Number(val(f, "fareId")), { source: val(f, "source") }), "Fare verified."), busPaths(id));
}
export async function rejectFareAction(_: ActionState, f: FormData) {
  const id = val(f, "serviceId");
  return run((a, db) => (rejectFare(db, a, Number(val(f, "fareId")), { reason: val(f, "reason") }), "Fare rejected."), busPaths(id));
}

export async function moderateCommunityAction(_: ActionState, f: FormData) {
  return run((a, db) => (moderatePost(db, a, Number(val(f, "postId")), val(f, "decision"), val(f, "note")), "Decision saved."), ["/admin/community", "/community"]);
}

export async function updateReportAction(_: ActionState, f: FormData) {
  return run((a, db) => (updateReport(db, a, Number(val(f, "reportId")), { status: val(f, "status"), note: val(f, "note") }), "Report updated."), ["/admin/reports", "/admin"]);
}
