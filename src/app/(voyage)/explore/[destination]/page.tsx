import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { ESTIMATE_DISCLAIMER } from "@/lib/voyage/content";
import { currentOwner } from "@/lib/voyage/owner";
import { getDestination, listPlaces } from "@/lib/voyage/places";
import { savedPlaceIds } from "@/lib/voyage/saved";
import { listCommunityPosts } from "@/lib/voyage/community";
import { listTrips } from "@/lib/voyage/trips";
import { CommunityPostCard, PlaceCard, PlaceImage } from "@/components/voyage/ui";
import { DESTINATION_PHOTOS } from "@/lib/voyage/photography";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ destination: string }>; searchParams: Promise<{ show?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = getDestination(getDb(), (await params).destination);
  return {
    title: d ? `${d.name}, ${d.country} · VOYAGE Destination Guide` : "Destination",
    description: d ? d.summary : undefined,
  };
}

const TABS = [
  ["all", "All Experiences"],
  ["landmarks", "Landmarks & Culture"],
  ["food", "Food & Dining"],
] as const;

export default async function DestinationPage({ params, searchParams }: Props) {
  const { destination } = await params;
  const db = getDb();
  const d = getDestination(db, destination);
  if (!d) notFound();

  const show = (await searchParams).show;
  const group = show === "landmarks" || show === "food" ? show : "all";
  const places = listPlaces(db, d.id, group);
  const foodPlaces = listPlaces(db, d.id, "food");
  const landmarkPlaces = listPlaces(db, d.id, "landmarks");

  const owner = await currentOwner();
  const saved = owner ? savedPlaceIds(db, owner) : new Set<string>();
  const trips = owner ? listTrips(db, owner) : [];
  const communityTips = listCommunityPosts(db, { destinationId: d.id });
  const photo = DESTINATION_PHOTOS[d.id];

  const isKozhikode = d.id === "kozhikode";

  return (
    <div className="space-y-12">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="text-xs">
        <Link href="/explore" className="inline-flex min-h-10 items-center font-semibold text-[#163d46] hover:underline">
          ← All Destinations
        </Link>
      </nav>

      {/* Cinematic Full-Width Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-[#163d46]/15 bg-[#163d46] text-white shadow-xl">
        <div className="relative h-96 w-full sm:h-[480px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo?.src ?? d.image}
            alt={photo?.alt ?? d.imageAlt}
            className="h-full w-full object-cover brightness-75 transition duration-700 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f2a30] via-[#163d46]/40 to-black/30" />
          <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
            <span className="rounded-full bg-white/20 px-3.5 py-1 text-xs font-semibold backdrop-blur-md text-white">
              {d.country} · Curated Guide
            </span>
          </div>
          <div className="absolute bottom-6 left-6 right-6 sm:bottom-10 sm:left-10 max-w-3xl">
            <h1 className="editorial-title text-4xl font-extrabold tracking-tight sm:text-6xl text-white drop-shadow-md">
              {d.name}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#f8f5ef]/90 sm:text-lg max-w-2xl">
              {d.summary}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/trips?destination=${d.id}#new-trip`}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#d98772] px-5 text-sm font-bold text-white shadow-md transition hover:bg-[#b8624d]"
              >
                Plan a Trip to {d.name} →
              </Link>
              <Link
                href="#places-grid"
                className="inline-flex min-h-11 items-center rounded-xl border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
              >
                Browse {d.placeCount} Curated Places
              </Link>
              {isKozhikode && (
                <Link
                  href="/bus-guide"
                  className="inline-flex min-h-11 items-center rounded-xl bg-white/15 px-4 text-xs font-semibold text-[#a8d9df] backdrop-blur-md hover:bg-white/25"
                >
                  🚌 Local Bus Route Guide
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Character & Identity Callout */}
      <section className="rounded-2xl border border-[#163d46]/10 bg-white p-6 sm:p-8 shadow-xs">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Atmosphere &amp; Vibe</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#243238]">
              {isKozhikode
                ? "Warm coastal golden light, rhythmic Arabian Sea breakers, coconut palm groves, and rich heritage streets perfumed by roasting spices."
                : "Atmospheric golden-hour reflections off the Bosphorus, historic stone domes, lively ferry whistles, and Ottoman street tea gardens."}
            </p>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Culinary Heritage</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#243238]">
              {isKozhikode
                ? "World-renowned Malabar Dum Biryani, pure coconut oil Kozhikode halwa, banana chips, fresh kallummakkaya seafood, and spiced Sulaimani."
                : "Layered pistachio baklava, crisp Eminönü balık ekmek fish rolls, slow-brewed Turkish coffee, simit bagels, and regional Anatolian mezes."}
            </p>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Planning Essentials</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#243238]">
              {isKozhikode
                ? "Currency: INR (₹). Evening beach visits around 5 PM are peak social hours. Auto-rickshaws and private buses are fast and frequent."
                : "Currency: EUR (€) indicative estimates due to fluctuating lira. Ferries are the most scenic public transit. Modest attire requested in working mosques."}
            </p>
          </div>
        </div>
      </section>

      {/* Curated Places Section */}
      <section id="places-grid" className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#163d46]/10 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#d98772]">Explore the Directory</span>
            <h2 className="editorial-title text-2xl font-bold text-[#163d46] sm:text-3xl">Curated Places</h2>
          </div>

          {/* Filter Tabs */}
          <nav aria-label="Filter places" className="flex flex-wrap gap-1.5 rounded-xl bg-[#e4f4f7]/40 p-1">
            {TABS.map(([key, label]) => (
              <Link
                key={key}
                href={key === "all" ? `/explore/${d.id}#places-grid` : `/explore/${d.id}?show=${key}#places-grid`}
                aria-current={group === key ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-lg px-4 text-xs font-semibold transition ${
                  group === key ? "bg-[#163d46] text-white shadow-xs" : "text-[#163d46] hover:bg-white/60"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Places Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((p) => (
            <PlaceCard key={p.id} p={p} saved={saved.has(p.id)} />
          ))}
        </div>
      </section>

      {/* Food & Culture Spotlight Section */}
      <section className="rounded-3xl border border-[#163d46]/15 bg-gradient-to-br from-[#fbf3ea] to-[#f8f5ef] p-6 sm:p-10 shadow-xs">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#d98772]">Culinary Spotlight</span>
            <h2 className="editorial-title text-2xl font-bold text-[#163d46]">Food &amp; Dining Culture</h2>
          </div>
          <Link href={`/explore/${d.id}?show=food`} className="text-xs font-semibold text-[#163d46] hover:underline">
            View all {foodPlaces.length} food places →
          </Link>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {foodPlaces.slice(0, 3).map((p) => (
            <PlaceCard key={p.id} p={p} saved={saved.has(p.id)} />
          ))}
        </div>
      </section>

      {/* Community Tips for this destination */}
      {communityTips.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#d98772]">Traveller Field Notes</span>
              <h2 className="editorial-title text-2xl font-bold text-[#163d46]">Community Tips for {d.name}</h2>
            </div>
            <Link href="/community" className="text-xs font-semibold text-[#163d46] hover:underline">
              Add your tip →
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {communityTips.slice(0, 4).map((post) => (
              <CommunityPostCard key={post.id} post={post} trips={trips} />
            ))}
          </div>
        </section>
      )}

      {/* Planning Notice */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        <p>
          ⚠️ <strong>Estimates Disclaimer:</strong> {ESTIMATE_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
