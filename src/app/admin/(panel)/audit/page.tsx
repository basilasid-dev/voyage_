import { listAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { Card, Pager, pageParam, when } from "../../ui";

const SIZE = 50;

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const page = pageParam((await searchParams).page);
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n;
  const rows = listAudit(db, { limit: SIZE, offset: (page - 1) * SIZE });
  return (
    <>
      <h1 className="text-2xl font-bold">History of changes</h1>
      <p className="text-sm text-slate-700">Every admin action, newest first. This log cannot be edited from the app.</p>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-slate-600">Nothing yet.</p> : (
          <ul className="divide-y text-sm">
            {rows.map((a) => (
              <li key={a.id} className="py-3">
                <div>{when(a.at)} · <strong>{a.actor}</strong> · {a.action.replace(/_/g, " ")} · {a.entityType} <code>{a.entityId}</code></div>
                {a.note && <div className="text-slate-700">Note: {a.note}</div>}
                {(a.before || a.after) && (
                  <details className="mt-1"><summary className="cursor-pointer text-slate-600">Details</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{`before: ${a.before ?? "—"}\nafter:  ${a.after ?? "—"}`}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pager base="/admin/audit" page={page} total={total} size={SIZE} />
    </>
  );
}
