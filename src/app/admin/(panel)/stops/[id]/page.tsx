import Link from "next/link";
import { notFound } from "next/navigation";
import { renameStopAction, verifyStopAction } from "../../../actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { listAudit } from "@/lib/admin/audit";
import { getStopDetail } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { listReports } from "@/lib/reports";
import { Card, Field, inputClass, StatusPill, when } from "../../../ui";

export default async function StopDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const db = getDb();
  const s = getStopDetail(db, id);
  if (!s) notFound();
  const reports = listReports(db, { stopId: id, limit: 20 });
  const history = listAudit(db, { entityType: "stop", entityId: id, limit: 30 });
  const isDemo = s.dataStatus === "demo";
  const hidden = <input type="hidden" name="stopId" value={s.id} />;
  return (
    <>
      <p><Link className="text-sm underline" href="/admin/stops">← All stops</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{s.nameEn}</h1>
        <StatusPill status={s.dataStatus} />
      </div>

      <Card title="Source and verification">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
          <dt className="font-medium">Data source</dt><dd>{s.source ?? "—"}</dd>
          <dt className="font-medium">Verified</dt>
          <dd>{s.dataStatus === "verified" ? <>{when(s.verifiedAt)} by <strong>{s.verifiedBy ?? "unknown"}</strong>, against: {s.verifiedSource ?? "—"}</> : "Not verified"}</dd>
          <dt className="font-medium">Last review note</dt><dd>{s.reviewNote ?? "—"}</dd>
          <dt className="font-medium">Last changed by an admin</dt><dd>{when(s.updatedAt)}</dd>
          <dt className="font-medium">Used by trips</dt><dd>{s.tripCount}</dd>
        </dl>
      </Card>

      {isDemo ? (
        <Card tone="warn"><p className="text-sm text-amber-900"><strong>Demo data.</strong> Demo stops cannot be edited or verified.</p></Card>
      ) : (
        <Card title="Correct the name">
          <AdminForm action={renameStopAction} submitLabel="Save name">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="English name"><input name="nameEn" required minLength={2} maxLength={80} defaultValue={s.nameEn} className={inputClass} /></Field>
              <Field label="Malayalam name (optional)"><input name="nameMl" maxLength={80} defaultValue={s.nameMl ?? ""} lang="ml" className={inputClass} /></Field>
            </div>
            <Field label="Why (optional)" hint="For example: passenger report #12. Saving a change withdraws verification of this stop."><input name="note" maxLength={500} className={inputClass} /></Field>
          </AdminForm>
        </Card>
      )}

      {!isDemo && s.dataStatus !== "verified" && (
        <Card title="Verify this stop name">
          <AdminForm action={verifyStopAction} submitLabel="Mark verified" confirmText="Mark this stop name as verified?">
            {hidden}
            <Field label="Verified against" hint="For example: bus stand signboard, photographed 2026-10-12."><input name="source" required minLength={3} maxLength={300} className={inputClass} /></Field>
            <Field label="Note (optional)"><input name="note" maxLength={500} className={inputClass} /></Field>
          </AdminForm>
        </Card>
      )}

      <Card title={`Passenger reports (${reports.length})`}>
        {reports.length === 0 ? <p className="text-sm text-slate-600">None.</p> : (
          <ul className="space-y-2 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="rounded border p-2">
                <span className="font-semibold">#{r.id}</span> · {r.status.replace("_", " ")} · {when(r.createdAt)}
                <p className="whitespace-pre-wrap">{r.message}</p>
                {r.suggestion && <p><strong>Suggested:</strong> {r.suggestion}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="History">
        {history.length === 0 ? <p className="text-sm text-slate-600">No admin changes yet.</p> : (
          <ul className="divide-y text-sm">
            {history.map((a) => <li key={a.id} className="py-2">{when(a.at)} · <strong>{a.actor}</strong> {a.action}{a.note && ` — ${a.note}`}</li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
