"use client";

import { useEffect } from "react";
import { useLang } from "@/components/LanguageProvider";

/** Shown when a page fails while rendering. The details stay in the server log, never on screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLang();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10 text-center">
      <div aria-hidden className="text-5xl">😕</div>
      <h1 className="mt-3 text-2xl font-bold text-brand-900">{t("errorPageTitle")}</h1>
      <p className="mt-2 text-slate-700" role="alert">{t("errorPageBody")}</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700">
          {t("retry")}
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 py-2 font-semibold hover:bg-slate-50">
          {t("backToSearch")}
        </a>
      </div>
    </main>
  );
}
