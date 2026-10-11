import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/connection";
import { currentOwner } from "@/lib/voyage/owner";
import { listDestinations, listPlaces } from "@/lib/voyage/places";
import { listTrips } from "@/lib/voyage/trips";
import { listCommunityPosts } from "@/lib/voyage/community";
import { CURRENCIES } from "@/lib/voyage/content";
import { ActionForm } from "@/components/voyage/ActionForm";
import { Card, Field, inputClass, CommunityPostCard } from "@/components/voyage/ui";
import { createCommunityPostAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Traveller Community · Real Travel Field Notes",
  description: "Read and share honest traveller tips, cultural customs, food spots, and practical notes for Kozhikode and Istanbul.",
};

type SP = Promise<{ destination?: string; category?: string }>;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "tip", label: "Practical Tips" },
  { value: "food", label: "Food & Dining" },
  { value: "review", label: "Place Reviews" },
  { value: "story", label: "Travel Stories" },
  { value: "landmark", label: "Landmark Notes" },
];

export default async function CommunityPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const owner = await currentOwner();

  const destinations = listDestinations(db);
  const allPlaces = destinations.flatMap((d) => listPlaces(db, d.id, "all"));
  const trips = owner ? listTrips(db, owner) : [];

  const destFilter = destinations.some((d) => d.id === sp.destination) ? sp.destination : undefined;
  const catFilter = CATEGORY_OPTIONS.some((c) => c.value === sp.category) && sp.category !== "all" ? sp.category : undefined;

  const posts = listCommunityPosts(db, { destinationId: destFilter, category: catFilter, me: owner });

  return (
    <div className="space-y-10">
      {/* Editorial Header */}
      <div className="border-b border-[#163d46]/10 pb-6">
        <span className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Traveller Collective</span>
        <h1 className="editorial-title mt-2 text-3xl font-extrabold text-[#163d46] sm:text-4xl">
          Traveller Community Notes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#566468]">
          Practical notes from people who have actually been. Every contribution is written by a visitor, shown as unverified, and can be reported. There are no made-up users, ratings or likes: if nothing is here yet, nobody has shared yet.
        </p>
      </div>

      {/* Share a Tip / Note Form */}
      <Card>
        <details>
          <summary className="min-h-11 cursor-pointer editorial-title text-xl font-bold text-[#163d46]">
            ✍️ Share what you experienced
          </summary>
          <div className="mt-4 border-t border-[#163d46]/10 pt-4">
            <ActionForm action={createCommunityPostAction} submitLabel="Share my contribution" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name or handle (optional)" hint="Shown with your contribution. Leave empty to appear as “Traveller”.">
                  <input name="authorName" maxLength={40} placeholder="e.g. Maya S." className={inputClass} />
                </Field>
                <Field label="Destination">
                  <select name="destinationId" required defaultValue="" className={inputClass}>
                    <option value="" disabled>Select destination…</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}, {d.country}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="About a specific place (optional)" hint="Must belong to the destination you chose.">
                  <select name="placeId" defaultValue="" className={inputClass}>
                    <option value="">The destination in general</option>
                    {allPlaces.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} ({pl.area})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type of contribution">
                  <select name="category" defaultValue="tip" className={inputClass}>
                    {CATEGORY_OPTIONS.filter((c) => c.value !== "all").map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Title" className="sm:col-span-2">
                  <input name="title" required minLength={4} maxLength={120} placeholder="e.g. Go before 5 pm for the quietest sunset walk" className={inputClass} />
                </Field>
                <Field label="What did you actually experience?" hint="At least 20 characters. Be specific: what you did, what you ordered, what surprised you." className="sm:col-span-2">
                  <textarea name="content" required rows={4} minLength={20} maxLength={2000} className={inputClass} />
                </Field>
                <Field label="When did you visit? (optional)">
                  <input name="visitDate" type="date" max={new Date().toISOString().slice(0, 10)} className={inputClass} />
                </Field>
                <Field label="Time you needed (minutes, optional)">
                  <input name="timeNeededMin" type="number" min={1} max={1440} inputMode="numeric" className={inputClass} />
                </Field>
                <div className="grid grid-cols-[1fr_6.5rem] gap-2">
                  <Field label="Approximate spend per person (optional)">
                    <input name="spend" inputMode="decimal" className={inputClass} />
                  </Field>
                  <Field label="Currency">
                    <select name="currency" defaultValue="" className={inputClass}>
                      <option value="">Auto</option>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Best time to go (optional)">
                  <input name="bestTime" maxLength={160} placeholder="e.g. weekday mornings; avoid Friday prayers" className={inputClass} />
                </Field>
                {/* Spam trap: invisible to people and assistive technology, tempting to bots. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-[#566468]">
                <strong>Please note:</strong> contributions are labelled unverified, because this app cannot prove a visit. Do not include personal details. You can delete your own contribution at any time; others can report it, and a person reviews reports.
              </p>
            </ActionForm>
          </div>
        </details>
      </Card>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#163d46]/10 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#566468]">Destination:</span>
          <Link
            href={catFilter ? `/community?category=${catFilter}` : "/community"}
            className={`inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold transition ${
              !destFilter ? "bg-[#163d46] text-white" : "bg-[#f8f5ef] text-[#243238] hover:bg-[#e4f4f7]"
            }`}
          >
            All
          </Link>
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/community?destination=${d.id}${catFilter ? `&category=${catFilter}` : ""}`}
              className={`inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold transition ${
                destFilter === d.id ? "bg-[#163d46] text-white" : "bg-[#f8f5ef] text-[#243238] hover:bg-[#e4f4f7]"
              }`}
            >
              {d.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#566468]">Category:</span>
          {CATEGORY_OPTIONS.map((c) => (
            <Link
              key={c.value}
              href={`/community?${destFilter ? `destination=${destFilter}&` : ""}category=${c.value}`}
              className={`inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold transition ${
                (sp.category === c.value || (!sp.category && c.value === "all"))
                  ? "bg-[#d98772] text-white"
                  : "bg-[#f8f5ef] text-[#243238] hover:bg-[#e4f4f7]"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Community Feed */}
      {posts.length === 0 ? (
        <Card className="text-center py-12">
          <span className="text-4xl">💬</span>
          <h2 className="editorial-title mt-3 text-xl font-bold text-[#163d46]">
            No contributions yet for this filter
          </h2>
          <p className="mt-2 text-sm text-[#566468]">
            Nobody has shared here yet. If you have been, you could be the first.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <CommunityPostCard key={post.id} post={post} trips={trips} />
          ))}
        </div>
      )}
    </div>
  );
}
