import Link from "next/link";
import { overview } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { Card, when } from "../ui";

export default async function Overview() {
  await requireAdmin();
  const o = overview(getDb());
  const stat = (label: string, value: number, href?: string, warn = false) => (
    <div className={`rounded-xl border p-4 ${warn && value > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-slate-700">{href ? <Link className="underline" href={href}>{label}</Link> : label}</div>
    </div>
  );
  return (
    <>
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Open reports", o.reports.open, "/admin/reports?status=open", true)}
        {stat("Reports in review", o.reports.in_review, "/admin/reports?status=in_review")}
        {stat("Buses awaiting verification", o.services.unverified, "/admin/buses?filter=unverified")}
        {stat("Verified buses", o.services.verified, "/admin/buses?filter=verified")}
        {stat("Demo buses (invented)", o.services.demo, "/admin/buses?filter=demo")}
        {stat("Rejected buses", o.services.rejected, "/admin/buses?filter=rejected")}
        {stat("Verified fares", o.fares.verified)}
        {stat("Unverified fares", o.fares.unverified)}
      </div>

      <Card title="Data sources">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
          {o.services.demo > 0 && <li>{o.services.demo} demo buses with invented timings and fares. Passengers see them labelled “Demo data”.</li>}
          {o.lastImport ? (
            <li>
              Last import: {when(o.lastImport.at)} — {o.lastImport.buses} buses, {o.lastImport.trips} trips, {o.lastImport.stops} stops
              {o.lastImport.skippedProtected ? `, ${o.lastImport.skippedProtected} reviewed buses left untouched` : ""}.
            </li>
          ) : (
            <li>No dataset has been imported.</li>
          )}
          <li>Stops: {o.stops.verified} verified, {o.stops.unverified} unverified, {o.stops.demo} demo.</li>
        </ul>
      </Card>

      <Card title="Recent activity">
        {o.recentActivity.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {o.recentActivity.map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-slate-600">{when(a.at)}</span> · <strong>{a.actor}</strong> {a.action.replace(/_/g, " ")} {a.entityType} <code>{a.entityId}</code>
                {a.note && <span className="text-slate-700"> — {a.note}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm"><Link className="underline" href="/admin/audit">Full history</Link></p>
      </Card>
    </>
  );
}
