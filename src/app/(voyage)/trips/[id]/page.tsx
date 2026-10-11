import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addCustomActivityAction,
  addExpenseAction,
  addToTripAction,
  deleteTripAction,
  moveActivityAction,
  moveActivityDayAction,
  removeActivityAction,
  removeExpenseAction,
  updateActivityAction,
  updateExpenseAction,
  updateTripAction,
} from "../../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import {
  CATEGORY_LABEL,
  Card,
  CategoryBadge,
  EstimateBadge,
  Field,
  MoneyTotals,
  ScheduleAlertBadge,
  inputClass,
} from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { CURRENCIES } from "@/lib/voyage/content";
import { currentOwner } from "@/lib/voyage/owner";
import { listDestinations, listPlaces } from "@/lib/voyage/places";
import { listSaved } from "@/lib/voyage/saved";
import { getTrip, type Activity, type Expense, type TripDetail } from "@/lib/voyage/trips";
import { CATEGORIES, EXPENSE_CATEGORIES, formatDuration, formatMoney } from "@/lib/voyage/validate";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const owner = await currentOwner();
  const id = Number((await params).id);
  const t = owner && Number.isSafeInteger(id) ? getTrip(getDb(), owner, id) : null;
  return { title: t ? `${t.trip.name} · Itinerary Planner` : "Trip" };
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

function ActivityRow({
  a,
  index,
  count,
  tripId,
  days,
  currency,
}: {
  a: Activity;
  index: number;
  count: number;
  tripId: number;
  days: number;
  currency: string;
}) {
  const hid = (
    <>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="tripId" value={tripId} />
    </>
  );

  return (
    <li className="rounded-2xl border border-[#163d46]/15 bg-white p-4 shadow-xs transition hover:border-[#163d46]/30">
      <div className="flex gap-3.5">
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#163d46] text-xs font-bold text-white shadow-xs"
        >
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="editorial-title text-base font-bold text-[#243238]">{a.title}</h3>
            <CategoryBadge category={a.category} />
          </div>
          {a.location && <p className="mt-0.5 text-xs text-[#566468]">📍 {a.location}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-[#243238]">
            {a.durationMin && <span>⏱ Est. {formatDuration(a.durationMin)}</span>}
            {a.costCents !== null && a.currency && (
              <span className="inline-flex items-center gap-1.5">
                💰 {formatMoney(a.costCents, a.currency)} <EstimateBadge />
              </span>
            )}
          </p>
          {a.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-[#243238] bg-[#f8f5ef] p-2.5 rounded-xl border border-[#163d46]/10">{a.notes}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#163d46]/10 pt-3">
        {index > 0 ? (
          <ActionForm action={moveActivityAction} submitLabel="↑" tone="neutral" compact ariaLabel={`Move ${a.title} up`} buttonClassName="w-10 px-0 h-9 text-xs">
            {hid}
            <input type="hidden" name="direction" value="up" />
          </ActionForm>
        ) : (
          <button type="button" disabled aria-label={`${a.title} is already first`} className="h-9 w-10 rounded-xl border border-slate-200 text-xs text-slate-300">
            ↑
          </button>
        )}
        {index < count - 1 ? (
          <ActionForm action={moveActivityAction} submitLabel="↓" tone="neutral" compact ariaLabel={`Move ${a.title} down`} buttonClassName="w-10 px-0 h-9 text-xs">
            {hid}
            <input type="hidden" name="direction" value="down" />
          </ActionForm>
        ) : (
          <button type="button" disabled aria-label={`${a.title} is already last`} className="h-9 w-10 rounded-xl border border-slate-200 text-xs text-slate-300">
            ↓
          </button>
        )}
        {days > 1 && (
          <ActionForm action={moveActivityDayAction} submitLabel="Move Day" tone="neutral" compact className="flex items-center gap-1.5">
            {hid}
            <label className="sr-only" htmlFor={`day-${a.id}`}>
              Move {a.title} to day
            </label>
            <select id={`day-${a.id}`} name="day" defaultValue={a.day} className={`${inputClass} w-28 text-xs h-9`}>
              {Array.from({ length: days }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Day {i + 1}
                </option>
              ))}
            </select>
          </ActionForm>
        )}
        <ActionForm
          action={removeActivityAction}
          submitLabel="🗑 Remove"
          tone="neutral"
          compact
          confirmText={`Remove “${a.title}” from this day?`}
          ariaLabel={`Remove ${a.title}`}
        >
          {hid}
        </ActionForm>
      </div>

      <details className="mt-2.5 rounded-xl border border-[#163d46]/10 bg-[#f8f5ef]/40">
        <summary className="min-h-9 cursor-pointer px-3 py-2 text-xs font-semibold text-[#163d46]">
          ✏️ Edit Details &amp; Notes
        </summary>
        <div className="border-t border-[#163d46]/10 p-3">
          <ActionForm action={updateActivityAction} submitLabel="Save Activity Changes">
            {hid}
            <input type="hidden" name="day" value={a.day} />
            <ActivityFields a={a} currency={currency} />
          </ActionForm>
        </div>
      </details>
    </li>
  );
}

function ActivityFields({ a, currency }: { a?: Activity; currency: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Activity Title" className="sm:col-span-2">
        <input name="title" required maxLength={120} defaultValue={a?.title ?? ""} placeholder="e.g. Sunset coffee at Galata" className={inputClass} />
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={a?.category ?? "other"} className={inputClass}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location">
        <input name="location" maxLength={160} defaultValue={a?.location ?? ""} placeholder="e.g. Beach Road, Kozhikode" className={inputClass} />
      </Field>
      <Field label="Duration (minutes)">
        <input name="durationMin" type="number" min={1} max={1440} inputMode="numeric" defaultValue={a?.durationMin ?? ""} placeholder="e.g. 90" className={inputClass} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-2">
        <Field label="Estimated cost">
          <input name="cost" inputMode="decimal" defaultValue={a?.costCents != null ? String(a.costCents / 100) : ""} placeholder="e.g. 150" className={inputClass} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={a?.currency ?? currency} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes & Tips" className="sm:col-span-2">
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={a?.notes ?? ""} placeholder="Timing, dress code, tickets..." className={inputClass} />
      </Field>
    </div>
  );
}

function ExpenseFields({ e, days, currency }: { e?: Expense; days: number; currency: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Expense Item" className="sm:col-span-2">
        <input name="label" required maxLength={80} defaultValue={e?.label ?? ""} placeholder="e.g. Airport taxi or Hotel booking" className={inputClass} />
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={e?.category ?? "other"} className={inputClass}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Target Day">
        <select name="day" defaultValue={e?.day ?? ""} className={inputClass}>
          <option value="">Whole Trip</option>
          {Array.from({ length: days }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Day {i + 1}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-2 sm:col-span-2">
        <Field label="Estimated Amount">
          <input name="amount" required inputMode="decimal" defaultValue={e ? String(e.amountCents / 100) : ""} placeholder="e.g. 50" className={inputClass} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={e?.currency ?? currency} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes (Optional)" className="sm:col-span-2">
        <input name="notes" maxLength={500} defaultValue={e?.notes ?? ""} placeholder="Receipt reference or booking details" className={inputClass} />
      </Field>
    </div>
  );
}

function ExpenseRow({ e, tripId, days, currency }: { e: Expense; tripId: number; days: number; currency: string }) {
  return (
    <li className="rounded-xl border border-[#163d46]/10 p-3 bg-white shadow-2xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-bold text-[#243238]">{e.label}</span>{" "}
          <span className="text-xs text-[#566468]">
            · {CATEGORY_LABEL[e.category]} · {e.day ? `Day ${e.day}` : "Whole Trip"}
          </span>
          {e.notes && <div className="text-xs text-[#566468] mt-0.5">{e.notes}</div>}
        </div>
        <div className="editorial-title font-bold text-sm text-[#b8624d]">
          {formatMoney(e.amountCents, e.currency)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <details className="min-w-0 flex-1 basis-60 rounded-xl border border-[#163d46]/10">
          <summary className="min-h-9 cursor-pointer px-3 py-1.5 text-xs font-semibold text-[#163d46]">
            ✏️ Edit
          </summary>
          <div className="border-t border-[#163d46]/10 p-3">
            <ActionForm action={updateExpenseAction} submitLabel="Save Changes">
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="tripId" value={tripId} />
              <ExpenseFields e={e} days={days} currency={currency} />
            </ActionForm>
          </div>
        </details>
        <ActionForm
          action={removeExpenseAction}
          submitLabel="🗑 Remove"
          tone="neutral"
          compact
          confirmText={`Remove “${e.label}”?`}
          ariaLabel={`Remove expense ${e.label}`}
        >
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="tripId" value={tripId} />
        </ActionForm>
      </div>
    </li>
  );
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const owner = await currentOwner();
  const db = getDb();
  const detail: TripDetail | null = owner && Number.isSafeInteger(id) ? getTrip(db, owner, id) : null;
  if (!owner || !detail) notFound();

  const { trip, days, tripWideExpenses, totals, totalDurationMin } = detail;
  const destinations = listDestinations(db);
  const destinationPlaces = listPlaces(db, trip.destinationId, "all");
  const saved = listSaved(db, owner).filter((s) => !s.destinationId || s.destinationId === trip.destinationId);
  const allExpenses = [...tripWideExpenses, ...days.flatMap((d) => d.expenses)];

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <p>
        <Link href="/trips" className="inline-flex min-h-10 items-center text-xs font-semibold text-[#163d46] hover:underline">
          ← All Planned Trips
        </Link>
      </p>

      {/* Trip Header Banner */}
      <div className="rounded-3xl border border-[#163d46]/15 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#163d46] px-3 py-1 text-xs font-bold text-white">
            📍 {trip.destinationName}
          </span>
          <span className="rounded-full bg-[#f8f5ef] px-3 py-1 text-xs font-semibold text-[#566468] ring-1 ring-[#163d46]/10">
            {trip.days} Day{trip.days === 1 ? "" : "s"} Itinerary
          </span>
        </div>
        <h1 className="editorial-title mt-3 text-3xl font-extrabold text-[#163d46] sm:text-4xl">
          {trip.name}
        </h1>
        <p className="mt-2 text-xs sm:text-sm font-medium text-[#566468]">
          📅 {longDate(trip.startDate)} → {longDate(trip.endDate)}
        </p>
        {trip.notes && (
          <p className="mt-3 max-w-3xl whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-[#243238] bg-[#f8f5ef] p-3.5 rounded-2xl border border-[#163d46]/10">
            {trip.notes}
          </p>
        )}
      </div>

      {/* Estimated Costs Overview */}
      <Card>
        <div className="flex items-center justify-between border-b border-[#163d46]/10 pb-3">
          <h2 className="editorial-title text-xl font-bold text-[#163d46]">
            Budget &amp; Schedule Overview <EstimateBadge />
          </h2>
          <span className="text-xs text-[#566468]">Independent currency totals</span>
        </div>
        <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-[#163d46]/10 bg-[#f8f5ef] p-3.5">
            <dt className="text-[#566468]">Planned Places Cost</dt>
            <dd className="editorial-title mt-1 text-lg font-bold text-[#163d46]">
              <MoneyTotals totals={totals.activities} />
            </dd>
          </div>
          <div className="rounded-xl border border-[#163d46]/10 bg-[#f8f5ef] p-3.5">
            <dt className="text-[#566468]">Direct Expenses</dt>
            <dd className="editorial-title mt-1 text-lg font-bold text-[#163d46]">
              <MoneyTotals totals={totals.expenses} />
            </dd>
          </div>
          <div className="rounded-xl border border-[#d98772]/20 bg-[#fbf3ea] p-3.5">
            <dt className="text-[#b8624d]">Total Estimated Budget</dt>
            <dd className="editorial-title mt-1 text-lg font-bold text-[#b8624d]">
              <MoneyTotals totals={totals.combined} />
            </dd>
          </div>
          <div className="rounded-xl border border-[#163d46]/10 bg-[#f8f5ef] p-3.5">
            <dt className="text-[#566468]">Total Sightseeing Time</dt>
            <dd className="editorial-title mt-1 text-lg font-bold text-[#163d46]">
              {totalDurationMin ? formatDuration(totalDurationMin) : "—"}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Day-by-Day Itinerary Days */}
      <div className="space-y-6">
        <h2 className="editorial-title text-2xl font-bold text-[#163d46]">Day-by-Day Itinerary</h2>

        {days.map((d) => {
          const dayTotal = { ...d.totals.activities };
          for (const [c, v] of Object.entries(d.totals.expenses)) dayTotal[c] = (dayTotal[c] ?? 0) + v;

          // Day duration calculation & schedule overload / overlap check
          const dayDurationMin = d.activities.reduce((acc, curr) => acc + (curr.durationMin ?? 0), 0);
          const isHeavySchedule = dayDurationMin >= 480; // >= 8 hours of activities in one day

          return (
            <section
              key={d.day}
              aria-labelledby={`day-${d.day}`}
              className="rounded-3xl border border-[#163d46]/15 bg-white p-5 sm:p-6 shadow-xs"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#163d46]/10 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`day-${d.day}`} className="editorial-title text-2xl font-bold text-[#163d46]">
                    Day {d.day}
                  </h3>
                  <span className="text-sm font-semibold text-[#566468]">· {longDate(d.date)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#243238]">
                  <span>
                    Planned duration: <strong>{dayDurationMin ? formatDuration(dayDurationMin) : "0 min"}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Day budget: <strong><MoneyTotals totals={dayTotal} /></strong>
                  </span>
                </div>
              </div>

              {/* Overlap / Heavy Schedule Alert */}
              {isHeavySchedule && (
                <div className="mt-3">
                  <ScheduleAlertBadge
                    message={`Heavy schedule detected: ${formatDuration(dayDurationMin)} planned on Day ${d.day}. Remember to leave room for transport and leisure.`}
                  />
                </div>
              )}

              {/* Activities on this day */}
              {d.activities.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#163d46]/20 bg-[#f8f5ef] p-6 text-center text-xs text-[#566468]">
                  No activities scheduled for Day {d.day} yet. Add a saved place, landmark, or custom activity below.
                </div>
              ) : (
                <ol className="mt-4 space-y-3" aria-label={`Activities on day ${d.day}`}>
                  {d.activities.map((a, i) => (
                    <ActivityRow
                      key={a.id}
                      a={a}
                      index={i}
                      count={d.activities.length}
                      tripId={trip.id}
                      days={trip.days}
                      currency={trip.currency}
                    />
                  ))}
                </ol>
              )}

              {/* Add Activity Accordion */}
              <details className="mt-4 rounded-2xl border border-[#163d46]/15 bg-[#f8f5ef]">
                <summary className="min-h-11 cursor-pointer px-4 py-3 text-xs font-bold text-[#163d46]">
                  ➕ Schedule Activity for Day {d.day}
                </summary>
                <div className="space-y-6 border-t border-[#163d46]/10 p-4">
                  {/* Option A: From Saved Inspiration */}
                  <div className="rounded-xl border border-[#163d46]/10 bg-white p-4">
                    <h4 className="editorial-title text-sm font-bold text-[#163d46]">
                      Import From Your Saved Inspiration
                    </h4>
                    {saved.length > 0 ? (
                      <ActionForm action={addToTripAction} submitLabel="Add to Day" className="mt-2 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="tripId" value={trip.id} />
                        <input type="hidden" name="day" value={d.day} />
                        <Field label="Saved Item" className="min-w-0 flex-1 basis-56">
                          <select name="savedId" required defaultValue="" className={inputClass}>
                            <option value="" disabled>Choose saved item…</option>
                            {saved.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title} ({CATEGORY_LABEL[s.category]})
                              </option>
                            ))}
                          </select>
                        </Field>
                      </ActionForm>
                    ) : (
                      <p className="mt-1 text-xs text-[#566468]">
                        No saved items for {trip.destinationName} yet.{" "}
                        <Link href="/reel-to-travel" className="font-bold text-[#163d46] underline">
                          Save a Reel or Pin
                        </Link>
                        .
                      </p>
                    )}
                  </div>

                  {/* Option B: From Curated Destination Places */}
                  <div className="rounded-xl border border-[#163d46]/10 bg-white p-4">
                    <h4 className="editorial-title text-sm font-bold text-[#163d46]">
                      Add Curated Landmark or Dining Spot in {trip.destinationName}
                    </h4>
                    <ActionForm action={addToTripAction} submitLabel="Add Landmark to Day" className="mt-2 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="tripId" value={trip.id} />
                      <input type="hidden" name="day" value={d.day} />
                      <Field label="Curated Place" className="min-w-0 flex-1 basis-56">
                        <select name="placeId" required defaultValue="" className={inputClass}>
                          <option value="" disabled>Choose curated place…</option>
                          {destinationPlaces.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.name} ({CATEGORY_LABEL[pl.category]} · {pl.area})
                            </option>
                          ))}
                        </select>
                      </Field>
                    </ActionForm>
                  </div>

                  {/* Option C: Custom Activity */}
                  <div className="rounded-xl border border-[#163d46]/10 bg-white p-4">
                    <h4 className="editorial-title text-sm font-bold text-[#163d46]">
                      Add Custom Activity or Event
                    </h4>
                    <ActionForm action={addCustomActivityAction} submitLabel="Add Custom Activity" resetOnSuccess className="mt-2">
                      <input type="hidden" name="tripId" value={trip.id} />
                      <input type="hidden" name="day" value={d.day} />
                      <ActivityFields currency={trip.currency} />
                    </ActionForm>
                  </div>
                </div>
              </details>
            </section>
          );
        })}
      </div>

      {/* Expenses Tracker */}
      <Card>
        <div className="border-b border-[#163d46]/10 pb-3">
          <h2 className="editorial-title text-xl font-bold text-[#163d46]">
            Trip Expenses &amp; Direct Costs <EstimateBadge />
          </h2>
          <p className="mt-1 text-xs text-[#566468]">
            Non-activity expenses: flight tickets, train, ferry transit, accommodation, and miscellaneous costs.
          </p>
        </div>

        {allExpenses.length === 0 ? (
          <p className="mt-4 text-xs text-[#566468]">No expenses added yet.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {allExpenses.map((e) => (
              <ExpenseRow key={e.id} e={e} tripId={trip.id} days={trip.days} currency={trip.currency} />
            ))}
          </ul>
        )}

        <details className="mt-4 rounded-xl border border-[#163d46]/15 bg-[#f8f5ef]">
          <summary className="min-h-10 cursor-pointer px-4 py-2.5 text-xs font-bold text-[#163d46]">
            ➕ Record an Expense
          </summary>
          <div className="border-t border-[#163d46]/10 p-4">
            <ActionForm action={addExpenseAction} submitLabel="Record Expense" resetOnSuccess>
              <input type="hidden" name="tripId" value={trip.id} />
              <ExpenseFields days={trip.days} currency={trip.currency} />
            </ActionForm>
          </div>
        </details>
      </Card>

      {/* Trip Configuration & Settings */}
      <Card>
        <details>
          <summary className="min-h-11 cursor-pointer editorial-title text-lg font-bold text-[#163d46]">
            Trip Configuration &amp; Settings
          </summary>
          <div className="mt-4 space-y-6 border-t border-[#163d46]/10 pt-4">
            <ActionForm action={updateTripAction} submitLabel="Update Trip Details">
              <input type="hidden" name="tripId" value={trip.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Trip Name" className="sm:col-span-2">
                  <input name="name" required maxLength={80} defaultValue={trip.name} className={inputClass} />
                </Field>
                <Field label="Destination">
                  <select name="destinationId" defaultValue={trip.destinationId} className={inputClass}>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}, {d.country}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Budget Currency">
                  <select name="currency" defaultValue={trip.currency} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start Date">
                  <input name="startDate" type="date" required defaultValue={trip.startDate} className={inputClass} />
                </Field>
                <Field label="End Date" hint="Shortening requires later days to be empty.">
                  <input name="endDate" type="date" required defaultValue={trip.endDate} className={inputClass} />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <textarea name="notes" rows={2} maxLength={2000} defaultValue={trip.notes ?? ""} className={inputClass} />
                </Field>
              </div>
            </ActionForm>

            <div className="border-t border-[#163d46]/10 pt-4">
              <h3 className="font-bold text-red-800 text-sm">Delete This Journey</h3>
              <p className="text-xs text-[#566468]">
                Permanently deletes the itinerary plan and recorded expenses. Your saved inspiration items remain untouched.
              </p>
              <ActionForm
                action={deleteTripAction}
                submitLabel="Delete Trip"
                tone="danger"
                confirmText={`Delete “${trip.name}” and all planned activities?`}
                className="mt-3"
              >
                <input type="hidden" name="tripId" value={trip.id} />
              </ActionForm>
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}
