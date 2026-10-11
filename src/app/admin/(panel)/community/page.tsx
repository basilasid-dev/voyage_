import { moderateCommunityAction } from "../../actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { listForModeration } from "@/lib/voyage/community";
import { Card, Field, inputClass, when } from "../../ui";

export const dynamic = "force-dynamic";

export default async function CommunityModeration() {
  await requireAdmin();
  const items = listForModeration(getDb());
  return (
    <>
      <h1 className="text-2xl font-bold">Community moderation</h1>
      <p className="text-sm text-slate-700">
        Traveller contributions that were reported or hidden. Three different visitors reporting a post hides it automatically until you decide.
        Hide removes it from the public page; Restore publishes it again; Dismiss keeps it published and closes the reports. Every decision is written to the history log.
      </p>
      {items.length === 0 && <Card><p className="text-slate-700">Nothing needs attention.</p></Card>}
      {items.map(({ post, openReports }) => (
        <Card key={post.id}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">#{post.id}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${post.status === "published" ? "bg-amber-100 text-amber-900" : post.status === "hidden" ? "bg-rose-100 text-rose-900" : "bg-sky-100 text-sky-900"}`}>{post.status}</span>
            <span className="text-slate-600">{when(post.createdAt)} · {post.destinationName}{post.placeName ? " · " + post.placeName : ""} · by {post.authorName}</span>
          </div>
          <h2 className="mt-2 text-lg font-bold">{post.title}</h2>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-900">{post.content}</p>
          <p className="mt-2 text-sm text-slate-600">{post.helpfulCount} helpful votes</p>
          {openReports.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-slate-800">
              {openReports.map((r, i) => <li key={i}>{r.reason}{r.details ? ": " + r.details : ""} <span className="text-slate-500">({when(r.createdAt)})</span></li>)}
            </ul>
          )}
          <AdminForm action={moderateCommunityAction} submitLabel="Apply" className="mt-3 border-t pt-3">
            <input type="hidden" name="postId" value={post.id} />
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <Field label="Decision">
                <select name="decision" defaultValue={post.status === "published" ? "dismiss" : "restore"} className={inputClass}>
                  <option value="hide">Hide from the public page</option>
                  <option value="restore">Restore (publish again)</option>
                  <option value="dismiss">Dismiss the reports</option>
                </select>
              </Field>
              <Field label="Reason" hint="Required when hiding.">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
            </div>
          </AdminForm>
        </Card>
      ))}
    </>
  );
}
