import type { Metadata } from "next";
import Link from "next/link";
import { FlashProvider } from "@/components/voyage/ActionForm";
import { Navbar } from "@/components/voyage/Navbar";

export const metadata: Metadata = {
  title: { default: "VOYAGE · Travel Discovery & Trip Planning", template: "%s · Voyage" },
  description: "Explore Kozhikode and Istanbul, save travel inspiration from Reels and Pinterest, and plan your journey day by day.",
};

export default function VoyageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f8f5ef] text-[#243238] flex flex-col justify-between">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-[#163d46] focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Navigation Header */}
      <Navbar />

      {/* Main Content Area */}
      <FlashProvider>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </FlashProvider>

      {/* Editorial Magazine Footer */}
      <footer className="mt-12 border-t border-[#163d46]/10 bg-[#163d46] py-12 text-[#f8f5ef]">
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
                  <Link href="/explore/kozhikode" className="hover:text-white">Kozhikode, India (Malabar Coast)</Link>
                </li>
                <li>
                  <Link href="/explore/istanbul" className="hover:text-white">Istanbul, Türkiye (Bosphorus)</Link>
                </li>
                <li>
                  <Link href="/explore" className="hover:text-white">Browse all destinations →</Link>
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
                  <Link href="/bus-guide" className="hover:text-white">🚌 Kozhikode Private Bus Route Guide</Link>
                </li>
                <li>
                  <Link href="/bus-guide" className="hover:text-white">Bilingual English / മലയാളം Search</Link>
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
