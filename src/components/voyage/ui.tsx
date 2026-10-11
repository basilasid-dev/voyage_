// Presentational building blocks for the travel-planning pages. Server components: no client JavaScript here.
import Link from "next/link";
import { cloneElement, isValidElement, useId } from "react";
import { CURRENCIES } from "@/lib/voyage/content";
import type { Destination, Place } from "@/lib/voyage/places";
import type { Collection, SavedItem } from "@/lib/voyage/saved";
import type { Money, TripListItem } from "@/lib/voyage/trips";
import type { CommunityPost } from "@/lib/voyage/community";
import { CATEGORIES, PLATFORM_LABEL, formatDuration, formatMoney, formatRange } from "@/lib/voyage/validate";
import { ActionForm } from "./ActionForm";
import { addToTripAction, savePlaceAction, toggleHelpfulAction, reportCommunityPostAction, saveCommunityTipAction, deleteCommunityPostAction } from "@/app/(voyage)/actions";
import { SmartImage } from "./SmartImage";
import { PLACE_PHOTOS, DESTINATION_PHOTOS } from "@/lib/voyage/photography";

export const inputClass =
  "w-full min-h-11 rounded-xl border border-[#163d46]/20 bg-white px-3 py-2 text-base text-[#243238] outline-none transition focus:border-[#163d46] focus:ring-2 focus:ring-[#a8d9df]/50";

export const CATEGORY_LABEL: Record<string, string> = {
  landmark: "Landmark",
  food: "Food & Drinks",
  nature: "Nature",
  culture: "Culture & Heritage",
  shopping: "Shopping",
  stay: "Stay",
  other: "Other",
  transport: "Transport",
  entry: "Entry & Tickets",
};

const CATEGORY_ICON: Record<string, string> = {
  landmark: "🏛️",
  food: "🍽️",
  nature: "🌿",
  culture: "🎭",
  shopping: "🛍️",
  stay: "🛏️",
  other: "📍",
  transport: "🚌",
  entry: "🎟️",
};

/** Labelled form field with accessible hint binding */
export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  const hintId = `${useId()}-hint`;
  const control =
    hint && isValidElement(children) ? cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": hintId }) : children;
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-[#243238]">{label}</span>
        {control}
      </label>
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-[#566468]">
          {hint}
        </span>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#163d46]/10 bg-white p-5 shadow-sm transition hover:border-[#163d46]/20 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#a8d9df]/25 px-2.5 py-0.5 text-xs font-semibold text-[#163d46] ring-1 ring-[#163d46]/15">
      <span aria-hidden>{CATEGORY_ICON[category] ?? "📍"}</span>
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  if (platform === "manual") return null;

  let bgClass = "bg-[#f8f5ef] text-[#243238] ring-slate-300";
  let icon = "🔗";

  switch (platform) {
    case "instagram":
      bgClass = "bg-gradient-to-r from-purple-50 to-pink-50 text-pink-700 ring-pink-300/80";
      icon = "📸";
      break;
    case "pinterest":
      bgClass = "bg-rose-50 text-rose-700 ring-rose-300/80";
      icon = "📌";
      break;
    case "youtube":
      bgClass = "bg-red-50 text-red-700 ring-red-300/80";
      icon = "▶️";
      break;
    case "tiktok":
      bgClass = "bg-slate-900 text-white ring-slate-800";
      icon = "🎵";
      break;
    case "vimeo":
      bgClass = "bg-sky-50 text-sky-700 ring-sky-300/80";
      icon = "🎬";
      break;
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${bgClass}`}>
      <span aria-hidden>{icon}</span>
      {platformLabel(platform)}
    </span>
  );
}

/** Marks a figure as a rough planning estimate, never a quote */
export function EstimateBadge() {
  return (
    <span className="rounded bg-[#f5d9bd]/60 px-1.5 py-0.5 text-xs font-medium text-[#9a4a36] ring-1 ring-[#d98772]/30">
      Estimate
    </span>
  );
}

/** Overlap or heavy daily schedule alert badge */
export function ScheduleAlertBadge({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
      <span aria-hidden className="text-base">⚠️</span>
      <span>{message}</span>
    </div>
  );
}

/** "€55.50 + ₺5,500": totals per currency, never converted into one another */
export function MoneyTotals({ totals, empty = "—" }: { totals: Money; empty?: string }) {
  const entries = Object.entries(totals).filter(([, c]) => c > 0);
  if (entries.length === 0) return <>{empty}</>;
  return <>{entries.map(([cur, cents]) => formatMoney(cents, cur)).join(" + ")}</>;
}

export function PlaceImage({
  src,
  alt,
  className = "h-44",
  placeId,
  destinationId,
}: {
  src: string;
  alt: string;
  className?: string;
  placeId?: string;
  destinationId?: string;
}) {
  // Check photographic mapping first
  const photo = placeId ? PLACE_PHOTOS[placeId] : destinationId ? DESTINATION_PHOTOS[destinationId] : null;
  const imageSrc = photo ? photo.src : src;
  const imageAlt = photo ? photo.alt : alt;

  return (
    <div className={`relative overflow-hidden bg-[#e4f4f7]/40 ${className}`}>
      <SmartImage
        src={imageSrc}
        fallbackSrc={src}
        alt={imageAlt}
        fallbackAlt={alt}
        credit={photo ? "Photo: Unsplash" : undefined}
      />
    </div>
  );
}

export function DestinationCard({ d }: { d: Destination }) {
  const photo = DESTINATION_PHOTOS[d.id];
  return (
    <Link
      href={`/explore/${d.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-[#163d46]/15 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#163d46]/30"
    >
      <div className="relative h-60 w-full overflow-hidden bg-[#e4f4f7]/30 sm:h-72">
        <PlaceImage src={d.image} alt={d.imageAlt} destinationId={d.id} className="h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#163d46]/80 via-transparent to-black/20" />
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
            {d.country}
          </span>
          <h2 className="editorial-title mt-2 text-2xl font-bold tracking-tight text-white drop-shadow sm:text-3xl">
            {d.name}
          </h2>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
        <p className="line-clamp-3 text-sm leading-relaxed text-[#243238]">{d.summary}</p>
        <div className="mt-4 flex items-center justify-between border-t border-[#163d46]/10 pt-3 text-sm">
          <span className="font-semibold text-[#163d46]">{d.placeCount} curated places</span>
          <span className="font-semibold text-[#9a4a36] group-hover:underline">Explore guide →</span>
        </div>
      </div>
    </Link>
  );
}

export function PlaceCard({ p, saved }: { p: Place; saved: boolean }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[#163d46]/10 bg-white shadow-sm transition duration-200 hover:border-[#163d46]/25 hover:shadow-md">
      <Link href={`/explore/${p.destinationId}/${p.id}`} className="block overflow-hidden">
        <PlaceImage src={p.image} alt={p.imageAlt} placeId={p.id} className="h-44 sm:h-48" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={p.category} />
          <span className="text-xs font-medium text-[#566468]">{p.area}</span>
        </div>
        <h3 className="editorial-title text-lg font-bold leading-snug text-[#243238]">
          <Link href={`/explore/${p.destinationId}/${p.id}`} className="transition hover:text-[#163d46] hover:underline">
            {p.name}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-[#566468]">{p.description}</p>
        <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#163d46]/10 pt-3 text-xs text-[#243238]">
          <div className="flex items-center gap-1">
            <dt className="sr-only">Estimated visit time</dt>
            <dd>⏱ {formatDuration(p.durationMin)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Estimated cost</dt>
            <dd>{formatRange(p.costMinCents, p.costMaxCents, p.currency)}</dd>
            <EstimateBadge />
          </div>
        </dl>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Link
            href={`/explore/${p.destinationId}/${p.id}`}
            className="inline-flex min-h-11 items-center text-xs font-bold text-[#163d46] hover:underline"
          >
            Full details →
          </Link>
          {saved ? (
            <span className="inline-flex min-h-11 items-center text-xs font-bold text-[#163d46]">✓ Saved</span>
          ) : (
            <ActionForm action={savePlaceAction} submitLabel="☆ Save" tone="neutral" compact ariaLabel={`Save ${p.name}`}>
              <input type="hidden" name="placeId" value={p.id} />
            </ActionForm>
          )}
        </div>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ saved item form fields

export function SavedFields({
  destinations,
  collections,
  item,
}: {
  destinations: Destination[];
  collections: Collection[];
  item?: SavedItem;
}) {
  const cost = item?.costCents != null ? String(item.costCents / 100) : "";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label="Link (Instagram Reel, Pinterest, YouTube, TikTok or travel web page)"
        hint="Paste a link. Platform is recognized automatically."
        className="sm:col-span-2"
      >
        <input
          name="url"
          type="url"
          inputMode="url"
          maxLength={2000}
          defaultValue={item?.url ?? ""}
          placeholder="https://www.instagram.com/reel/… or https://www.pinterest.com/pin/…"
          className={inputClass}
        />
      </Field>
      <Field label="Place name or Title" hint="Required unless you paste a link." className="sm:col-span-2">
        <input name="title" maxLength={120} defaultValue={item?.title ?? ""} placeholder="e.g. Sunset point on Beach Road" className={inputClass} />
      </Field>
      <Field label="Destination">
        <select name="destinationId" defaultValue={item?.destinationId ?? ""} className={inputClass}>
          <option value="">Any / Not decided yet</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}, {d.country}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Collection">
        <select name="collectionId" defaultValue={item?.collectionId ?? ""} className={inputClass}>
          <option value="">No collection (General ideas)</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={item?.category ?? "other"} className={inputClass}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location or neighborhood">
        <input name="location" maxLength={160} defaultValue={item?.location ?? ""} placeholder="e.g. Beach Road or Karaköy" className={inputClass} />
      </Field>
      <Field label="Estimated visit time (minutes)">
        <input name="durationMin" type="number" min={1} max={1440} step={1} inputMode="numeric" defaultValue={item?.durationMin ?? ""} placeholder="e.g. 60" className={inputClass} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-2">
        <Field label="Estimated cost">
          <input name="cost" inputMode="decimal" defaultValue={cost} placeholder="e.g. 250" className={inputClass} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={item?.currency ?? ""} className={inputClass}>
            <option value="">Auto</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags" hint="Up to 6, separated by commas, e.g. sunset, street food" className="sm:col-span-2">
        <input name="tags" maxLength={200} defaultValue={item?.tags?.join(", ") ?? ""} placeholder="sunset, street food" className={inputClass} />
      </Field>
      <Field label="Personal notes" hint="Tips, what caught your eye, the best dish to try." className="sm:col-span-2">
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={item?.notes ?? ""} className={inputClass} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ add to trip

/** One small form per trip: choose the day, press Add. */
export function AddToTrip({ trips, source }: { trips: TripListItem[]; source: { savedId: number } | { placeId: string } }) {
  if (trips.length === 0) return null;
  return (
    <ul className="space-y-2">
      {trips.map((t) => (
        <li key={t.id} className="rounded-xl border border-[#163d46]/10 bg-white p-3 shadow-xs">
          <ActionForm action={addToTripAction} submitLabel="Add to itinerary" tone="neutral" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tripId" value={t.id} />
            {"savedId" in source ? <input type="hidden" name="savedId" value={source.savedId} /> : <input type="hidden" name="placeId" value={source.placeId} />}
            <div className="min-w-0 flex-1 basis-40">
              <div className="truncate text-sm font-bold text-[#243238]">{t.name}</div>
              <div className="text-xs text-[#566468]">
                {t.startDate} → {t.endDate} ({t.days} days)
              </div>
            </div>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-[#243238]">Target Day</span>
              <select name="day" className={`${inputClass} w-28`}>
                {Array.from({ length: t.days }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Day {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ Community post card

const fmtVisit = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** A real traveller's contribution. Always shown as unverified: nothing here can prove a visit happened. */
export function CommunityPostCard({ post, trips = [] }: { post: CommunityPost; trips?: TripListItem[] }) {
  const relevantTrips = trips.filter((t) => t.destinationId === post.destinationId);
  return (
    <article className="rounded-2xl border border-[#163d46]/10 bg-white p-5 shadow-xs transition hover:border-[#163d46]/20 hover:shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#163d46]/10 pb-3">
        <div className="flex items-center gap-2">
          <div aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[#163d46] text-xs font-bold text-white">
            {post.authorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-sm font-bold text-[#243238]">{post.authorName}</span>
            <span className="ml-2 text-xs text-[#566468]">
              <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#f5d9bd]/40 px-2.5 py-0.5 text-xs font-semibold text-[#8a4a38]">{post.destinationName}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-[#566468]" title="Nothing in this app can confirm that the author really visited.">
            Unverified traveller contribution
          </span>
        </div>
      </div>

      <div className="mt-3">
        {post.placeName && (
          <p className="text-xs font-semibold text-[#163d46]">
            <span aria-hidden>📍 </span>About:{" "}
            <Link href={"/explore/" + post.destinationId + "/" + post.placeId} className="underline">
              {post.placeName}
            </Link>
          </p>
        )}
        <h3 className="editorial-title mt-1 text-lg font-bold text-[#243238]">{post.title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#243238]">{post.content}</p>
        {(post.visitDate || post.spendCents !== null || post.timeNeededMin || post.bestTime) && (
          <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-xl bg-[#f8f5ef] p-3 text-xs text-[#243238] sm:grid-cols-2">
            {post.visitDate && (<><dt className="font-semibold">Visited</dt><dd>{fmtVisit(post.visitDate)}</dd></>)}
            {post.spendCents !== null && post.currency && (<><dt className="font-semibold">Spent (per person, approx.)</dt><dd>{formatMoney(post.spendCents, post.currency)}</dd></>)}
            {post.timeNeededMin ? (<><dt className="font-semibold">Time needed</dt><dd>{formatDuration(post.timeNeededMin)}</dd></>) : null}
            {post.bestTime && (<><dt className="font-semibold">Best time to go</dt><dd>{post.bestTime}</dd></>)}
          </dl>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#163d46]/10 pt-3">
        {post.mine ? (
          <span className="inline-flex min-h-11 items-center text-xs font-semibold text-[#163d46]">
            {post.helpfulCount} {post.helpfulCount === 1 ? "traveller finds" : "travellers find"} this helpful
          </span>
        ) : (
          <ActionForm action={toggleHelpfulAction} submitLabel={(post.votedByMe ? "✓ Helpful" : "👍 Helpful") + " (" + post.helpfulCount + ")"} tone="neutral" compact ariaLabel={post.votedByMe ? "Remove your helpful mark" : "Mark as helpful"}>
            <input type="hidden" name="id" value={post.id} />
          </ActionForm>
        )}
        <ActionForm action={saveCommunityTipAction} submitLabel="☆ Save to inspiration" tone="neutral" compact ariaLabel={"Save tip " + post.title}>
          <input type="hidden" name="title" value={post.title} />
          <input type="hidden" name="destinationId" value={post.destinationId} />
          <input type="hidden" name="category" value={post.category === "food" ? "food" : "other"} />
          <input type="hidden" name="notes" value={post.content + "\n\nShared by " + post.authorName + " (unverified traveller contribution)"} />
        </ActionForm>
        {post.mine && (
          <ActionForm action={deleteCommunityPostAction} submitLabel="🗑 Delete mine" tone="neutral" compact confirmText="Delete your contribution?" ariaLabel={"Delete your contribution " + post.title}>
            <input type="hidden" name="id" value={post.id} />
          </ActionForm>
        )}
      </div>

      {!post.mine && (
        <details className="mt-2 rounded-xl border border-[#163d46]/10">
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold text-[#566468]">Report this contribution</summary>
          <div className="border-t border-[#163d46]/10 p-3">
            <ActionForm action={reportCommunityPostAction} submitLabel="Send report" tone="neutral" resetOnSuccess>
              <input type="hidden" name="postId" value={post.id} />
              <Field label="What is wrong?">
                <select name="reason" className={inputClass}>
                  <option value="spam">Spam or advertising</option>
                  <option value="inaccurate">Inaccurate or misleading</option>
                  <option value="inappropriate">Inappropriate language</option>
                  <option value="other">Something else</option>
                </select>
              </Field>
              <Field label="Details (optional)">
                <input name="details" maxLength={500} className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </details>
      )}

      {relevantTrips.length > 0 && (
        <p className="mt-2 text-xs text-[#566468]">Tip: save it to your inspiration, then add it to a day from your Saved page.</p>
      )}
    </article>
  );
}

export const platformLabel = (p: string) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p;
