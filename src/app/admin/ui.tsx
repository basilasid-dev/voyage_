// Small presentational helpers shared by the admin pages (server components). The admin area is English only.
import Link from "next/link";
import type { DataStatus } from "@/lib/types";

export const inputClass =
  "w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-600">{hint}</span>}
    </label>
  );
}

const STATUS: Record<DataStatus | "rejected", string> = {
  demo: "bg-violet-100 text-violet-900 ring-violet-300",
  unverified: "bg-amber-100 text-amber-900 ring-amber-300",
  verified: "bg-brand-100 text-brand-900 ring-brand-500",
  rejected: "bg-rose-100 text-rose-900 ring-rose-300",
};

export function StatusPill({ status, rejected }: { status: DataStatus; rejected?: boolean }) {
  const s = rejected ? "rejected" : status;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS[s]}`}>{s}</span>;
}

/** 2026-10-12T09:30:00.000Z -> 2026-10-12 09:30 UTC */
export const when = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "—");

/** minutes after midnight -> "07:05" (24:30 = 12:30 am next day) */
export const hhmm = (min: number | null) =>
  min === null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function Card({ title, children, tone }: { title?: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <section className={`rounded-xl border bg-white p-4 shadow-sm ${tone === "warn" ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
      {title && <h2 className="mb-3 text-lg font-bold text-slate-900">{title}</h2>}
      {children}
    </section>
  );
}

export function Pager({ base, page, total, size }: { base: string; page: number; total: number; size: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? <Link className="rounded-lg border px-3 py-2 hover:bg-slate-50" href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-slate-600">Page {page} of {pages} · {total} total</span>
      {page < pages ? <Link className="rounded-lg border px-3 py-2 hover:bg-slate-50" href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}

export const pageParam = (v: string | undefined) => Math.max(1, Math.min(10_000, Number.parseInt(v ?? "1", 10) || 1));
