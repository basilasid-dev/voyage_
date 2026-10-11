import Link from "next/link";
import { listServices, type ServiceFilter } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { inputClass, Pager, pageParam, StatusPill, when } from "../../ui";

const FILTERS: [ServiceFilter, string][] = [
  ["all", "All"],
  ["reported", "Has open reports"],
  ["unverified", "Unverified"],
  ["verified", "Verified"],
  ["demo", "Demo"],
  ["rejected", "Rejected"],
];
const SIZE = 25;

export default async function Buses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = (FILTERS.map(([f]) => f) as string[]).includes(sp.filter ?? "") ? (sp.filter as ServiceFilter) : "all";
  const q = (sp.q ?? "").slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total } = listServices(getDb(), { filter, q, limit: SIZE, offset: (page - 1) * SIZE });
  const base = `/admin/buses?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <h1 className="text-2xl font-bold">Buses and schedules</h1>
      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {FILTERS.map(([f, label]) => (
          <Link key={f} href={`/admin/buses?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={filter === f ? "page" : undefined}
            className={`min-h-10 rounded-full border px-4 py-2 text-sm ${filter === f ? "border-brand-600 bg-brand-600 text-white" : "bg-white hover:bg-slate-50"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <form action="/admin/buses" className="flex gap-2" role="search">
        <input type="hidden" name="filter" value={filter} />
        <label className="sr-only" htmlFor="bus-q">Search buses</label>
        <input id="bus-q" name="q" defaultValue={q} placeholder="Name or vehicle number" maxLength={80} className={inputClass} />
        <button className="min-h-11 rounded-lg bg-slate-800 px-4 text-white">Search</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Buses</caption>
          <thead className="bg-slate-100 text-slate-700">
            <tr><th scope="col" className="p-3">Bus</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Trips</th><th scope="col" className="p-3">Open reports</th><th scope="col" className="p-3">Verified</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-600">No buses match.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="p-3"><Link className="font-medium text-brand-700 underline" href={`/admin/buses/${encodeURIComponent(s.id)}`}>{s.name}</Link>{s.locked && <span title="Reviewed or edited by a person; re-imports leave it alone" className="ml-2 text-xs text-slate-500">🔒</span>}</td>
                <td className="p-3"><StatusPill status={s.dataStatus} rejected={!!s.rejectedAt} /></td>
                <td className="p-3 tabular-nums">{s.tripCount}</td>
                <td className="p-3 tabular-nums">{s.openReports > 0 ? <strong className="text-amber-800">{s.openReports}</strong> : 0}</td>
                <td className="p-3">{when(s.verifiedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager base={base} page={page} total={total} size={SIZE} />
    </>
  );
}
