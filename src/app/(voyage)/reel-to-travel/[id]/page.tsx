import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addCaptureToTripAction, addManualCandidateAction, deleteCaptureAction,
} from "../../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import { CandidateReview } from "@/components/voyage/CandidateReview";
import { CATEGORY_LABEL, Card, Field, PlatformBadge, inputClass } from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { currentOwner } from "@/lib/voyage/owner";
import { listDestinations } from "@/lib/voyage/places";
import { getCapture } from "@/lib/voyage/reel";
import { listCollections } from "@/lib/voyage/saved";
import { listTrips } from "@/lib/voyage/trips";
import { CATEGORIES } from "@/lib/voyage/validate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Places found · Reel-to-Travel" };

const STATUS: Record<string, { label: string; chip: string; icon: string }> = {
  retrieved: { label: "Read successfully", chip: "bg-emerald-100 text-emerald-900 ring-emerald-300", icon: "✅" },
  partial: { label: "Partly read", chip: "bg-amber-100 text-amber-900 ring-amber-300", icon: "◐" },
  blocked: { label: "Blocked by the platform", chip: "bg-rose-100 text-rose-900 ring-rose-300", icon: "🚫" },
  unavailable: { label: "Could not be read", chip: "bg-rose-100 text-rose-900 ring-rose-300", icon: "⚠️" },
  skipped: { label: "Text only", chip: "bg-slate-100 text-slate-800 ring-slate-300", icon: "📝" },
};

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const owner = await currentOwner();
  const db = getDb();
  const cap = owner && Number.isSafeInteger(id) ? getCapture(db, owner, id) : null;
  if (!owner || !cap) notFound(); // someone else's capture looks exactly like a missing one

  const destinations = listDestinations(db).map((d) => ({ id: d.id, label: d.name + ", " + d.country }));
  const categories = CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABEL[c] }));
  const collections = listCollections(db, owner).map((c) => ({ id: String(c.id), label: c.name + " (" + c.itemCount + ")" }));
  const trips = listTrips(db, owner);

  const st = STATUS[cap.fetchStatus];
  const suggested = cap.candidates.filter((c) => c.status === "suggested");
  const confirmed = cap.candidates.filter((c) => c.status === "confirmed");
  const planned = confirmed.filter((c) => c.saved && c.saved.plannedIn.length > 0).length;
  const stepNow = confirmed.length === 0 ? 3 : planned < confirmed.length ? 5 : 5;
  const tripsForDest = cap.destinationId ? trips.filter((t) => t.destinationId === cap.destinationId) : trips;
  const noText = !cap.title && !cap.description && !cap.pastedCaption;

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb">
        <Link href="/reel-to-travel" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#163d46] hover:underline">← Reel-to-Travel</Link>
      </nav>

      {/* Source card */}
      <section className="overflow-hidden rounded-3xl border border-[#163d46]/15 bg-white shadow-sm md:grid md:grid-cols-[260px_1fr]">
        {cap.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cap.thumbnailUrl} alt="Preview image from the original post" width={520} height={390} referrerPolicy="no-referrer" className="h-48 w-full object-cover md:h-full" />
        ) : (
          <div aria-hidden className="flex h-32 items-center justify-center bg-gradient-to-br from-[#163d46] to-[#2a6670] text-5xl md:h-full">🎞️</div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge platform={cap.platform} />
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${st.chip}`}><span aria-hidden>{st.icon}</span>{st.label}</span>
            {cap.destinationName && <span className="rounded-full bg-[#f5d9bd]/50 px-2.5 py-0.5 text-xs font-semibold text-[#8a4a38]">{cap.destinationName}</span>}
          </div>
          <h1 className="editorial-title mt-3 text-2xl font-extrabold text-[#163d46] sm:text-3xl">{cap.title ?? (cap.pastedCaption ? "Your pasted caption" : "Captured link")}</h1>
          {cap.author && <p className="mt-1 text-sm text-[#566468]">By {cap.author}</p>}
          {cap.url && /^https?:\/\//.test(cap.url) && (
            <p className="mt-1 break-all text-sm">
              <a href={cap.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center font-semibold text-[#163d46] underline">Open the original ↗</a>
            </p>
          )}
          {cap.fetchReason && (
            <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{cap.fetchReason}</p>
          )}
          {cap.description && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-[#243238]">{cap.description}</p>}
          {cap.pastedCaption && (
            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[#163d46]">The caption you pasted</summary>
              <p className="whitespace-pre-wrap rounded-xl bg-[#f8f5ef] p-3 text-[#243238]">{cap.pastedCaption}</p>
            </details>
          )}
        </div>
      </section>

      {/* Progress */}
      <p className="text-sm font-semibold text-[#163d46]" aria-live="polite">
        Step {stepNow} of 5 ·{" "}
        {confirmed.length === 0 ? "Confirm the places you want" : planned < confirmed.length ? `${planned} of ${confirmed.length} saved places are on a trip. Plan the rest below.` : "Everything you saved is planned."}
      </p>

      {/* Places found */}
      <section aria-labelledby="found" className="space-y-4">
        <div>
          <h2 id="found" className="editorial-title text-2xl font-bold text-[#163d46]">
            {suggested.length > 0 ? `${suggested.length} place${suggested.length === 1 ? "" : "s"} to check` : "Places"}
          </h2>
          <p className="mt-1 text-sm text-[#566468]">
            Each card shows where in the text we found the name. High-confidence matches are ticked for you; low-confidence guesses are not. Nothing is saved until you press Save.
          </p>
        </div>

        {suggested.length === 0 && confirmed.length === 0 && (
          <Card>
            <h3 className="font-bold text-[#243238]">{noText ? "We could not read anything from this link" : "No place names were recognised"}</h3>
            <p className="mt-1 text-sm text-[#566468]">
              {noText ? "Paste the caption or describe the places below, or try the link again later." : "Add them by hand below, or analyse a fuller caption."}
            </p>
          </Card>
        )}

        <CandidateReview
          captureId={cap.id}
          candidates={cap.candidates}
          destinations={destinations}
          categories={categories}
          collections={collections}
          defaultDestination={cap.destinationId}
        />

        <details className="rounded-2xl border border-[#163d46]/15 bg-white" open={suggested.length === 0 && confirmed.length === 0}>
          <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-bold text-[#163d46]">➕ Add a place we missed</summary>
          <div className="border-t border-[#163d46]/10 p-4">
            <ActionForm action={addManualCandidateAction} submitLabel="Add to the list" resetOnSuccess>
              <input type="hidden" name="captureId" value={cap.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Place name" className="sm:col-span-3"><input name="name" required maxLength={120} className={inputClass} /></Field>
                <Field label="Category">
                  <select name="category" defaultValue="other" className={inputClass}>{categories.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                </Field>
                <Field label="Destination">
                  <select name="destinationId" defaultValue={cap.destinationId ?? ""} className={inputClass}>
                    <option value="">Not sure yet</option>
                    {destinations.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
            </ActionForm>
          </div>
        </details>
      </section>

      {/* Saved places and the way into a trip */}
      {confirmed.length > 0 && (
        <section aria-labelledby="saved" className="space-y-4">
          <h2 id="saved" className="editorial-title text-2xl font-bold text-[#163d46]">Saved from this capture</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {confirmed.map((c) => (
              <li key={c.id} className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
                <p className="font-bold text-[#243238]">{c.saved?.title ?? c.name}</p>
                <p className="text-xs text-[#566468]">{CATEGORY_LABEL[c.category]}{c.destinationName ? " · " + c.destinationName : ""}{c.saved?.collectionName ? " · 📁 " + c.saved.collectionName : ""}</p>
                {c.saved && c.saved.plannedIn.length > 0 ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-800">✓ Planned: {c.saved.plannedIn.map((p) => p.tripName + ", day " + p.day).join("; ")}</p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-[#8a4a38]">Not planned yet</p>
                )}
                {c.saved && <Link href={"/saved/" + c.saved.id} className="mt-1 inline-flex min-h-10 items-center text-xs font-semibold text-[#163d46] underline">Edit details</Link>}
              </li>
            ))}
          </ul>

          <Card>
            <h3 className="editorial-title text-xl font-bold text-[#163d46]">Plan these places</h3>
            <p className="mt-1 text-sm text-[#566468]">Places already on the chosen trip are skipped, never added twice.</p>
            <ActionForm action={addCaptureToTripAction} submitLabel="Add to trip" className="mt-4">
              <input type="hidden" name="captureId" value={cap.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Trip">
                  <select name="tripId" defaultValue={tripsForDest[0] ? String(tripsForDest[0].id) : "new"} className={inputClass}>
                    {tripsForDest.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.days} days)</option>)}
                    <option value="new">➕ A new trip…</option>
                  </select>
                </Field>
                <Field label="Day (existing trip)" hint="Day 1 is used for a new trip.">
                  <input name="day" type="number" min={1} max={60} defaultValue={1} inputMode="numeric" className={inputClass} />
                </Field>
              </div>
              <details className="rounded-xl border border-[#163d46]/15 bg-[#f8f5ef]/60">
                <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-[#163d46]">Details for a new trip</summary>
                <div className="grid gap-3 border-t border-[#163d46]/10 p-3 sm:grid-cols-2">
                  <Field label="Trip name" className="sm:col-span-2"><input name="newTripName" maxLength={80} placeholder="e.g. Istanbul in autumn" className={inputClass} /></Field>
                  <Field label="Destination">
                    <select name="destinationId" defaultValue={cap.destinationId ?? ""} className={inputClass}>
                      <option value="" disabled>Choose</option>
                      {destinations.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Start date"><input name="startDate" type="date" className={inputClass} /></Field>
                  <Field label="End date"><input name="endDate" type="date" className={inputClass} /></Field>
                </div>
              </details>
            </ActionForm>
          </Card>
        </section>
      )}

      <section aria-label="Remove this capture">
        <ActionForm action={deleteCaptureAction} submitLabel="Delete this capture" tone="neutral" confirmText="Delete this capture? Places you already saved are kept.">
          <input type="hidden" name="captureId" value={cap.id} />
        </ActionForm>
      </section>
    </div>
  );
}
