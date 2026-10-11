import Link from "next/link";
import { updateReportAction } from "../../actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { countReports, listReports, REPORT_KINDS, REPORT_STATUSES, type ReportKind, type ReportStatus } from "@/lib/reports";
import { Card, Field, inputClass, Pager, pageParam, when } from "../../ui";

const KIND_LABEL: Record<ReportKind, string> = { timing: "Wrong time", route: "Wrong route", stop_name: "Stop name", other: "Other" };
const SIZE = 20;

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (REPORT_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as ReportStatus) : sp.status === "all" ? undefined : "active";
  const kind = (REPORT_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as ReportKind) : undefined;
  const page = pageParam(sp.page);
  const db = getDb();
  const counts = countReports(db);
  const rows = listReports(db, { status, kind, limit: SIZE, offset: (page - 1) * SIZE });
  const total = status === "active" ? counts.open + counts.in_review : status ? counts[status] : Object.values(counts).reduce((a, b) => a + b, 0);

  const tabs: [string, string, number | null][] = [
    ["active", "Needs attention", counts.open + counts.in_review],
    ["open", "Open", counts.open],
    ["in_review", "In review", counts.in_review],
    ["resolved", "Resolved", counts.resolved],
    ["dismissed", "Dismissed", counts.dismissed],
    ["all", "All", null],
  ];
  const current = status ?? "all";
  const qs = (s: string) => `/admin/reports?status=${s}${kind ? `&kind=${kind}` : ""}`;

  return (
    <>
      <h1 className="text-2xl font-bold">Passenger reports</h1>
      <nav aria-label="Report status" className="flex flex-wrap gap-2">
        {tabs.map(([key, label, n]) => (
          <Link
            key={key}
            href={qs(key)}
            aria-current={current === key ? "page" : undefined}
            className={`min-h-10 rounded-full border px-4 py-2 text-sm ${current === key ? "border-brand-600 bg-brand-600 text-white" : "bg-white hover:bg-slate-50"}`}
          >
            {label}{n !== null && ` (${n})`}
          </Link>
        ))}
      </nav>
      <nav aria-label="Report type" className="flex flex-wrap gap-2 text-sm">
        <Link href={`/admin/reports?status=${current}`} className={`rounded-full px-3 py-1.5 ${!kind ? "bg-slate-800 text-white" : "bg-white border"}`}>All types</Link>
        {REPORT_KINDS.map((k) => (
          <Link key={k} href={`/admin/reports?status=${current}&kind=${k}`} className={`rounded-full px-3 py-1.5 ${kind === k ? "bg-slate-800 text-white" : "bg-white border"}`}>
            {KIND_LABEL[k]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 && <Card><p className="text-slate-700">No reports here.</p></Card>}
      {rows.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-white">{KIND_LABEL[r.kind]}</span>
            <span className="font-semibold">#{r.id}</span>
            <span className="text-slate-600">{when(r.createdAt)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "open" ? "bg-amber-100 text-amber-900" : r.status === "in_review" ? "bg-sky-100 text-sky-900" : "bg-slate-100 text-slate-700"}`}>
              {r.status.replace("_", " ")}
            </span>
            {r.lang && <span className="text-slate-500">language: {r.lang}</span>}
          </div>
          {r.contextLabel && <p className="mt-2 text-sm text-slate-700">About: {r.contextLabel}</p>}
          <blockquote className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-900">{r.message}</blockquote>
          {r.suggestion && <p className="mt-2 text-sm"><strong>Suggested correction:</strong> {r.suggestion}</p>}
          {r.contact && <p className="mt-1 text-sm"><strong>Contact (given by passenger):</strong> {r.contact}</p>}
          <p className="mt-2 flex flex-wrap gap-4 text-sm">
            {r.serviceId && <Link className="underline" href={`/admin/buses/${encodeURIComponent(r.serviceId)}`}>Open bus</Link>}
            {r.stopId && <Link className="underline" href={`/admin/stops/${encodeURIComponent(r.stopId)}`}>Open stop</Link>}
          </p>
          {r.handledAt && (
            <p className="mt-2 text-sm text-slate-700">
              Last handled by <strong>{r.handledBy}</strong> on {when(r.handledAt)}{r.resolutionNote ? `: ${r.resolutionNote}` : ""}
            </p>
          )}
          <AdminForm action={updateReportAction} submitLabel="Save" className="mt-3 border-t pt-3">
            <input type="hidden" name="reportId" value={r.id} />
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <Field label="Status">
                <select name="status" defaultValue={r.status} className={inputClass}>
                  <option value="open">Open</option>
                  <option value="in_review">In review</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </Field>
              <Field label="Note" hint="Required when resolving or dismissing. What was checked or changed?">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
            </div>
          </AdminForm>
        </Card>
      ))}
      <Pager base={`/admin/reports?status=${current}${kind ? `&kind=${kind}` : ""}`} page={page} total={total} size={SIZE} />
    </>
  );
}
