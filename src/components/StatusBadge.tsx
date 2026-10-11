"use client";

import { statusKey } from "@/lib/i18n";
import type { DataStatus } from "@/lib/types";
import { useLang } from "./LanguageProvider";

export const STATUS_STYLE: Record<DataStatus, { badge: string; strip: string; icon: string }> = {
  demo: {
    badge: "bg-violet-100 text-violet-900 ring-violet-300",
    strip: "border-violet-200 bg-violet-50 text-violet-900",
    icon: "🧪",
  },
  unverified: {
    badge: "bg-amber-100 text-amber-900 ring-amber-300",
    strip: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "⚠️",
  },
  verified: {
    badge: "bg-brand-100 text-brand-900 ring-brand-500",
    strip: "border-brand-200 bg-brand-50 text-brand-900",
    icon: "✅",
  },
};

export function StatusBadge({ status }: { status: DataStatus }) {
  const { t } = useLang();
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status].badge}`}
    >
      <span aria-hidden>{STATUS_STYLE[status].icon}</span>
      {t(statusKey(status))}
    </span>
  );
}
