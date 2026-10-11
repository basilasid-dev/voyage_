"use client";

import { useRouter } from "next/navigation";
import { useContext, useMemo, useState, useTransition } from "react";
import { confirmReelAction, rejectCandidatesAction, type ActionResult } from "@/app/(voyage)/actions";
import { FlashContext } from "./ActionForm";
import type { Candidate } from "@/lib/voyage/reel";

interface Option { id: string; label: string }

const CONFIDENCE: Record<string, { label: string; chip: string; help: string }> = {
  high: { label: "High confidence", chip: "bg-emerald-100 text-emerald-900 ring-emerald-300", help: "The name matches a place we know." },
  medium: { label: "Medium confidence", chip: "bg-amber-100 text-amber-900 ring-amber-300", help: "The author marked it as a place (a pin or a list item)." },
  low: { label: "Low confidence: please check", chip: "bg-rose-100 text-rose-900 ring-rose-300", help: "A guess from the wording. It may not be a place at all." },
};

const field =
  "w-full min-h-11 rounded-xl border border-[#163d46]/25 bg-white px-3 py-2 text-base text-[#243238] outline-none transition focus:border-[#163d46] focus:ring-2 focus:ring-[#a8d9df]/60";

/**
 * Review step: every place found is its own card. Tick the ones you want, correct the name, category, destination or
 * notes, choose a collection and tags, and save. Nothing is saved until you press the button.
 */
export function CandidateReview({
  captureId,
  candidates,
  destinations,
  categories,
  collections,
  defaultDestination,
}: {
  captureId: number;
  candidates: Candidate[];
  destinations: Option[];
  categories: Option[];
  collections: Option[];
  defaultDestination: string | null;
}) {
  const router = useRouter();
  const flash = useContext(FlashContext);
  const [pending, startTransition] = useTransition();
  const open = useMemo(() => candidates.filter((c) => c.status === "suggested"), [candidates]);
  // High and medium confidence start ticked; low-confidence guesses start unticked so nothing doubtful is saved by accident.
  const [picked, setPicked] = useState<Set<number>>(() => new Set(open.filter((c) => c.confidence !== "low").map((c) => c.id)));
  const [result, setResult] = useState<ActionResult>(null);

  if (open.length === 0) return null;

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function submit(action: typeof confirmReelAction, form: HTMLFormElement) {
    const data = new FormData(form);
    data.set("captureId", String(captureId));
    data.delete("pick");
    for (const id of picked) data.append("pick", String(id));
    startTransition(async () => {
      let res: ActionResult;
      try {
        res = await action(null, data);
      } catch {
        res = { ok: false, message: "Something went wrong. Nothing was changed. Check your connection and try again." };
      }
      setResult(res);
      flash(res);
      if (res?.ok) router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(confirmReelAction, e.currentTarget);
      }}
      className="space-y-5"
    >
      <fieldset className="space-y-3">
        <legend className="sr-only">Places found</legend>
        {open.map((c) => {
          const conf = CONFIDENCE[c.confidence];
          const on = picked.has(c.id);
          return (
            <div key={c.id} className={`rounded-2xl border bg-white p-4 shadow-xs transition sm:p-5 ${on ? "border-[#163d46]/40 ring-2 ring-[#a8d9df]/50" : "border-[#163d46]/15"}`}>
              <div className="flex items-start gap-3">
                <input
                  id={"pick-" + c.id}
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(c.id)}
                  className="mt-1 h-6 w-6 shrink-0 accent-[#163d46]"
                  aria-label={"Save " + c.name}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${conf.chip}`}>{conf.label}</span>
                    {c.matchedPlaceId && <span className="rounded-full bg-[#e4f4f7] px-2.5 py-0.5 text-xs font-semibold text-[#163d46]">In our guide</span>}
                    {c.saved && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-[#243238]">Already saved</span>}
                  </div>
                  <p className="mt-1 text-xs text-[#566468]">{conf.help}</p>
                  {c.evidence && <blockquote className="mt-2 border-l-4 border-[#a8d9df] bg-[#f8f5ef] px-3 py-2 text-xs text-[#243238]">{c.evidence}</blockquote>}

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block sm:col-span-3">
                      <span className="mb-1 block text-sm font-semibold text-[#243238]">Place name</span>
                      <input name={"name_" + c.id} defaultValue={c.name} maxLength={120} className={field} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-[#243238]">Category</span>
                      <select name={"category_" + c.id} defaultValue={c.category} className={field}>
                        {categories.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-[#243238]">Destination</span>
                      <select name={"dest_" + c.id} defaultValue={c.destinationId ?? defaultDestination ?? ""} className={field}>
                        <option value="">Not sure yet</option>
                        {destinations.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="block sm:col-span-1">
                      <span className="mb-1 block text-sm font-semibold text-[#243238]">Your note (optional)</span>
                      <input name={"notes_" + c.id} maxLength={300} className={field} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className="rounded-2xl border border-[#163d46]/15 bg-white p-4 sm:p-5">
        <h3 className="editorial-title text-lg font-bold text-[#163d46]">Keep them together</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[#243238]">Add to collection</span>
            <select name="collectionId" defaultValue="" className={field}>
              <option value="">No collection</option>
              {collections.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[#243238]">…or start a new one</span>
            <input name="newCollection" maxLength={40} placeholder="e.g. Istanbul food" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[#243238]">Tags (optional)</span>
            <input name="tags" maxLength={120} placeholder="sunset, street food" className={field} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || picked.size === 0}
            className="min-h-12 rounded-xl bg-[#163d46] px-6 text-sm font-bold text-white shadow-md transition hover:bg-[#0f2a30] disabled:opacity-50"
          >
            {pending ? "Saving…" : `Save ${picked.size} selected place${picked.size === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            disabled={pending || picked.size === 0}
            onClick={(e) => {
              const form = e.currentTarget.form;
              if (form && window.confirm("Remove the selected places from this list? You can always add them again by hand.")) submit(rejectCandidatesAction as unknown as typeof confirmReelAction, form);
            }}
            className="min-h-12 rounded-xl border border-[#163d46]/25 bg-white px-5 text-sm font-semibold text-[#163d46] hover:bg-[#f8f5ef] disabled:opacity-50"
          >
            Not places: remove selected
          </button>
          {result && <p role="status" className={`text-sm font-semibold ${result.ok ? "text-emerald-800" : "text-rose-800"}`}>{result.message}</p>}
        </div>
      </div>
    </form>
  );
}
