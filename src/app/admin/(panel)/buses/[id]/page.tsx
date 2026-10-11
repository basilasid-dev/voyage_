import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addFareAction, rejectFareAction, rejectServiceAction, restoreServiceAction, unverifyServiceAction,
  updateTripTimesAction, verifyFareAction, verifyServiceAction,
} from "../../../actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { listAuditForService } from "@/lib/admin/audit";
import { getServiceDetail } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { listReports } from "@/lib/reports";
import { Card, Field, hhmm, inputClass, StatusPill, when } from "../../../ui";

export default async function BusDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const db = getDb();
  const d = getServiceDetail(db, id);
  if (!d) notFound();
  const { service: s, trips, fares } = d;
  const reports = listReports(db, { serviceId: id, limit: 20 });
  const history = listAuditForService(db, id);
  const stopOptions = [...new Map(trips.flatMap((t) => t.stops).map((x) => [x.stopId, x.stopName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const hidden = <input type="hidden" name="serviceId" value={s.id} />;
  const isDemo = s.dataStatus === "demo";

  return (
    <>
      <p><Link className="text-sm underline" href="/admin/buses">← All buses</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{s.name}</h1>
        <StatusPill status={s.dataStatus} rejected={!!s.rejectedAt} />
        {s.vehicleNumber && <code className="rounded border bg-white px-2 py-0.5 text-sm">{s.vehicleNumber}</code>}
      </div>

      <Card title="Source and verification">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
          <dt className="font-medium">Data source</dt><dd>{s.source ?? "—"}</dd>
          <dt className="font-medium">Verified</dt>
          <dd>{s.dataStatus === "verified" ? <>{when(s.verifiedAt)} by <strong>{s.verifiedBy ?? "unknown"}</strong>, against: {s.verifiedSource ?? "—"}</> : "Not verified"}</dd>
          <dt className="font-medium">Last review note</dt><dd>{s.reviewNote ?? "—"}</dd>
          <dt className="font-medium">Last changed by an admin</dt><dd>{when(s.updatedAt)}</dd>
          {s.rejectedAt && (<><dt className="font-medium">Rejected</dt><dd>{when(s.rejectedAt)} by {s.rejectedBy}</dd></>)}
          <dt className="font-medium">Protected from re-import</dt><dd>{s.locked ? "Yes (a person has reviewed or edited it)" : "No"}</dd>
        </dl>
      </Card>

      {isDemo && (
        <Card tone="warn">
          <p className="text-sm text-amber-900"><strong>Demo data.</strong> These timings and fares are invented samples. They cannot be verified or edited; replace them by importing or entering real data, then reject (hide) the demo bus.</p>
        </Card>
      )}

      <Card title="Decision">
        <div className="grid gap-6 lg:grid-cols-2">
          {s.rejectedAt ? (
            <AdminForm action={restoreServiceAction} submitLabel="Restore as unverified" tone="neutral">
              {hidden}
              <Field label="Note (optional)"><input name="note" maxLength={500} className={inputClass} /></Field>
            </AdminForm>
          ) : (
            <>
              {!isDemo && s.dataStatus !== "verified" && (
                <AdminForm action={verifyServiceAction} submitLabel="Approve (mark verified)" confirmText="Mark this whole bus schedule as verified? Passengers will see it as Verified.">
                  {hidden}
                  <Field label="Verified against" hint="What did you check it against? For example: operator timetable photographed 2026-10-12.">
                    <input name="source" required minLength={3} maxLength={300} className={inputClass} />
                  </Field>
                  <Field label="Note (optional)"><input name="note" maxLength={500} className={inputClass} /></Field>
                </AdminForm>
              )}
              {s.dataStatus === "verified" && (
                <AdminForm action={unverifyServiceAction} submitLabel="Withdraw verification" tone="neutral">
                  {hidden}
                  <Field label="Reason" hint="For example: operator changed the timetable."><input name="note" required minLength={3} maxLength={500} className={inputClass} /></Field>
                </AdminForm>
              )}
              <AdminForm action={rejectServiceAction} submitLabel="Reject (hide from passengers)" tone="danger" confirmText="Hide this bus from passengers? Its data and history are kept.">
                {hidden}
                <Field label="Reason"><input name="reason" required minLength={3} maxLength={500} className={inputClass} /></Field>
              </AdminForm>
            </>
          )}
        </div>
      </Card>

      <Card title={`Trips (${trips.length})`}>
        {trips.length === 0 && <p className="text-sm text-slate-600">No trips.</p>}
        <div className="space-y-2">
          {trips.map((t) => (
            <details key={t.id} className="rounded-lg border">
              <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium">
                Trip {t.tripNo ?? t.id}: {t.stops[0]?.stopName} {hhmm(t.stops[0]?.departureMin ?? t.stops[0]?.arrivalMin ?? null)} → {t.stops[t.stops.length - 1]?.stopName} {hhmm(t.stops[t.stops.length - 1]?.arrivalMin ?? t.stops[t.stops.length - 1]?.departureMin ?? null)}
              </summary>
              <div className="border-t p-3">
                {isDemo ? (
                  <ul className="text-sm">{t.stops.map((x) => <li key={x.seq}>{x.stopName}: {hhmm(x.arrivalMin) || "—"} / {hhmm(x.departureMin) || "—"}</li>)}</ul>
                ) : (
                  <AdminForm action={updateTripTimesAction} submitLabel="Save times" tone="primary">
                    {hidden}
                    <input type="hidden" name="tripId" value={t.id} />
                    <p className="text-xs text-slate-600">24-hour HH:MM. Use 24:30 for 12:30 am the next day. Saving changes withdraws verification.</p>
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-slate-600"><th scope="col" className="py-1">Stop</th><th scope="col">Arrives</th><th scope="col">Departs</th></tr></thead>
                      <tbody>
                        {t.stops.map((x) => (
                          <tr key={x.seq}>
                            <th scope="row" className="py-1 pr-2 text-left font-normal">{x.stopName}</th>
                            <td className="pr-2"><input aria-label={`${x.stopName} arrival`} name={`arr_${x.seq}`} defaultValue={hhmm(x.arrivalMin)} placeholder="HH:MM" inputMode="numeric" pattern="\d{1,2}:\d{2}|" className={`${inputClass} w-28`} /></td>
                            <td><input aria-label={`${x.stopName} departure`} name={`dep_${x.seq}`} defaultValue={hhmm(x.departureMin)} placeholder="HH:MM" inputMode="numeric" pattern="\d{1,2}:\d{2}|" className={`${inputClass} w-28`} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Field label="Why (optional)"><input name="note" maxLength={500} className={inputClass} /></Field>
                  </AdminForm>
                )}
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card title="Fares">
        <p className="mb-3 text-sm text-slate-700">Fares are only ever entered here from a real source. The app never calculates or estimates one.</p>
        {fares.length === 0 ? <p className="text-sm text-slate-600">No fares recorded for this bus.</p> : (
          <ul className="space-y-3">
            {fares.map((f) => (
              <li key={f.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{f.fromName} → {f.toName}: ₹{f.amountInr}</strong>
                  <StatusPill status={f.dataStatus} rejected={!!f.rejectedAt} />
                </div>
                <div className="text-slate-600">Source: {f.source ?? "—"}{f.verifiedAt && <> · verified {when(f.verifiedAt)} against {f.verifiedSource}</>}</div>
                {!f.rejectedAt && (
                  <div className="mt-2 grid gap-4 md:grid-cols-2">
                    {f.dataStatus === "unverified" && (
                      <AdminForm action={verifyFareAction} submitLabel="Verify fare">
                        {hidden}<input type="hidden" name="fareId" value={f.id} />
                        <Field label="Verified against"><input name="source" required minLength={3} maxLength={300} className={inputClass} /></Field>
                      </AdminForm>
                    )}
                    <AdminForm action={rejectFareAction} submitLabel="Reject fare" tone="danger" confirmText="Remove this fare from passenger results?">
                      {hidden}<input type="hidden" name="fareId" value={f.id} />
                      <Field label="Reason"><input name="reason" required minLength={3} maxLength={500} className={inputClass} /></Field>
                    </AdminForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!isDemo && !s.rejectedAt && (
          <details className="mt-4 rounded-lg border">
            <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium">Record a fare</summary>
            <div className="border-t p-3">
              <AdminForm action={addFareAction} submitLabel="Add fare">
                {hidden}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="From stop"><select name="fromStopId" required defaultValue="" className={inputClass}><option value="" disabled>Select a stop</option>{stopOptions.map(([sid, n]) => <option key={sid} value={sid}>{n}</option>)}</select></Field>
                  <Field label="To stop"><select name="toStopId" required defaultValue="" className={inputClass}><option value="" disabled>Select a stop</option>{stopOptions.map(([sid, n]) => <option key={sid} value={sid}>{n}</option>)}</select></Field>
                  <Field label="Fare (₹, whole rupees)"><input name="amountInr" type="number" min={1} max={2000} step={1} required className={inputClass} /></Field>
                  <Field label="Where did this fare come from?" hint="Required. For example: told by the conductor on 2026-10-12."><input name="source" required minLength={3} maxLength={300} className={inputClass} /></Field>
                </div>
                <Field label="Verified against (leave empty if not verified yet)" hint="Fill this only if you checked the amount against an official source."><input name="verifiedSource" maxLength={300} className={inputClass} /></Field>
              </AdminForm>
            </div>
          </details>
        )}
      </Card>

      <Card title={`Passenger reports (${reports.length})`}>
        {reports.length === 0 ? <p className="text-sm text-slate-600">None.</p> : (
          <ul className="space-y-2 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="rounded border p-2">
                <span className="font-semibold">#{r.id}</span> · {r.kind.replace("_", " ")} · {r.status.replace("_", " ")} · {when(r.createdAt)}
                <p className="whitespace-pre-wrap">{r.message}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm"><Link className="underline" href="/admin/reports">All reports</Link></p>
      </Card>

      <Card title="History">
        {history.length === 0 ? <p className="text-sm text-slate-600">No admin changes yet.</p> : (
          <ul className="divide-y text-sm">
            {history.map((a) => (
              <li key={a.id} className="py-2">
                {when(a.at)} · <strong>{a.actor}</strong> {a.action.replace(/_/g, " ")} ({a.entityType} {a.entityId}){a.note && ` — ${a.note}`}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
