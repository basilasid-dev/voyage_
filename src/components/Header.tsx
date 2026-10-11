"use client";

import Link from "next/link";
import { useLang } from "./LanguageProvider";
import type { Lang } from "@/lib/types";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "ml", label: "മലയാളം" },
  { value: "en", label: "English" },
];

export function Header() {
  const { lang, setLang, t } = useLang();
  return (
    <header className="bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 pb-20 pt-4 text-white">
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-brand-900 focus:shadow-lg"
      >
        {t("skipToResults")}
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-md"
          >
            🚌
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight sm:text-2xl">{t("appName")}</h1>
            <p className="hidden text-sm text-brand-100 sm:block">{t("tagline")}</p>
          </div>
        </div>
        <div
          role="group"
          aria-label={t("language")}
          className="flex shrink-0 rounded-full bg-black/20 p-1 text-sm ring-1 ring-white/20"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setLang(o.value)}
              aria-pressed={lang === o.value}
              lang={o.value}
              className={`min-h-10 rounded-full px-3 py-1.5 text-sm font-semibold transition sm:text-base ${
                lang === o.value ? "bg-white text-brand-700 shadow" : "text-white/90 hover:bg-white/10"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-6xl px-4 text-sm text-brand-100 sm:hidden">{t("tagline")}</p>
      {/* Link to the separate travel-planning pages (English only). */}
      <nav aria-label="Voyage travel planner" lang="en" className="mx-auto mt-2 max-w-6xl px-4">
        <Link
          href="/explore"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/25"
        >
          <span aria-hidden>🧭</span> Voyage: explore, save ideas &amp; plan trips →
        </Link>
      </nav>
    </header>
  );
}
