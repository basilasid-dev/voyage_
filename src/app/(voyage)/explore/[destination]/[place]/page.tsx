import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { savePlaceAction } from "../../../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import { AddToTrip, Card, CategoryBadge, EstimateBadge, PlaceImage, CommunityPostCard } from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { ESTIMATE_DISCLAIMER } from "@/lib/voyage/content";
import { currentOwner } from "@/lib/voyage/owner";
import { getDestination, getPlace } from "@/lib/voyage/places";
import { savedPlaceIds } from "@/lib/voyage/saved";
import { listTrips } from "@/lib/voyage/trips";
import { listCommunityPosts } from "@/lib/voyage/community";
import { formatDuration, formatRange } from "@/lib/voyage/validate";
import { PLACE_PHOTOS } from "@/lib/voyage/photography";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ destination: string; place: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = getPlace(getDb(), (await params).place);
  return {
    title: p ? `${p.name} · VOYAGE Place Guide` : "Place",
    description: p ? p.description : undefined,
  };
}

export default async function PlacePage({ params }: Props) {
  const { destination, place } = await params;
  const db = getDb();
  const p = getPlace(db, place);
  const d = getDestination(db, destination);
  if (!p || !d || p.destinationId !== d.id) notFound();

  const owner = await currentOwner();
  const saved = owner ? savedPlaceIds(db, owner).has(p.id) : false;
  const trips = owner ? listTrips(db, owner).filter((t) => t.destinationId === d.id) : [];
  const placeTips = listCommunityPosts(db, { placeId: p.id });
  const photo = PLACE_PHOTOS[p.id];

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <Link
          href={`/explore/${d.id}`}
          className="inline-flex min-h-10 items-center text-xs font-semibold text-[#163d46] hover:underline"
        >
          ← Back to {d.name} Guide
        </Link>
      </nav>

      {/* Main Place Feature Card */}
      <article className="overflow-hidden rounded-3xl border border-[#163d46]/15 bg-white shadow-md lg:grid lg:grid-cols-[1.2fr_1fr]">
        <figure className="relative h-72 sm:h-96 lg:h-full overflow-hidden bg-[#e4f4f7]/30">
          <PlaceImage src={p.image} alt={p.imageAlt} placeId={p.id} className="h-full w-full object-cover" />
          {photo?.caption && (
            <figcaption className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-md">
              {photo.caption}
            </figcaption>
          )}
        </figure>

        <div className="flex flex-col justify-between space-y-6 p-6 sm:p-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={p.category} />
              <span className="text-xs font-semibold text-[#566468]">
                {d.name}, {d.country}
              </span>
            </div>

            <h1 className="editorial-title text-3xl font-extrabold text-[#163d46] sm:text-4xl">
              {p.name}
            </h1>

            <p className="text-sm leading-relaxed text-[#243238]">
              {p.description}
            </p>

            <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-[#163d46]/10 bg-[#f8f5ef] p-4 text-xs sm:grid-cols-[8.5rem_1fr]">
              <dt className="font-bold text-[#163d46]">Location / Area</dt>
              <dd className="font-medium text-[#243238]">{p.area}</dd>

              <dt className="font-bold text-[#163d46]">Estimated Visit Time</dt>
              <dd className="flex items-center gap-1.5 text-[#243238]">
                <span>⏱ {formatDuration(p.durationMin)}</span>
                <EstimateBadge />
              </dd>

              <dt className="font-bold text-[#163d46]">Estimated Cost</dt>
              <dd className="text-[#243238]">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">{formatRange(p.costMinCents, p.costMaxCents, p.currency)}</span>
                  <EstimateBadge />
                </div>
                {p.costNote && <span className="mt-1 block text-[11px] text-[#566468]">{p.costNote}</span>}
              </dd>

              {p.notes && (
                <>
                  <dt className="font-bold text-[#163d46]">Practical Notes</dt>
                  <dd className="text-[#243238] leading-relaxed">{p.notes}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#163d46]/10 pt-4">
            {saved ? (
              <span className="inline-flex min-h-11 items-center rounded-xl bg-[#a8d9df]/30 px-5 text-sm font-bold text-[#163d46]">
                ✓ Saved in your inspiration
              </span>
            ) : (
              <ActionForm action={savePlaceAction} submitLabel="☆ Save to inspiration">
                <input type="hidden" name="placeId" value={p.id} />
              </ActionForm>
            )}
            <Link
              href={`/trips?destination=${d.id}#new-trip`}
              className="inline-flex min-h-11 items-center rounded-xl border border-[#163d46]/20 bg-white px-4 text-xs font-semibold text-[#163d46] hover:bg-[#f8f5ef]"
            >
              + Create a new trip for this place
            </Link>
          </div>
        </div>
      </article>

      {/* Add To Trip Card */}
      <Card>
        <h2 className="editorial-title text-xl font-bold text-[#163d46]">Add {p.name} to a Planned Trip</h2>
        {trips.length > 0 ? (
          <div className="mt-4">
            <AddToTrip trips={trips} source={{ placeId: p.id }} />
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-[#163d46]/20 bg-[#f8f5ef] p-4 text-sm text-[#566468]">
            You have no planned trip to {d.name} yet.{" "}
            <Link href={`/trips?destination=${d.id}#new-trip`} className="font-bold text-[#163d46] underline">
              Create an itinerary now
            </Link>
            , then schedule this spot into one of your days.
          </div>
        )}
      </Card>

      {/* Community Tips & Reviews for this place */}
      {placeTips.length > 0 && (
        <section className="space-y-4">
          <h2 className="editorial-title text-xl font-bold text-[#163d46]">
            Traveller Tips for {p.name}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {placeTips.map((post) => (
              <CommunityPostCard key={post.id} post={post} trips={trips} />
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        <p>
          ⚠️ <strong>Estimates Disclaimer:</strong> {ESTIMATE_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
