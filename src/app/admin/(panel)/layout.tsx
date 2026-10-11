import type { Metadata } from "next";
import Link from "next/link";
import { FlashProvider } from "@/components/admin/Flash";
import { logoutAction } from "../login/actions";
import { requireAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Calicut Bus Guide", robots: { index: false, follow: false } };

const NAV = [
  ["/admin", "Overview"],
  ["/admin/reports", "Reports"],
  ["/admin/buses", "Buses"],
  ["/admin/stops", "Stops"],
  ["/admin/community", "Community"],
  ["/admin/audit", "History"],
] as const;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // pages and actions check again: this is not the only gate
  return (
    <div className="min-h-dvh bg-slate-50">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="font-bold">🚌 Calicut Bus Guide <span className="font-normal text-brand-200">· Admin</span></div>
          <nav aria-label="Admin" className="flex flex-wrap gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-2 hover:bg-white/10">
                {label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="flex items-center gap-3 text-sm">
            <span className="text-brand-200">{admin.actor}</span>
            <button type="submit" className="min-h-10 rounded-lg border border-white/40 px-3 py-1.5 hover:bg-white/10">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="admin-main" className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <FlashProvider>{children}</FlashProvider>
      </main>
    </div>
  );
}
