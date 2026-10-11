"use client";

import { UPSTREAM_DATASET } from "@/lib/data-sources";
import type { DataInfo } from "@/lib/types";
import { useLang } from "./LanguageProvider";

/** Where the data comes from and when it was loaded. ISO dates are shown as-is (no timezone surprises). */
export function DataInfoPanel({ info }: { info: DataInfo }) {
  const { t } = useLang();
  const { services, imported } = info;
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white text-sm shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold text-brand-900">
        <span>ℹ️ {t("dataTitle")}</span>
        <span aria-hidden className="text-slate-400 transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-slate-700">
        {services.demo > 0 && <p>🧪 {t("dataDemo", { n: services.demo })}</p>}
        {services.unverified > 0 && (
          <div>
            <p>
              ⚠️ {t("dataImported", { n: services.unverified })}{" "}
              {imported && t("dataImportedAt", { date: imported.at.slice(0, 10) })}
            </p>
            <p className="mt-1 text-slate-600">{t("dataUpstream", { date: UPSTREAM_DATASET.lastUpdated })}</p>
            <p className="mt-1 text-slate-600">
              {t("dataSource")}:{" "}
              <a className="text-brand-700 underline" href={UPSTREAM_DATASET.url} target="_blank" rel="noreferrer">
                {UPSTREAM_DATASET.name}
              </a>
              {UPSTREAM_DATASET.licence === null && <> · {t("dataNoLicence")}</>}
            </p>
          </div>
        )}
        {services.verified > 0 && <p>✅ {t("dataVerified", { n: services.verified })}</p>}
        <p className="text-slate-600">{t("dataFares")}</p>
        <p className="text-slate-600">{t("timetableOnly")}</p>
      </div>
    </details>
  );
}
