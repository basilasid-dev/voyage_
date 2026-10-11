import Link from "next/link";
import { listStopsAdmin } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { inputClass, Pager, pageParam, StatusPill, when } from "../../ui";

const SIZE = 30;

export default async function Stops({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total } = listStopsAdmin(getDb(), { q, limit: SIZE, offset: (page - 1) * SIZE });
  return (
    <>
      <h1 className="text-2xl font-bold">Stops</h1>
      <form action="/admin/stops" className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="stop-q">Search stops</label>
        <input id="stop-q" name="q" defaultValue={q} placeholder="Stop name" maxLength={80} className={inputClass} />
        <button className="min-h-11 rounded-lg bg-slate-800 px-4 text-white">Search</button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">Stops</caption>
          <thead className="bg-slate-100 text-slate-700">
            <tr><th scope="col" className="p-3">Stop</th><th scope="col" className="p-3">Malayalam</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Trips</th><th scope="col" className="p-3">Open reports</th><th scope="col" className="p-3">Verified</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-600">No stops match.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="p-3"><Link className="font-medium text-brand-700 underline" href={`/admin/stops/${encodeURIComponent(s.id)}`}>{s.nameEn}</Link></td>
                <td className="p-3">{s.nameMl ?? "—"}</td>
                <td className="p-3"><StatusPill status={s.dataStatus} /></td>
                <td className="p-3 tabular-nums">{s.tripCount}</td>
                <td className="p-3 tabular-nums">{s.openReports > 0 ? <strong className="text-amber-800">{s.openReports}</strong> : 0}</td>
                <td className="p-3">{when(s.verifiedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager base={`/admin/stops?q=${encodeURIComponent(q)}`} page={page} total={total} size={SIZE} />
    </>
  );
}
