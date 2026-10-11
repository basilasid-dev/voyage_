"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { translate, type TKey, type Vars } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey, vars?: Vars) => string;
}

const LanguageContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "cbg-lang";
const ENGLISH_ONLY = ["/admin", "/explore", "/saved", "/trips", "/reel-to-travel", "/community", "/my-voyage"];

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [chosen, setLangState] = useState<Lang>("en");
  // The admin area and the travel-planning pages are English only, whatever the bus passenger preference is.
  const path = usePathname() ?? "";
  const lang: Lang = ENGLISH_ONLY.some((p) => path === p || path.startsWith(p + "/")) ? "en" : chosen;

  // Read the saved choice after mount so server and first client render match.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ml") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((k: TKey, vars?: Vars) => translate(lang, k, vars), [lang]);

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used inside LanguageProvider");
  return ctx;
}
