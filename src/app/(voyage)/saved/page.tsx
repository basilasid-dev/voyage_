import type { Metadata } from "next";
import Link from "next/link";
import {
  createCollectionAction,
  createSavedAction,
  deleteCollectionAction,
  deleteSavedAction,
  moveSavedAction,
  renameCollectionAction,
} from "../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import {
  AddToTrip,
  CATEGORY_LABEL,
  Card,
  CategoryBadge,
  Field,
  SavedFields,
  inputClass,
  PlatformBadge,
  platformLabel,
} from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { currentOwner } from "@/lib/voyage/owner";
import { listDestinations } from "@/lib/voyage/places";
import { listCollections, listSaved, type SavedItem } from "@/lib/voyage/saved";
import { listTrips } from "@/lib/voyage/trips";
import { CATEGORIES, formatDuration, formatMoney } from "@/lib/voyage/validate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Saved Library · VOYAGE",
  description: "Your saved places and travel links, organised into collections, with what is already planned and what is not.",
};

type SP = Promise<Record<string, string | undefined>>;

function SavedCard({
  s,
  collections,
  trips,
}: {
  s: SavedItem;
  collections: { id: number; name: string }[];
  trips: Awaited<ReturnType<typeof listTrips>>;
}) {
  const relevantTrips = s.destinationId ? trips.filter((t) => t.destinationId === s.destinationId) : trips;

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-[#163d46]/15 bg-white p-5 shadow-xs transition hover:border-[#163d46]/30 hover:shadow-md">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={s.category} />
          <PlatformBadge platform={s.platform} />
          {s.destinationName && (
            <span className="rounded-full bg-[#f8f5ef] px-2.5 py-0.5 text-xs font-semibold text-[#163d46] ring-1 ring-[#163d46]/10">
              📍 {s.destinationName}
            </span>
          )}
          {s.collectionName && (
            <span className="rounded-full bg-[#f5d9bd]/40 px-2.5 py-0.5 text-xs font-semibold text-[#9a4a36] ring-1 ring-[#d98772]/20">
              📁 {s.collectionName}
            </span>
          )}
        </div>

        <h2 className="editorial-title mt-3 text-lg font-bold text-[#243238]">{s.title}</h2>

        {s.plannedIn.length > 0 ? (
          <p className="mt-1.5 text-xs font-semibold text-[#163d46]">
            <span aria-hidden>✓ </span>Planned:{" "}
            {s.plannedIn.map((p, i) => (
              <span key={p.tripId + "-" + p.day}>
                {i > 0 && ", "}
                <Link href={"/trips/" + p.tripId} className="underline">{p.tripName}, day {p.day}</Link>
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-1.5 text-xs font-medium text-[#8a4a38]">Not planned yet</p>
        )}
        {s.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
            {s.tags.map((t) => (
              <li key={t}>
                <Link href={"/saved?tag=" + encodeURIComponent(t)} className="inline-flex min-h-8 items-center rounded-full bg-[#e4f4f7] px-2.5 text-xs font-medium text-[#163d46] hover:underline">#{t}</Link>
              </li>
            ))}
          </ul>
        )}
        {s.captureId && (
          <p className="mt-1.5 text-xs text-[#566468]">
            From <Link href={"/reel-to-travel/" + s.captureId} className="font-semibold underline">a Reel-to-Travel capture</Link>
          </p>
        )}

        {s.url && /^https?:\/\//.test(s.url) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 break-all text-xs">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-10 items-center font-bold text-[#163d46] hover:text-[#9a4a36] underline"
            >
              Open original link ↗
            </a>
            <span className="text-[#566468]">({new URL(s.url).hostname})</span>
          </p>
        )}

        {s.location && <p className="mt-1 text-xs text-[#566468]">📍 {s.location}</p>}

        {s.notes && (
          <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-[#243238] bg-[#f8f5ef] p-3 rounded-xl border border-[#163d46]/10">
            {s.notes}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[#243238]">
          {s.durationMin && <span>⏱ Est. {formatDuration(s.durationMin)}</span>}
          {s.costCents !== null && s.currency && <span>💰 Est. {formatMoney(s.costCents, s.currency)}</span>}
        </div>
      </div>

      <div className="mt-4 border-t border-[#163d46]/10 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/saved/${s.id}`}
            className="inline-flex min-h-10 items-center rounded-xl border border-[#163d46]/20 bg-white px-3.5 text-xs font-semibold text-[#163d46] hover:bg-[#f8f5ef]"
          >
            ✏️ Edit
          </Link>
          <ActionForm
            action={deleteSavedAction}
            submitLabel="🗑 Delete"
            tone="neutral"
            compact
            confirmText={`Delete “${s.title}”? Trips that already use it keep their own copy.`}
            ariaLabel={`Delete ${s.title}`}
          >
            <input type="hidden" name="id" value={s.id} />
          </ActionForm>

          {collections.length > 0 && (
            <ActionForm action={moveSavedAction} submitLabel="Move" tone="neutral" compact className="flex items-center gap-2">
              <input type="hidden" name="id" value={s.id} />
              <label className="sr-only" htmlFor={`mv-${s.id}`}>
                Collection for {s.title}
              </label>
              <select id={`mv-${s.id}`} name="collectionId" defaultValue={s.collectionId ?? ""} className={`${inputClass} w-36 text-xs h-9`}>
                <option value="">No collection</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </ActionForm>
          )}
        </div>

        <details className="mt-3 rounded-xl border border-[#163d46]/10 bg-[#f8f5ef]/40">
          <summary className="min-h-10 cursor-pointer px-3 py-2 text-xs font-semibold text-[#163d46]">
            ➕ Add to an itinerary day
          </summary>
          <div className="border-t border-[#163d46]/10 p-3">
            {relevantTrips.length > 0 ? (
              <AddToTrip trips={relevantTrips} source={{ savedId: s.id }} />
            ) : (
              <p className="text-xs text-[#566468]">
                {s.destinationName ? `You have no trip to ${s.destinationName} yet. ` : "You have no trips yet. "}
                <Link href="/trips#new-trip" className="font-bold text-[#163d46] underline">
                  Create a trip
                </Link>
                .
              </p>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}

export default async function Saved({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const owner = await currentOwner();
  const destinations = listDestinations(db);
  const collections = owner ? listCollections(db, owner) : [];
  const trips = owner ? listTrips(db, owner) : [];

  const destFilter = destinations.some((d) => d.id === sp.destination) ? sp.destination : undefined;
  const catFilter = (CATEGORIES as readonly string[]).includes(sp.category ?? "") ? sp.category : undefined;
  const colRaw = sp.collection ?? "";
  const colFilter = colRaw === "none" ? ("none" as const) : collections.some((c) => String(c.id) === colRaw) ? Number(colRaw) : undefined;
  const q = (sp.q ?? "").slice(0, 80);
  const tagFilter = (sp.tag ?? "").slice(0, 24);
  const plannedFilter = sp.planned === "planned" || sp.planned === "unplanned" ? sp.planned : undefined;
  const items = owner
    ? listSaved(db, owner, { destinationId: destFilter, category: catFilter, collectionId: colFilter, q, tag: tagFilter, planned: plannedFilter })
    : [];
  const filtered = !!(destFilter || catFilter || colFilter !== undefined || q || tagFilter || plannedFilter);

  // If pre-filled URL passed (e.g. from homepage hero)
  const initialUrl = sp.url ?? "";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-[#163d46]/10 pb-6">
        <span className="text-xs font-bold uppercase tracking-widest text-[#8a4a38]">Your library</span>
        <h1 className="editorial-title mt-2 text-3xl font-extrabold text-[#163d46] sm:text-4xl">Saved places &amp; inspiration</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#566468]">
          Everything you have kept, with what is already on a trip and what is still waiting. Found a new Reel, pin or video?{" "}
          <Link href="/reel-to-travel" className="font-bold text-[#163d46] underline">Read it with Reel-to-Travel</Link> and it will find the places for you.
        </p>
      </div>

      {/* Save Something Form */}
      <Card>
        <details open={items.length === 0 || !!initialUrl}>
          <summary className="min-h-11 cursor-pointer editorial-title text-xl font-bold text-[#163d46]">
            ➕ Save a Reel, Pin or Discovery Link
          </summary>
          <div className="mt-4 border-t border-[#163d46]/10 pt-4">
            <ActionForm action={createSavedAction} submitLabel="Save Inspiration" resetOnSuccess>
              <SavedFields destinations={destinations} collections={collections} item={initialUrl ? { id: 0, title: "", url: initialUrl, platform: "manual", destinationId: null, destinationName: null, collectionId: null, collectionName: null, placeId: null, category: "other", location: null, notes: null, durationMin: null, costCents: null, currency: null, tags: [], captureId: null, plannedIn: [], createdAt: "", updatedAt: "" } : undefined} />
            </ActionForm>
          </div>
        </details>
      </Card>

      {/* Filter & Search Bar */}
      <form
        action="/saved"
        method="get"
        role="search"
        aria-label="Filter saved items"
        className="grid gap-3 rounded-2xl border border-[#163d46]/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end shadow-xs"
      >
        <Field label="Destination">
          <select name="destination" defaultValue={destFilter ?? ""} className={inputClass}>
            <option value="">All Destinations</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Collection">
          <select name="collection" defaultValue={colFilter === undefined ? "" : String(colFilter)} className={inputClass}>
            <option value="">All Collections</option>
            <option value="none">No collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.itemCount})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={catFilter ?? ""} className={inputClass}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trip status">
          <select name="planned" defaultValue={plannedFilter ?? ""} className={inputClass}>
            <option value="">All</option>
            <option value="unplanned">Not planned yet</option>
            <option value="planned">Already planned</option>
          </select>
        </Field>
        <Field label="Tag">
          <input name="tag" defaultValue={tagFilter} maxLength={24} placeholder="e.g. sunset" className={inputClass} />
        </Field>
        <Field label="Search Notes or Title">
          <input name="q" defaultValue={q} maxLength={80} placeholder="Search title, tags, or area" className={inputClass} />
        </Field>
        <div className="flex gap-2">
          <button className="min-h-11 rounded-xl bg-[#163d46] px-5 text-sm font-semibold text-white hover:bg-[#0f2a30]">
            Filter
          </button>
          {filtered && (
            <Link href="/saved" className="inline-flex min-h-11 items-center px-2 text-xs font-semibold text-[#163d46] underline">
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* Saved Items Grid / Empty State */}
      {items.length === 0 ? (
        <Card className="text-center py-12">
          <div aria-hidden className="text-4xl">📌</div>
          <h2 className="editorial-title mt-3 text-xl font-bold text-[#163d46]">
            {filtered ? "No saved items match these filters" : "Nothing saved yet"}
          </h2>
          <p className="mt-2 text-sm text-[#566468]">
            {filtered ? (
              "Try clearing your search query or collection filter."
            ) : (
              <>
                Paste an Instagram Reel, Pinterest pin, or YouTube URL above, or save places from{" "}
                <Link href="/explore" className="font-bold text-[#163d46] underline">
                  Explore Destinations
                </Link>
                .
              </>
            )}
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {items.map((s) => (
            <SavedCard key={s.id} s={s} collections={collections} trips={trips} />
          ))}
        </div>
      )}

      {/* Collections Manager */}
      <Card>
        <div className="border-b border-[#163d46]/10 pb-3">
          <h2 className="editorial-title text-xl font-bold text-[#163d46]">Collections</h2>
          <p className="mt-1 text-xs text-[#566468]">
            Group saved ideas into themes like &ldquo;Must-Try Street Food&rdquo;, &ldquo;Sunset Viewpoints&rdquo;, or &ldquo;Day Trips&rdquo;. Deleting a collection keeps its items safe.
          </p>
        </div>

        <ActionForm action={createCollectionAction} submitLabel="+ New Collection" resetOnSuccess className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Collection Name" className="min-w-0 flex-1 basis-56">
            <input name="name" required maxLength={40} placeholder="e.g. Seafood & Street Food" className={inputClass} />
          </Field>
        </ActionForm>

        {collections.length > 0 && (
          <ul className="mt-6 divide-y divide-[#163d46]/10">
            {collections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <ActionForm action={renameCollectionAction} submitLabel="Rename" tone="neutral" className="flex min-w-0 flex-1 basis-64 flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-semibold text-[#566468]">
                      📁 {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                    </span>
                    <input name="name" required maxLength={40} defaultValue={c.name} aria-label={`Name of collection ${c.name}`} className={`${inputClass} text-xs h-9`} />
                  </label>
                </ActionForm>
                <ActionForm
                  action={deleteCollectionAction}
                  submitLabel="Delete"
                  tone="neutral"
                  compact
                  confirmText={`Delete the collection “${c.name}”? Its ${c.itemCount} item(s) are kept safe in your general saved list.`}
                  ariaLabel={`Delete collection ${c.name}`}
                >
                  <input type="hidden" name="id" value={c.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
