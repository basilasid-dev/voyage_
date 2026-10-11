import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/connection";
import { currentOwner } from "@/lib/voyage/owner";
import { listCollections, listSaved } from "@/lib/voyage/saved";
import { getTrip, listTrips, type Money } from "@/lib/voyage/trips";
import { listCommunityPosts } from "@/lib/voyage/community";
import { Card, CategoryBadge, PlatformBadge, MoneyTotals, CommunityPostCard } from "@/components/voyage/ui";
import { formatDuration, formatMoney } from "@/lib/voyage/validate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Voyage · Personal Travel Dashboard",
  description: "View your saved Reels, curated collections, planned itineraries, and estimated trip expenses all in one place.",
};

export default async function MyVoyagePage() {
  const db = getDb();
  const owner = await currentOwner();

  const savedItems = owner ? listSaved(db, owner) : [];
  const collections = owner ? listCollections(db, owner) : [];
  const trips = owner ? listTrips(db, owner) : [];
  const communityRecs = listCommunityPosts(db).slice(0, 3);

  // Compute total expenses aggregated across all trips
  const overallTotals: Money = {};
  if (owner && trips.length > 0) {
    for (const t of trips) {
      const detail = getTrip(db, owner, t.id);
      if (detail?.totals) {
        for (const [curr, cents] of Object.entries(detail.totals.combined)) {
          overallTotals[curr] = (overallTotals[curr] ?? 0) + cents;
        }
      }
    }
  }

  // Filter recently saved curated places vs general links
  const recentlySavedPlaces = savedItems.filter((s) => s.placeId !== null).slice(0, 4);

  return (
    <div className="space-y-10">
      {/* Editorial Dashboard Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#163d46]/10 pb-6 sm:flex-row sm:items-end">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#9a4a36]">Personal Travel HQ</span>
          <h1 className="editorial-title mt-1 text-3xl font-extrabold text-[#163d46] sm:text-4xl">
            My Voyage Dashboard
          </h1>
          <p className="mt-2 text-sm text-[#566468]">
            Your central travel companion: organize inspirations, track itineraries, and manage budgets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/reel-to-travel"
            className="inline-flex min-h-10 items-center rounded-xl bg-[#a8503a] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#8a4230]"
          >
            + Save New Reel / Idea
          </Link>
          <Link
            href="/trips#new-trip"
            className="inline-flex min-h-10 items-center rounded-xl bg-[#163d46] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#0f2a30]"
          >
            + Plan New Trip
          </Link>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#566468]">Saved Inspirations</span>
          <p className="editorial-title mt-1 text-2xl font-bold text-[#163d46]">{savedItems.length}</p>
        </div>
        <div className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#566468]">Collections</span>
          <p className="editorial-title mt-1 text-2xl font-bold text-[#163d46]">{collections.length}</p>
        </div>
        <div className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#566468]">Planned Journeys</span>
          <p className="editorial-title mt-1 text-2xl font-bold text-[#163d46]">{trips.length}</p>
        </div>
        <div className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-[#566468]">Estimated Budget</span>
          <p className="editorial-title mt-1 text-xl font-bold text-[#9a4a36]">
            <MoneyTotals totals={overallTotals} empty="0" />
          </p>
        </div>
      </div>

      {/* Section 1 & 2: Planned Trips & Expense Overview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#9a4a36]">Itineraries</span>
            <h2 className="editorial-title text-2xl font-bold text-[#163d46]">My Planned Trips</h2>
          </div>
          <Link href="/trips" className="text-xs font-semibold text-[#163d46] hover:underline">
            View all trips →
          </Link>
        </div>

        {trips.length === 0 ? (
          <Card className="text-center py-10">
            <span className="text-3xl">🗺️</span>
            <h3 className="editorial-title mt-2 text-lg font-bold text-[#163d46]">No journeys planned yet</h3>
            <p className="mt-1 text-xs text-[#566468]">
              Start exploring Kozhikode or Istanbul and craft your first day-by-day itinerary.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href="/explore"
                className="inline-flex min-h-10 items-center rounded-xl bg-[#163d46] px-4 text-xs font-semibold text-white hover:bg-[#0f2a30]"
              >
                Explore Destinations
              </Link>
              <Link
                href="/trips#new-trip"
                className="inline-flex min-h-10 items-center rounded-xl border border-[#163d46]/20 bg-white px-4 text-xs font-semibold text-[#163d46] hover:bg-[#f8f5ef]"
              >
                Create a Trip
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((t) => (
              <Link
                key={t.id}
                href={`/trips/${t.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-[#163d46]/15 bg-white p-5 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-[#163d46]/30 hover:shadow-md"
              >
                <div>
                  <span className="rounded-full bg-[#f8f5ef] px-2.5 py-0.5 text-[11px] font-bold text-[#163d46] ring-1 ring-[#163d46]/10">
                    {t.destinationName}
                  </span>
                  <h3 className="editorial-title mt-2 text-lg font-bold text-[#243238] group-hover:text-[#163d46]">
                    {t.name}
                  </h3>
                  <p className="mt-1 text-xs text-[#566468]">
                    📅 {t.startDate} → {t.endDate} ({t.days} day{t.days === 1 ? "" : "s"})
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#163d46]/10 pt-3 text-xs">
                  <span className="font-semibold text-[#163d46]">
                    {t.activityCount} planned place{t.activityCount === 1 ? "" : "s"}
                  </span>
                  <span className="font-bold text-[#9a4a36]">Open itinerary →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: My Saved Inspiration */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#9a4a36]">Saved Boards</span>
            <h2 className="editorial-title text-2xl font-bold text-[#163d46]">Saved Inspiration</h2>
          </div>
          <Link href="/reel-to-travel" className="text-xs font-semibold text-[#163d46] hover:underline">
            Manage all {savedItems.length} ideas →
          </Link>
        </div>

        {savedItems.length === 0 ? (
          <Card className="text-center py-10">
            <span className="text-3xl">📌</span>
            <h3 className="editorial-title mt-2 text-lg font-bold text-[#163d46]">No saved inspiration yet</h3>
            <p className="mt-1 text-xs text-[#566468]">
              Paste links from Instagram Reels, Pinterest, or YouTube, or save curated places from the explore guide.
            </p>
            <div className="mt-4">
              <Link
                href="/reel-to-travel"
                className="inline-flex min-h-10 items-center rounded-xl bg-[#a8503a] px-5 text-xs font-bold text-white hover:bg-[#8a4230]"
              >
                + Save First Idea
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedItems.slice(0, 6).map((s) => (
              <article
                key={s.id}
                className="flex flex-col justify-between rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={s.category} />
                    <PlatformBadge platform={s.platform} />
                    {s.collectionName && (
                      <span className="rounded-full bg-[#f5d9bd]/40 px-2 py-0.5 text-[10px] font-semibold text-[#9a4a36]">
                        📁 {s.collectionName}
                      </span>
                    )}
                  </div>
                  <h3 className="editorial-title mt-2 text-base font-bold text-[#243238]">{s.title}</h3>
                  {s.location && <p className="mt-1 text-xs text-[#566468]">📍 {s.location}</p>}
                  {s.notes && <p className="mt-2 line-clamp-2 text-xs text-[#243238]">{s.notes}</p>}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#163d46]/10 pt-2 text-xs">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#163d46] hover:underline">
                      Link ↗
                    </a>
                  ) : (
                    <span />
                  )}
                  <Link href={`/saved/${s.id}`} className="font-semibold text-[#566468] hover:text-[#163d46]">
                    Edit →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Section 4: My Collections */}
      {collections.length > 0 && (
        <section className="space-y-4">
          <h2 className="editorial-title text-xl font-bold text-[#163d46]">My Collections</h2>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/reel-to-travel?collection=${c.id}`}
                className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs transition hover:border-[#163d46]/30 hover:shadow-sm"
              >
                <div className="text-xl">📁</div>
                <h3 className="editorial-title mt-1 text-sm font-bold text-[#243238]">{c.name}</h3>
                <span className="mt-1 block text-xs text-[#566468]">
                  {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Section 5: Recently Saved Places */}
      {recentlySavedPlaces.length > 0 && (
        <section className="space-y-4">
          <h2 className="editorial-title text-xl font-bold text-[#163d46]">Recently Saved Landmarks &amp; Spots</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentlySavedPlaces.map((p) => (
              <div key={p.id} className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
                <span className="text-xs font-semibold text-[#9a4a36]">{p.destinationName}</span>
                <h3 className="editorial-title mt-1 text-sm font-bold text-[#243238]">{p.title}</h3>
                {p.durationMin && <p className="mt-1 text-xs text-[#566468]">⏱ {formatDuration(p.durationMin)}</p>}
                {p.costCents !== null && p.currency && (
                  <p className="text-xs text-[#566468]">💰 {formatMoney(p.costCents, p.currency)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 6: Community Recommendations */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#9a4a36]">Inspiration Feed</span>
            <h2 className="editorial-title text-2xl font-bold text-[#163d46]">Community Recommendations</h2>
          </div>
          <Link href="/community" className="text-xs font-semibold text-[#163d46] hover:underline">
            View all community tips →
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {communityRecs.map((post) => (
            <CommunityPostCard key={post.id} post={post} trips={trips} />
          ))}
        </div>
      </section>
    </div>
  );
}
