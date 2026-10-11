import type { Metadata } from "next";
import Link from "next/link";
import { analyzeReelAction } from "../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import { Card, PlatformBadge } from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { currentOwner } from "@/lib/voyage/owner";
import { listCaptures } from "@/lib/voyage/reel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reel-to-Travel · VOYAGE",
  description: "Paste a travel Reel, Pinterest pin or YouTube link. VOYAGE finds the places in it, you confirm them, and they become a plan.",
};

const STEPS = [
  ["1", "Paste", "A link, or the caption you copied"],
  ["2", "Read", "We list the places, and how sure we are"],
  ["3", "Confirm", "Fix names, pick what you want"],
  ["4", "Save", "Into a collection, with your notes"],
  ["5", "Plan", "Onto the days of a trip"],
] as const;

const field =
  "w-full rounded-xl border border-[#163d46]/25 bg-white px-4 py-3 text-base text-[#243238] outline-none transition focus:border-[#163d46] focus:ring-2 focus:ring-[#a8d9df]/60";

export default async function ReelToTravel({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const sp = await searchParams;
  const owner = await currentOwner();
  const captures = owner ? listCaptures(getDb(), owner, 8) : [];
  const prefill = (sp.url ?? "").slice(0, 2000);

  return (
    <div className="space-y-10">
      {/* Hero: the one thing to do on this page */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#163d46] via-[#1b4a55] to-[#0f2a30] p-6 text-white shadow-xl sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#a8d9df]/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-[#d98772]/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-[#a8d9df]/20 px-3 py-1 text-xs font-semibold text-[#a8d9df]">Reel-to-Travel</span>
          <h1 className="editorial-title mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">From a Reel to a real trip.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#f8f5ef]/90 sm:text-lg">
            Paste a travel Reel, Pinterest pin or video. VOYAGE finds the places mentioned, shows you why it thinks so, and lets you turn them into a plan. If a platform will not let us read a post, we say so instead of guessing.
          </p>

          <ActionForm action={analyzeReelAction} submitLabel="Find the places" buttonClassName="min-h-12 px-7 text-base" className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-white">Link (Instagram, Pinterest, YouTube, TikTok or Vimeo)</span>
              <input name="url" type="url" inputMode="url" defaultValue={prefill} maxLength={2000} placeholder="https://www.instagram.com/reel/…" className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-white">Caption or description (recommended)</span>
              <textarea
                name="caption"
                rows={5}
                maxLength={4000}
                aria-describedby="caption-help"
                placeholder={"Paste the caption here. For example:\n📍 Galata Tower, Istanbul\n1. Karaköy Güllüoğlu: baklava\n2. Ferry to Kadıköy at sunset"}
                className={field}
              />
              <span id="caption-help" className="mt-1 block text-xs text-[#f8f5ef]/80">
                Instagram and TikTok often hide posts from outside readers, so the caption is the most reliable source. Screenshots cannot be read yet: please type or paste the text.
              </span>
            </label>
          </ActionForm>
        </div>
      </section>

      {/* The journey */}
      <ol className="grid gap-3 sm:grid-cols-5" aria-label="How Reel-to-Travel works">
        {STEPS.map(([n, title, text]) => (
          <li key={n} className="rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[#163d46] text-sm font-bold text-white">{n}</span>
            <h2 className="mt-2 text-sm font-bold text-[#163d46]">{title}</h2>
            <p className="mt-1 text-xs text-[#566468]">{text}</p>
          </li>
        ))}
      </ol>

      {/* History */}
      <section aria-labelledby="recent">
        <div className="flex items-end justify-between gap-3 border-b border-[#163d46]/10 pb-3">
          <h2 id="recent" className="editorial-title text-2xl font-bold text-[#163d46]">Your captures</h2>
          <Link href="/saved" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#163d46] underline">Open your saved library →</Link>
        </div>
        {captures.length === 0 ? (
          <Card className="mt-4 text-center">
            <p className="text-sm text-[#566468]">Nothing captured yet. Paste your first link or caption above.</p>
          </Card>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {captures.map((c) => (
              <li key={c.id}>
                <Link href={"/reel-to-travel/" + c.id} className="flex h-full gap-4 rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs transition hover:border-[#163d46]/30 hover:shadow-md">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnailUrl} alt="" width={96} height={72} loading="lazy" referrerPolicy="no-referrer" className="h-[72px] w-24 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div aria-hidden className="flex h-[72px] w-24 shrink-0 items-center justify-center rounded-xl bg-[#e4f4f7] text-2xl">📍</div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><PlatformBadge platform={c.platform} />{c.destinationName && <span className="text-xs text-[#566468]">{c.destinationName}</span>}</div>
                    <p className="mt-1 truncate text-sm font-bold text-[#243238]">{c.title ?? c.url ?? "Pasted caption"}</p>
                    <p className="mt-0.5 text-xs text-[#566468]">{c.candidateCount} place{c.candidateCount === 1 ? "" : "s"} found · {c.savedCount} saved</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
