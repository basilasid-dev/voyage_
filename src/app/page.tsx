import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/connection";
import { listDestinations, listPlaces } from "@/lib/voyage/places";
import { listCommunityPosts } from "@/lib/voyage/community";
import { Navbar } from "@/components/voyage/Navbar";
import { SmartImage } from "@/components/voyage/SmartImage";
import { currentOwner } from "@/lib/voyage/owner";
import { listCaptures } from "@/lib/voyage/reel";
import { DESTINATION_PHOTOS } from "@/lib/voyage/photography";
import { ESTIMATE_DISCLAIMER } from "@/lib/voyage/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "VOYAGE · Your next journey begins here",
  description: "Discover the Malabar spice coast of Kozhikode and the imperial shores of Istanbul. Save travel reels, curate inspiration, and plan your trips day by day.",
};

export default async function HomePage() {
  const db = getDb();
  const destinations = listDestinations(db);
  const kozhikodePlaces = listPlaces(db, "kozhikode", "all").slice(0, 3);
  const istanbulPlaces = listPlaces(db, "istanbul", "all").slice(0, 3);
  const communityTips = listCommunityPosts(db, { limit: 4 });
  const owner = await currentOwner();
  const recentCaptures = owner ? listCaptures(db, owner, 2) : [];

  return (
    <div className="min-h-dvh bg-[#f8f5ef] text-[#243238]">
      {/* Navigation Header */}
      <Navbar />

      {/* Main Container */}
      <main id="main">
        {/* Cinematic Hero Section */}
        <section className="relative overflow-hidden bg-[#163d46] text-white">
          <div className="absolute inset-0 z-0">
            {/* High-res cinematic photography of golden-hour travel destination */}
            <SmartImage
              src={DESTINATION_PHOTOS["istanbul"].src}
              fallbackSrc="/img/destinations/istanbul.svg"
              alt="Golden hour over historic waterways and domes"
              fallbackAlt={DESTINATION_PHOTOS["istanbul"].alt}
              eager
              className="h-full w-full object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#163d46] via-[#163d46]/70 to-transparent" />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#a8d9df]/30 bg-[#163d46]/60 px-3.5 py-1 text-xs font-semibold tracking-wider uppercase text-[#a8d9df] backdrop-blur-md">
                <span>✦</span> Editorial Travel Magazine &amp; Smart Planner
              </div>
              <h1 className="editorial-title text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
                Your next journey begins here.
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-[#f8f5ef]/90 sm:text-xl">
                From the palm-fringed Arabian Sea sunsets of Kozhikode to the timeless minarets along the Bosphorus in Istanbul. Discover rich cultural landscapes, save Reels and Pinterest inspiration, and build effortless day-by-day itineraries.
              </p>

              {/* Quick Discovery / Quick Reel Paste Bar */}
              <div className="pt-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/10 p-2.5 backdrop-blur-md sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-3 px-3 py-1">
                    <span className="text-xl">📸</span>
                    <form action="/reel-to-travel" method="get" className="flex w-full items-center gap-2">
                      <input
                        name="url"
                        type="url"
                        aria-label="Link to a Reel, pin or video"
                        placeholder="Paste an Instagram Reel, Pinterest pin, or YouTube URL..."
                        className="w-full bg-transparent text-sm text-white placeholder-white/60 outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[#d98772] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#b8624d] shrink-0"
                      >
                        Save Reel →
                      </button>
                    </form>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#f8f5ef]/70">
                  <span>Trending destinations:</span>
                  <Link href="/explore/kozhikode" className="rounded-full bg-white/15 px-2.5 py-0.5 text-white hover:bg-white/25">
                    🌴 Kozhikode, Malabar Coast
                  </Link>
                  <Link href="/explore/istanbul" className="rounded-full bg-white/15 px-2.5 py-0.5 text-white hover:bg-white/25">
                    🕌 Istanbul, Bosphorus
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Destinations Showcase */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Cinematic Explorations</span>
              <h2 className="editorial-title mt-1 text-3xl font-bold tracking-tight text-[#163d46] sm:text-4xl">
                Featured Destinations
              </h2>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#163d46] hover:text-[#d98772]"
            >
              View all destination guides <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {/* Kozhikode Card */}
            <article className="group relative overflow-hidden rounded-3xl border border-[#163d46]/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="relative h-72 w-full overflow-hidden sm:h-80">
                <SmartImage
              src={DESTINATION_PHOTOS["kozhikode"].src}
              fallbackSrc="/img/destinations/kozhikode.svg"
              alt="Kozhikode coastal sunset with coconut palms"
              fallbackAlt={DESTINATION_PHOTOS["kozhikode"].alt}
              eager
              className="h-full w-full object-cover transition duration-700"
            />
                <div className="absolute inset-0 bg-gradient-to-t from-[#163d46] via-[#163d46]/40 to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                    India · Kerala
                  </span>
                </div>
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <h3 className="editorial-title text-3xl font-bold sm:text-4xl">Kozhikode</h3>
                  <p className="mt-1 text-xs text-[#a8d9df]">
                    Historic Spice Port · Arabian Sea Sunsets · Malabar Biryani · Sweet Meat Street
                  </p>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm leading-relaxed text-[#243238]">
                  Also known as Calicut, Kozhikode blends ancient spice trading heritage with relaxed coastal rhythm. Stroll along Beach Road for sunset snacks, explore the heritage timber mosque in Kuttichira, and savour legendary Dum Biryani.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-[#e4f4f7] px-2 py-1 font-medium text-[#163d46]">Kozhikode Beach</span>
                  <span className="rounded-md bg-[#e4f4f7] px-2 py-1 font-medium text-[#163d46]">SM Street Halwa</span>
                  <span className="rounded-md bg-[#e4f4f7] px-2 py-1 font-medium text-[#163d46]">Kappad Beach</span>
                  <span className="rounded-md bg-[#e4f4f7] px-2 py-1 font-medium text-[#163d46]">Beypore Shipyards</span>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-[#163d46]/10 pt-4">
                  <Link
                    href="/explore/kozhikode"
                    className="inline-flex min-h-10 items-center rounded-xl bg-[#163d46] px-4 text-xs font-semibold text-white transition hover:bg-[#0f2a30]"
                  >
                    Explore Kozhikode →
                  </Link>
                  <Link
                    href="/trips?destination=kozhikode#new-trip"
                    className="text-xs font-semibold text-[#d98772] hover:underline"
                  >
                    + Plan a trip
                  </Link>
                </div>
              </div>
            </article>

            {/* Istanbul Card */}
            <article className="group relative overflow-hidden rounded-3xl border border-[#163d46]/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="relative h-72 w-full overflow-hidden sm:h-80">
                <SmartImage
              src={DESTINATION_PHOTOS["istanbul"].src}
              fallbackSrc="/img/destinations/istanbul.svg"
              alt="Istanbul Bosphorus view and domes at golden hour"
              fallbackAlt={DESTINATION_PHOTOS["istanbul"].alt}
              eager
              className="h-full w-full object-cover transition duration-700"
            />
                <div className="absolute inset-0 bg-gradient-to-t from-[#163d46] via-[#163d46]/40 to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                    Türkiye
                  </span>
                </div>
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <h3 className="editorial-title text-3xl font-bold sm:text-4xl">Istanbul</h3>
                  <p className="mt-1 text-xs text-[#a8d9df]">
                    Two Continents · Bosphorus Ferries · Byzantine Domes · Grand Bazaar &amp; Baklava
                  </p>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm leading-relaxed text-[#243238]">
                  Straddling Europe and Asia across the glittering Bosphorus, Istanbul captivates with monumental Byzantine basilicas, Ottoman palace courtyards, bustling spice markets, and waterfront fish sandwiches by Galata Bridge.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-[#fbf3ea] px-2 py-1 font-medium text-[#b8624d]">Galata Tower</span>
                  <span className="rounded-md bg-[#fbf3ea] px-2 py-1 font-medium text-[#b8624d]">Hagia Sophia</span>
                  <span className="rounded-md bg-[#fbf3ea] px-2 py-1 font-medium text-[#b8624d]">Grand Bazaar</span>
                  <span className="rounded-md bg-[#fbf3ea] px-2 py-1 font-medium text-[#b8624d]">Karaköy Baklava</span>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-[#163d46]/10 pt-4">
                  <Link
                    href="/explore/istanbul"
                    className="inline-flex min-h-10 items-center rounded-xl bg-[#163d46] px-4 text-xs font-semibold text-white transition hover:bg-[#0f2a30]"
                  >
                    Explore Istanbul →
                  </Link>
                  <Link
                    href="/trips?destination=istanbul#new-trip"
                    className="text-xs font-semibold text-[#d98772] hover:underline"
                  >
                    + Plan a trip
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* Explore By Experience */}
        <section className="bg-[#f2eee6] py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Curated Lenses</span>
              <h2 className="editorial-title mt-1 text-3xl font-bold tracking-tight text-[#163d46] sm:text-4xl">
                Explore by Experience
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-[#566468]">
                Tailor your travels according to your passions: from golden beaches and ancient mosques to legendary culinary hotspots.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { title: "Beaches & Waters", icon: "🌊", desc: "Arabian Sea & Bosphorus shores", href: "/explore/kozhikode?show=landmarks" },
                { title: "Culture & Heritage", icon: "🏛️", desc: "Mosques, palaces & towers", href: "/explore/istanbul?show=landmarks" },
                { title: "Food & Sweets", icon: "🍽️", desc: "Biryani, halwa, baklava & tea", href: "/explore/kozhikode?show=food" },
                { title: "Markets & Bazaars", icon: "🛍️", desc: "Grand Bazaar & SM Street", href: "/explore/istanbul" },
                { title: "Nature & Falls", icon: "🌿", desc: "Thusharagiri & green trails", href: "/explore/kozhikode" },
              ].map((exp) => (
                <Link
                  key={exp.title}
                  href={exp.href}
                  className="group flex flex-col rounded-2xl border border-[#163d46]/10 bg-white p-5 text-center shadow-xs transition duration-200 hover:-translate-y-1 hover:border-[#163d46]/30 hover:shadow-md"
                >
                  <span className="text-3xl transition duration-300 group-hover:scale-110">{exp.icon}</span>
                  <h3 className="editorial-title mt-3 font-bold text-[#163d46]">{exp.title}</h3>
                  <p className="mt-1 text-xs text-[#566468]">{exp.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Signature Feature: Reel-to-Travel Spotlight */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="overflow-hidden rounded-3xl border border-[#163d46]/15 bg-gradient-to-br from-[#163d46] to-[#0f2a30] text-white shadow-xl lg:grid lg:grid-cols-[1.2fr_1fr]">
            <div className="p-8 sm:p-12">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#a8d9df]/20 px-3 py-1 text-xs font-semibold text-[#a8d9df]">
                <span>✦</span> Signature Feature
              </span>
              <h2 className="editorial-title mt-4 text-3xl font-extrabold sm:text-4xl lg:text-5xl">
                Reel-to-Travel™
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#f8f5ef]/80 sm:text-base">
                Found an unbelievable cafe on an Instagram Reel? A hidden cliffside on Pinterest? A food walking tour on YouTube? Don&apos;t let it get lost in your bookmarks.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-[#f8f5ef]/90">
                <li className="flex items-center gap-2">
                  <span className="text-[#a8d9df]">✓</span> Paste a link or a caption. We read what is public and say so when a platform blocks us
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#a8d9df]">✓</span> Pick the places it found, correct them, keep your notes and estimates
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#a8d9df]">✓</span> Organise into curated collections (e.g. &ldquo;Food Spots&rdquo;)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#a8d9df]">✓</span> Slot saved places directly into day-by-day trip itineraries
                </li>
              </ul>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/reel-to-travel"
                  className="inline-flex min-h-12 items-center rounded-xl bg-[#d98772] px-6 text-sm font-bold text-white shadow-md transition hover:bg-[#b8624d]"
                >
                  Open Reel-to-Travel →
                </Link>
                <Link
                  href="/my-voyage"
                  className="inline-flex min-h-12 items-center rounded-xl border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  View My Collections
                </Link>
              </div>
            </div>

            {/* Real state: the visitor's latest captures, or how it works. Nothing here is invented. */}
            <div className="flex flex-col justify-center border-t border-white/10 bg-black/20 p-6 sm:p-10 lg:border-l lg:border-t-0">
              {recentCaptures.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#a8d9df]">Your latest captures</h3>
                  {recentCaptures.map((c) => (
                    <Link key={c.id} href={"/reel-to-travel/" + c.id} className="block rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md transition hover:bg-white/15">
                      <p className="text-xs font-semibold capitalize text-[#a8d9df]">{c.platform === "manual" ? "Pasted text" : c.platform}</p>
                      <p className="mt-1 text-sm font-bold text-white">{c.title ?? c.url ?? "Pasted caption"}</p>
                      <p className="mt-1 text-xs text-white/80">{c.candidateCount} place{c.candidateCount === 1 ? "" : "s"} found · {c.savedCount} saved</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <ol className="space-y-4 text-sm text-white/90">
                  <li className="flex gap-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d98772] text-xs font-bold">1</span><span><strong>Paste</strong> a Reel, pin or video link, or the caption you copied.</span></li>
                  <li className="flex gap-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d98772] text-xs font-bold">2</span><span><strong>Review</strong> the places it found, with how sure it is and why. Correct anything.</span></li>
                  <li className="flex gap-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d98772] text-xs font-bold">3</span><span><strong>Save</strong> them to a collection, then <strong>plan</strong> them onto the days of a trip.</span></li>
                </ol>
              )}
            </div>
          </div>
        </section>

        {/* Community Stories & Insights */}
        <section className="bg-[#f8f5ef] py-16 sm:py-24 border-t border-[#163d46]/10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Real Travellers</span>
                <h2 className="editorial-title mt-1 text-3xl font-bold tracking-tight text-[#163d46] sm:text-4xl">
                  Community Travel Stories &amp; Tips
                </h2>
              </div>
              <Link
                href="/community"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#163d46] hover:text-[#d98772]"
              >
                Share your experience <span aria-hidden>→</span>
              </Link>
            </div>

            {communityTips.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[#163d46]/25 bg-white p-8 text-center">
                <p className="editorial-title text-lg font-bold text-[#163d46]">No traveller contributions yet</p>
                <p className="mx-auto mt-2 max-w-xl text-sm text-[#566468]">
                  Every tip here comes from a real visitor. Been to Kozhikode or Istanbul? Share what you actually experienced: what it cost, how long you needed and when to go.
                </p>
                <Link href="/community" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#163d46] px-5 text-sm font-bold text-white hover:bg-[#0f2a30]">
                  Be the first to share
                </Link>
              </div>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {communityTips.map((tip) => (
                  <article key={tip.id} className="flex flex-col rounded-2xl border border-[#163d46]/10 bg-white p-5 shadow-xs transition duration-200 hover:border-[#163d46]/25 hover:shadow-md">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#163d46]">{tip.authorName}</span>
                      <span className="rounded-full bg-[#f5d9bd]/40 px-2 py-0.5 text-xs font-semibold text-[#8a4a38]">{tip.destinationName}</span>
                    </div>
                    <h3 className="editorial-title mt-3 font-bold text-[#243238]">{tip.title}</h3>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#566468]">{tip.content}</p>
                    <p className="mt-2 text-xs text-[#566468]">Unverified traveller contribution</p>
                    <div className="mt-auto flex items-center justify-between border-t border-[#163d46]/10 pt-4 text-xs text-[#566468]">
                      <span>{tip.helpfulCount} found this helpful</span>
                      <Link href="/community" className="inline-flex min-h-10 items-center font-semibold text-[#163d46] hover:underline">Read more →</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Protected Kozhikode Bus Service Spotlight */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-[#16883f]/30 bg-gradient-to-br from-[#0d3b21] via-[#136b34] to-[#16883f] p-8 text-white sm:flex-row sm:items-center">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-[#dcfce7]">
                <span>🚌</span> Local Transit Module
              </span>
              <h2 className="text-2xl font-bold sm:text-3xl">Kozhikode Private Bus Route Guide</h2>
              <p className="max-w-xl text-xs sm:text-sm text-[#dcfce7]/90 leading-relaxed">
                Looking for local Calicut private bus schedules? Find direct journeys, one-transfer connections, stop names in Malayalam &amp; English, and fare information where it has been recorded. Demo data is always labelled and nothing is estimated.
              </p>
            </div>
            <Link
              href="/bus-guide"
              className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-sm font-bold text-[#0d3b21] shadow-lg transition hover:bg-[#dcfce7] shrink-0"
            >
              Open Bus Guide 🚌
            </Link>
          </div>
        </section>

        {/* Estimate Disclaimer */}
        <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            ⚠️ {ESTIMATE_DISCLAIMER}
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#163d46]/10 bg-[#163d46] py-12 text-[#f8f5ef]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a8d9df] text-sm text-[#163d46]">🧭</span>
                <span className="editorial-title text-lg font-bold tracking-wider text-white">VOYAGE</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#f8f5ef]/70">
                A premium travel companion combining the visual beauty of travel discovery with pragmatic day-by-day trip planning.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a8d9df]">Destinations</h3>
              <ul className="mt-3 space-y-2 text-xs text-[#f8f5ef]/80">
                <li>
                  <Link href="/explore/kozhikode" className="hover:text-white">Kozhikode (Malabar Coast)</Link>
                </li>
                <li>
                  <Link href="/explore/istanbul" className="hover:text-white">Istanbul (Bosphorus)</Link>
                </li>
                <li>
                  <Link href="/explore" className="hover:text-white">Explore all destinations →</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a8d9df]">Features</h3>
              <ul className="mt-3 space-y-2 text-xs text-[#f8f5ef]/80">
                <li>
                  <Link href="/reel-to-travel" className="hover:text-white">Reel-to-Travel Saver</Link>
                </li>
                <li>
                  <Link href="/my-voyage" className="hover:text-white">My Voyage Dashboard</Link>
                </li>
                <li>
                  <Link href="/trips" className="hover:text-white">Smart Trip Planner</Link>
                </li>
                <li>
                  <Link href="/community" className="hover:text-white">Traveller Community</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a8d9df]">Local Transit</h3>
              <ul className="mt-3 space-y-2 text-xs text-[#f8f5ef]/80">
                <li>
                  <Link href="/bus-guide" className="hover:text-white">🚌 Kozhikode Bus Route Guide</Link>
                </li>
                <li>
                  <Link href="/bus-guide" className="hover:text-white">Bilingual മലയാളം / English</Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6 text-xs text-[#f8f5ef]/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>
              Your saved inspiration and itineraries are safely stored in your browser session. Estimated costs and durations are planning guides, not live quotes.
            </p>
            <p className="shrink-0 text-right">
              VOYAGE © {new Date().getFullYear()} · Editorial Travel Companion
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
