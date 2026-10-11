import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { adminConfig } from "@/lib/admin/auth-core";
import { currentAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  const cfg = adminConfig();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">Admin sign-in</h1>
        <p className="mt-1 text-sm text-slate-600">Calicut Bus Guide · data review</p>
        {cfg.configured ? (
          <div className="mt-6">
            <LoginForm />
          </div>
        ) : (
          <div role="alert" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Admin is turned off.</p>
            <p className="mt-1">{cfg.problem} See the README, section “Admin setup”.</p>
          </div>
        )}
      </div>
    </main>
  );
}
