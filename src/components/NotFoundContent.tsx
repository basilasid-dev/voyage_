"use client";

import Link from "next/link";
import { useLang } from "./LanguageProvider";

export function NotFoundContent() {
  const { t } = useLang();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10 text-center">
      <div aria-hidden className="text-5xl">🚏</div>
      <h1 className="mt-3 text-2xl font-bold text-brand-900">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-slate-700">{t("notFoundBody")}</p>
      <Link href="/" className="mx-auto mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700">
        {t("backToSearch")}
      </Link>
    </main>
  );
}
