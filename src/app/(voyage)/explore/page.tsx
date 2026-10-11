import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/connection";
import { ESTIMATE_DISCLAIMER } from "@/lib/voyage/content";
import { listDestinations } from "@/lib/voyage/places";
import { DestinationCard } from "@/components/voyage/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Explore Destinations · VOYAGE",
  description: "Browse curated destination guides for Kozhikode and Istanbul. Discover landmarks, coastal promenades, historic mosques, and food cultures.",
};

export default function ExplorePage() {
  const destinations = listDestinations(getDb());

  return (
    <div className="space-y-12">
      {/* Editorial Header */}
      <div className="border-b border-[#163d46]/10 pb-8">
        <span className="text-xs font-bold uppercase tracking-widest text-[#9a4a36]">Discovery &amp; Guides</span>
        <h1 className="editorial-title mt-2 text-4xl font-extrabold tracking-tight text-[#163d46] sm:text-5xl">
          Where to next?
        </h1>
        <p className="mt-3 max-w-2xl text-base text-[#566468] leading-relaxed">
          Explore our deeply curated destination chronicles. Learn local customs, uncover historic waterfronts, save places to your personal inspiration list, and organize your daily journeys.
        </p>
      </div>

      {/* Featured Destination Cards */}
      <div className="grid gap-8 md:grid-cols-2">
        {destinations.map((d) => (
          <DestinationCard key={d.id} d={d} />
        ))}
      </div>

      {/* Curated Travel Inspiration Themes */}
      <section className="rounded-3xl border border-[#163d46]/15 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#9a4a36]">Curated Itinerary Trails</span>
            <h2 className="editorial-title text-2xl font-bold text-[#163d46]">Suggested Experiences</h2>
          </div>
          <Link href="/reel-to-travel" className="text-xs font-semibold text-[#163d46] hover:underline">
            + Save your own discovery ideas →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#163d46]/10 bg-[#f8f5ef] p-4 transition hover:border-[#163d46]/30">
            <span className="text-2xl">🌴</span>
            <h3 className="editorial-title mt-2 font-bold text-[#163d46]">Malabar Sunset &amp; Halwa Trail</h3>
            <p className="mt-1 text-xs text-[#566468]">
              Afternoon shopping along Sweet Meat Street followed by evening tea and pickled mango on Kozhikode Beach.
            </p>
            <Link href="/explore/kozhikode" className="mt-3 inline-block text-xs font-semibold text-[#9a4a36] hover:underline">
              View spots in Kozhikode →
            </Link>
          </div>

          <div className="rounded-2xl border border-[#163d46]/10 bg-[#f8f5ef] p-4 transition hover:border-[#163d46]/30">
            <span className="text-2xl">⛵</span>
            <h3 className="editorial-title mt-2 font-bold text-[#163d46]">The Two-Continent Bosphorus Cross</h3>
            <p className="mt-1 text-xs text-[#566468]">
              Start at Galata Tower, cross to Karaköy for warm pistachio baklava, then catch the sunset ferry to Kadıköy.
            </p>
            <Link href="/explore/istanbul" className="mt-3 inline-block text-xs font-semibold text-[#9a4a36] hover:underline">
              View spots in Istanbul →
            </Link>
          </div>

          <div className="rounded-2xl border border-[#163d46]/10 bg-[#f8f5ef] p-4 transition hover:border-[#163d46]/30">
            <span className="text-2xl">🏛️</span>
            <h3 className="editorial-title mt-2 font-bold text-[#163d46]">Ancient Architecture &amp; Heritage</h3>
            <p className="mt-1 text-xs text-[#566468]">
              From the wooden multi-tiered Mishkal Mosque in Kuttichira to the imperial grandeur of Hagia Sophia.
            </p>
            <Link href="/explore" className="mt-3 inline-block text-xs font-semibold text-[#9a4a36] hover:underline">
              Compare architectural styles →
            </Link>
          </div>
        </div>
      </section>

      {/* Planning Notice */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        <p>
          ⚠️ <strong>Planning Note:</strong> {ESTIMATE_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
