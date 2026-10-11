"use server";

// Every mutation of the travel-planning services. Each action: finds (or creates) the visitor's private space from
// their cookie, re-validates every field in the core modules, only touches that visitor's rows, and returns a
// message instead of throwing. Next.js Server Actions also enforce a same-origin check (CSRF protection).
import { revalidatePath } from "next/cache";
import { RateLimiter } from "@/lib/admin/auth-core";
import { getDb } from "@/lib/db/connection";
import { analyzeSource } from "@/lib/voyage/extract";
import { ensureOwner } from "@/lib/voyage/owner";
import {
  addCaptureToTrip, addManualCandidate, confirmCandidates, createCapture, deleteCapture, rejectCandidates, type Pick,
} from "@/lib/voyage/reel";
import {
  createCollection, createSaved, deleteCollection, deleteSaved, moveToCollection, renameCollection, savePlace, updateSaved,
} from "@/lib/voyage/saved";
import {
  addActivityFromPlace, addActivityFromSaved, addCustomActivity, addExpense, applyOrder, createTrip, deleteTrip, moveActivity,
  moveActivityToDay, removeActivity, removeExpense, updateActivity, updateExpense, updateTrip,
} from "@/lib/voyage/trips";
import { createCommunityPost, deleteCommunityPost, reportCommunityPost, toggleHelpful } from "@/lib/voyage/community";
import { VoyageError } from "@/lib/voyage/validate";

export type ActionResult = { ok: boolean; message: string; redirect?: string } | null;

type Ctx = { db: ReturnType<typeof getDb>; owner: string };
const val = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");
/** A whole-number id from a form, or -1 (which matches nothing) if it is missing or not a number. */
const num = (f: FormData, k: string) => {
  const n = Number(val(f, k));
  return Number.isSafeInteger(n) ? n : -1;
};

async function run(fn: (c: Ctx) => string | { message: string; redirect?: string }, paths: string[]): Promise<ActionResult> {
  try {
    const owner = await ensureOwner();
    const r = fn({ db: getDb(), owner });
    for (const p of paths) revalidatePath(p);
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, ...r };
  } catch (err) {
    if (err instanceof VoyageError) return { ok: false, message: err.message };
    console.error("voyage action failed", err);
    return { ok: false, message: "Something went wrong. Nothing was changed. Please try again." };
  }
}

const savedFields = (f: FormData) => ({
  title: val(f, "title"),
  url: val(f, "url"),
  destinationId: val(f, "destinationId"),
  collectionId: val(f, "collectionId"),
  category: val(f, "category"),
  location: val(f, "location"),
  notes: val(f, "notes"),
  durationMin: val(f, "durationMin"),
  cost: val(f, "cost"),
  currency: val(f, "currency"),
  tags: val(f, "tags"),
});
const activityFields = (f: FormData) => ({
  title: val(f, "title"),
  category: val(f, "category"),
  location: val(f, "location"),
  notes: val(f, "notes"),
  durationMin: val(f, "durationMin"),
  cost: val(f, "cost"),
  currency: val(f, "currency"),
  startTime: val(f, "startTime"),
});
const tripFields = (f: FormData) => ({
  name: val(f, "name"),
  destinationId: val(f, "destinationId"),
  startDate: val(f, "startDate"),
  endDate: val(f, "endDate"),
  currency: val(f, "currency"),
  notes: val(f, "notes"),
});
const expenseFields = (f: FormData) => ({
  label: val(f, "label"),
  category: val(f, "category"),
  amount: val(f, "amount"),
  currency: val(f, "currency"),
  day: val(f, "day"),
  notes: val(f, "notes"),
});

const tripPath = (id: number | string) => `/trips/${id}`;

// ------------------------------------------------------------------ saved inspiration

export async function createSavedAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (createSaved(db, owner, savedFields(f)), "Saved."), ["/saved"]);
}
export async function updateSavedAction(_: ActionResult, f: FormData) {
  const id = num(f, "id");
  return run(({ db, owner }) => (updateSaved(db, owner, id, savedFields(f)), "Changes saved."), ["/saved", `/saved/${id}`]);
}
export async function deleteSavedAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (deleteSaved(db, owner, num(f, "id")), { message: "Deleted.", redirect: "/saved" }), ["/saved"]);
}
export async function savePlaceAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => {
    const r = savePlace(db, owner, val(f, "placeId"));
    return r.created ? "Saved to your list." : "Already in your saved list.";
  }, ["/saved", "/explore"]);
}
export async function moveSavedAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => {
    const col = val(f, "collectionId");
    moveToCollection(db, owner, num(f, "id"), col === "" ? null : Number(col));
    return "Moved.";
  }, ["/saved"]);
}

export async function createCollectionAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (createCollection(db, owner, val(f, "name")), "Collection created."), ["/saved"]);
}
export async function renameCollectionAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (renameCollection(db, owner, num(f, "id"), val(f, "name")), "Renamed."), ["/saved"]);
}
export async function deleteCollectionAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (deleteCollection(db, owner, num(f, "id")), "Collection deleted. Its items were kept."), ["/saved"]);
}

// ------------------------------------------------------------------ trips

export async function createTripAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => {
    const id = createTrip(db, owner, tripFields(f));
    return { message: "Trip created.", redirect: tripPath(id) };
  }, ["/trips"]);
}
export async function updateTripAction(_: ActionResult, f: FormData) {
  const id = num(f, "tripId");
  return run(({ db, owner }) => (updateTrip(db, owner, id, tripFields(f)), "Trip updated."), ["/trips", tripPath(id)]);
}
export async function deleteTripAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (deleteTrip(db, owner, num(f, "tripId")), { message: "Trip deleted.", redirect: "/trips" }), ["/trips"]);
}

/** Adds a saved item or a curated place to a day of a trip. */
export async function addToTripAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => {
    const savedId = val(f, "savedId");
    const placeId = val(f, "placeId");
    if (savedId) addActivityFromSaved(db, owner, tripId, f.get("day"), Number(savedId));
    else if (placeId) addActivityFromPlace(db, owner, tripId, f.get("day"), placeId);
    else throw new VoyageError("validation", "Choose something to add.");
    return `Added to day ${val(f, "day")}.`;
  }, [tripPath(tripId), "/trips"]);
}
export async function addCustomActivityAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (addCustomActivity(db, owner, tripId, f.get("day"), activityFields(f)), "Activity added."), [tripPath(tripId), "/trips"]);
}
export async function updateActivityAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (updateActivity(db, owner, num(f, "id"), { ...activityFields(f), day: val(f, "day") }), "Activity updated."), [tripPath(tripId)]);
}
export async function moveActivityAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  const dir = val(f, "direction");
  return run(({ db, owner }) => (moveActivity(db, owner, num(f, "id"), dir as "up" | "down"), dir === "up" ? "Moved up." : "Moved down."), [tripPath(tripId)]);
}
export async function moveActivityDayAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (moveActivityToDay(db, owner, num(f, "id"), f.get("day")), `Moved to day ${val(f, "day")}.`), [tripPath(tripId)]);
}
export async function removeActivityAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (removeActivity(db, owner, num(f, "id")), "Removed from the plan."), [tripPath(tripId), "/trips"]);
}

// ------------------------------------------------------------------ expenses

export async function addExpenseAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (addExpense(db, owner, tripId, expenseFields(f)), "Expense added."), [tripPath(tripId)]);
}
export async function updateExpenseAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (updateExpense(db, owner, num(f, "id"), expenseFields(f)), "Expense updated."), [tripPath(tripId)]);
}
export async function removeExpenseAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  return run(({ db, owner }) => (removeExpense(db, owner, num(f, "id")), "Expense removed."), [tripPath(tripId)]);
}

// ------------------------------------------------------------------ suggested order

/** Applies an order proposed by suggestOrder() (the page computes it; the ids are re-checked against the day here). */
export async function applyOrderAction(_: ActionResult, f: FormData) {
  const tripId = num(f, "tripId");
  const ids = val(f, "ids").split(",").map(Number).filter((n) => Number.isSafeInteger(n));
  return run(({ db, owner }) => (applyOrder(db, owner, tripId, f.get("day"), ids), "Suggested order applied."), [tripPath(tripId)]);
}

// ------------------------------------------------------------------ Reel-to-Travel

// Reading a link makes a small outbound request, so it is rate limited per visitor.
const analyzeLimiter = new RateLimiter(12, 10 * 60_000);

/** Pasted link and/or caption -> honest analysis -> a capture the person can review. Nothing is saved to the library yet. */
export async function analyzeReelAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    const owner = await ensureOwner();
    if (!analyzeLimiter.allowed(owner)) {
      return { ok: false, message: "You have analysed several links in a short time. Please wait a few minutes and try again." };
    }
    const analysis = await analyzeSource({ url: val(f, "url"), caption: val(f, "caption") });
    analyzeLimiter.record(owner);
    const id = createCapture(getDb(), owner, analysis);
    revalidatePath("/reel-to-travel");
    return { ok: true, message: "Link read. Check the places we found.", redirect: "/reel-to-travel/" + id };
  } catch (err) {
    if (err instanceof VoyageError) return { ok: false, message: err.message };
    console.error("analyze failed", err);
    return { ok: false, message: "Something went wrong while reading that. Nothing was saved. Please try again." };
  }
}

function picksFrom(f: FormData): Pick[] {
  return f
    .getAll("pick")
    .map((v) => Number(v))
    .filter((n) => Number.isSafeInteger(n))
    .map((id) => ({
      candidateId: id,
      name: val(f, "name_" + id),
      category: val(f, "category_" + id),
      destinationId: val(f, "dest_" + id),
      notes: val(f, "notes_" + id),
    }));
}

/** Saves the ticked places (with the person's corrections) into their library, optionally into a collection. */
export async function confirmReelAction(_: ActionResult, f: FormData) {
  const captureId = num(f, "captureId");
  return run(({ db, owner }) => {
    const r = confirmCandidates(db, owner, captureId, picksFrom(f), {
      collectionId: val(f, "collectionId"),
      newCollectionName: val(f, "newCollection"),
      tags: val(f, "tags"),
    });
    const parts = [];
    if (r.saved.length) parts.push(r.saved.length + " saved");
    if (r.alreadySaved.length) parts.push(r.alreadySaved.length + " already in your library");
    if (r.failed.length) parts.push(r.failed.length + " could not be saved (" + r.failed[0].reason + ")");
    if (r.saved.length + r.alreadySaved.length === 0) throw new VoyageError("validation", r.failed[0]?.reason ?? "Nothing was saved.");
    return parts.join(", ") + ".";
  }, ["/saved", "/my-voyage", "/reel-to-travel/" + captureId, "/reel-to-travel"]);
}

export async function addManualCandidateAction(_: ActionResult, f: FormData) {
  const captureId = num(f, "captureId");
  return run(({ db, owner }) => (addManualCandidate(db, owner, captureId, { name: val(f, "name"), category: val(f, "category"), destinationId: val(f, "destinationId") }), "Place added to the list."), ["/reel-to-travel/" + captureId]);
}

export async function rejectCandidatesAction(_: ActionResult, f: FormData) {
  const captureId = num(f, "captureId");
  return run(({ db, owner }) => {
    const ids = f.getAll("pick").map(Number).filter((n) => Number.isSafeInteger(n));
    if (ids.length === 0) throw new VoyageError("validation", "Tick the places you want to remove first.");
    rejectCandidates(db, owner, captureId, ids);
    return "Removed from the list.";
  }, ["/reel-to-travel/" + captureId]);
}

export async function deleteCaptureAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (deleteCapture(db, owner, num(f, "captureId")), { message: "Capture deleted. Saved places were kept.", redirect: "/reel-to-travel" }), ["/reel-to-travel"]);
}

/** Adds every confirmed place of a capture to a day of an existing trip, or of a new one. Already planned places are skipped. */
export async function addCaptureToTripAction(_: ActionResult, f: FormData) {
  const captureId = num(f, "captureId");
  return run(({ db, owner }) => {
    let tripId = num(f, "tripId");
    if (val(f, "tripId") === "new") {
      tripId = createTrip(db, owner, {
        name: val(f, "newTripName"),
        destinationId: val(f, "destinationId"),
        startDate: val(f, "startDate"),
        endDate: val(f, "endDate"),
      });
    }
    const day = val(f, "tripId") === "new" ? 1 : f.get("day");
    const r = addCaptureToTrip(db, owner, captureId, tripId, day);
    const skipped = r.skipped.length ? " " + r.skipped.length + " skipped (" + r.skipped[0].reason + ")" : "";
    if (r.added.length === 0) throw new VoyageError("conflict", "Nothing new to add." + skipped);
    return { message: "Added " + r.added.length + " place" + (r.added.length === 1 ? "" : "s") + " to your trip." + skipped, redirect: tripPath(tripId) };
  }, ["/trips", "/my-voyage", "/saved", "/reel-to-travel/" + captureId]);
}

// ------------------------------------------------------------------ community

const communityLimiter = new RateLimiter(60, 60 * 60_000); // all visitors together, per hour

export async function createCommunityPostAction(_: ActionResult, f: FormData) {
  // Hidden "website" field: people never fill it, bots do. Answer as if it worked and store nothing.
  if (val(f, "website").trim() !== "") return { ok: true, message: "Thank you for sharing." };
  return run(({ db, owner }) => {
    if (!communityLimiter.allowed("*")) throw new VoyageError("limit", "Lots of contributions are arriving right now. Please try again in a little while.");
    createCommunityPost(db, owner, {
      authorName: val(f, "authorName"),
      destinationId: val(f, "destinationId"),
      placeId: val(f, "placeId"),
      title: val(f, "title"),
      content: val(f, "content"),
      category: val(f, "category"),
      visitDate: val(f, "visitDate"),
      spend: val(f, "spend"),
      currency: val(f, "currency"),
      timeNeededMin: val(f, "timeNeededMin"),
      bestTime: val(f, "bestTime"),
    });
    communityLimiter.record("*");
    return "Thank you for sharing. Your contribution is now visible to other travellers.";
  }, ["/community", "/explore"]);
}

export async function toggleHelpfulAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (toggleHelpful(db, owner, num(f, "id")) ? "Marked as helpful." : "Removed your helpful mark."), ["/community"]);
}

export async function reportCommunityPostAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (reportCommunityPost(db, owner, { postId: num(f, "postId"), reason: val(f, "reason"), details: val(f, "details") }), "Thank you. A person will review this contribution."), ["/community"]);
}

export async function deleteCommunityPostAction(_: ActionResult, f: FormData) {
  return run(({ db, owner }) => (deleteCommunityPost(db, owner, num(f, "id")), "Your contribution was deleted."), ["/community", "/explore"]);
}

export async function saveCommunityTipAction(_: ActionResult, f: FormData) {
  const title = val(f, "title");
  const destinationId = val(f, "destinationId");
  const notes = val(f, "notes");
  const category = val(f, "category");
  return run(({ db, owner }) => {
    createSaved(db, owner, { title, destinationId, category, notes });
    return "Saved tip to your inspiration.";
  }, ["/saved", "/community", "/my-voyage"]);
}
