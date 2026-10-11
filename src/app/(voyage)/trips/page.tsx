import type { Metadata } from "next";
import Link from "next/link";
import { createTripAction } from "../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import { Card, Field, inputClass } from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { CURRENCIES } from "@/lib/voyage/content";
import { currentOwner } from "@/lib/voyage/owner";
import { listDestinations } from "@/lib/voyage/places";
import { listTrips } from "@/lib/voyage/trips";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Smart Trip Planner · VOYAGE",
  description: "Plan your travel day by day. Schedule activities from your saved inspiration, reorder places, and track expenses.",
};

export default async function Trips({ searchParams }: { searchParams: Promise<{ destination?: string }> }) {
  const db = getDb();
  const owner = await currentOwner();
  const destinations = listDestinations(db);
  const trips = owner ? listTrips(db, owner) : [];
  const pre = (await searchParams).destination;
  const preselect = destinations.some((d) => d.id === pre) ? pre : "";

  return (
    <div className="space-y-10">
      {/* Editorial Header */}
      <div className="border-b border-[#163d46]/10 pb-6">
        <span className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Itinerary Architect</span>
        <h1 className="editorial-title mt-2 text-3xl font-extrabold text-[#163d46] sm:text-4xl">
          Your Planned Journeys
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#566468]">
          Structure your adventures day by day. Import saved inspiration from Reels or curated landmarks, arrange daily schedules, and keep real-time oversight of your estimated budgets.
        </p>
      </div>

      {/* Trips Grid */}
      {trips.length > 0 ? (
        <ul className="grid gap-6 md:grid-cols-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/trips/${t.id}`}
                className="group flex flex-col justify-between rounded-3xl border border-[#163d46]/15 bg-white p-6 shadow-xs transition duration-200 hover:-translate-y-1 hover:border-[#163d46]/30 hover:shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[#f8f5ef] px-3 py-1 text-xs font-bold text-[#163d46] ring-1 ring-[#163d46]/10">
                      📍 {t.destinationName}
                    </span>
                    <span className="text-xs font-semibold text-[#566468]">
                      {t.days} day{t.days === 1 ? "" : "s"}
                    </span>
                  </div>
                  <h2 className="editorial-title mt-3 text-2xl font-bold text-[#243238] group-hover:text-[#163d46]">
                    {t.name}
                  </h2>
                  <p className="mt-2 text-xs font-medium text-[#566468]">
                    📅 {t.startDate} → {t.endDate}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-[#163d46]/10 pt-4 text-xs">
                  <span className="font-semibold text-[#163d46]">
                    {t.activityCount} planned activity{t.activityCount === 1 ? "" : "ies"}
                  </span>
                  <span className="font-bold text-[#d98772] group-hover:underline">Open itinerary planner →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="text-center py-12">
          <div aria-hidden className="text-4xl">🗺️</div>
          <h2 className="editorial-title mt-3 text-xl font-bold text-[#163d46]">
            No journeys planned yet
          </h2>
          <p className="mt-2 text-sm text-[#566468]">
            Fill out the form below to initiate your first trip itinerary.
          </p>
        </Card>
      )}

      {/* Create Trip Form */}
      <Card className="scroll-mt-6 border-[#163d46]/15">
        <div className="border-b border-[#163d46]/10 pb-3">
          <h2 id="new-trip" className="editorial-title text-xl font-bold text-[#163d46]">
            Create a New Trip
          </h2>
          <p className="mt-1 text-xs text-[#566468]">
            Define dates, pick your destination, and choose your primary budget currency.
          </p>
        </div>

        <ActionForm action={createTripAction} submitLabel="Create Trip Itinerary" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trip Name" className="sm:col-span-2">
              <input name="name" required maxLength={80} placeholder="e.g. Autumn in Istanbul or Malabar Spice Trail" className={inputClass} />
            </Field>
            <Field label="Destination">
              <select name="destinationId" required defaultValue={preselect} className={inputClass}>
                <option value="" disabled>Choose a destination</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}, {d.country}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Budget Currency" hint="Auto defaults to the destination currency (INR or TRY/EUR).">
              <select name="currency" defaultValue="" className={inputClass}>
                <option value="">Auto (Default)</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start Date">
              <input name="startDate" type="date" required className={inputClass} />
            </Field>
            <Field label="End Date" hint="Trip can be up to 60 days long.">
              <input name="endDate" type="date" required className={inputClass} />
            </Field>
            <Field label="Trip Notes & Goals (Optional)" className="sm:col-span-2">
              <textarea
                name="notes"
                rows={2}
                maxLength={2000}
                placeholder="Travel companions, flight info, hotel reservation references..."
                className={inputClass}
              />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
