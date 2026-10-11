"use client";

import { formatDuration, formatTime, statusLongKey, stopName } from "@/lib/i18n";
import type { DataStatus, Fare, Journey, Leg, Stop } from "@/lib/types";
import { useLang } from "./LanguageProvider";
import type { ReportContext } from "./ReportDialog";
import { StatusBadge, STATUS_STYLE } from "./StatusBadge";

/** `sameAs`: skip the status badge when the bus right next to it already shows the same status. */
function FareChip({ fare, sameAs }: { fare: Fare | null; sameAs?: DataStatus }) {
  const { t } = useLang();
  if (!fare) {
    return (
      <span title={t("fareUnavailableHint")} className="text-sm italic text-slate-500">
        {t("fareUnavailable")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-lg font-bold text-slate-900">₹{fare.amountInr}</span>
      {fare.dataStatus !== sameAs && <StatusBadge status={fare.dataStatus} />}
    </span>
  );
}

function Stopover({ time, name, caption, end }: { time: number; name: string; caption: string; end?: boolean }) {
  return (
    <li className="relative pb-4 pl-7 last:pb-0">
      {!end && <span aria-hidden className="absolute left-[5px] top-4 h-full w-0.5 bg-brand-200" />}
      <span
        aria-hidden
        className={`absolute left-0 top-1.5 h-3 w-3 ${
          end ? "rounded-sm bg-rose-600" : "rounded-full border-[3px] border-brand-600 bg-white"
        }`}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{caption}</div>
          <div className="truncate font-semibold">{name}</div>
        </div>
        <div className="shrink-0 text-base font-bold tabular-nums text-brand-700">{formatTime(time)}</div>
      </div>
    </li>
  );
}

function LegBlock({
  leg, stops, index, multi, onReport,
}: {
  leg: Leg; stops: Record<string, Stop>; index: number; multi: boolean; onReport: (c: ReportContext) => void;
}) {
  const { lang, t } = useLang();
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {multi && (
          <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-xs font-bold text-white">
            {t("leg")} {index + 1}
          </span>
        )}
        <span className="font-semibold">{leg.serviceName}</span>
        {leg.vehicleNumber && (
          <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">
            {leg.vehicleNumber}
          </span>
        )}
        <StatusBadge status={leg.dataStatus} />
      </div>
      <ol>
        <Stopover time={leg.departureMin} name={stopName(stops[leg.fromStopId], lang)} caption={t("board")} />
        <Stopover time={leg.arrivalMin} name={stopName(stops[leg.toStopId], lang)} caption={t("alight")} end />
      </ol>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>
          {formatDuration(leg.arrivalMin - leg.departureMin, lang)} · {leg.stopsCount}{" "}
          {t(leg.stopsCount === 1 ? "stopOne" : "stopsCount")}
        </span>
        {multi && <FareChip fare={leg.fare} sameAs={leg.dataStatus} />}
      </div>
      <button
        type="button"
        onClick={() =>
          onReport({
            kind: "timing",
            label: `${leg.serviceName} · ${stopName(stops[leg.fromStopId], lang)} → ${stopName(stops[leg.toStopId], lang)} · ${formatTime(leg.departureMin)}`,
            serviceId: leg.serviceId,
            tripId: leg.tripId,
            fromStopId: leg.fromStopId,
            toStopId: leg.toStopId,
          })
        }
        className="mt-2 inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
      >
        🚩 {t("reportTimingShort")}
      </button>
    </div>
  );
}

export function JourneyCard({ journey, stops, onReport }: { journey: Journey; stops: Record<string, Stop>; onReport: (c: ReportContext) => void }) {
  const { lang, t } = useLang();
  const multi = journey.legs.length > 1;
  const first = journey.legs[0];
  const last = journey.legs[journey.legs.length - 1];
  const statuses = [...new Set(journey.legs.map((l) => l.dataStatus))] as DataStatus[];
  // For a single bus the fare belongs to the bus; for a transfer we show the total.
  const hasTotal = journey.totalFareInr !== null;

  return (
    <article
      data-journey={multi ? "transfer" : "direct"}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <header className="flex items-center justify-between gap-3 bg-brand-50 px-4 py-3">
        <div>
          <div className="whitespace-nowrap text-base font-bold tabular-nums text-brand-900 sm:text-lg">
            {formatTime(first.departureMin)} <span className="text-brand-500">→</span> {formatTime(last.arrivalMin)}
          </div>
          <div className="text-sm text-slate-600">
            {formatDuration(last.arrivalMin - first.departureMin, lang)}
            {multi && ` · ${t("changeAt")} ${stopName(stops[journey.transferStopId ?? ""], lang)}`}
          </div>
        </div>
        <div className="text-right">
          {multi ? (
            hasTotal ? (
              <div>
                <div className="text-xs text-slate-500">{t("totalFare")}</div>
                <div className="text-lg font-bold">₹{journey.totalFareInr}</div>
              </div>
            ) : (
              <span className="text-sm italic text-slate-500">{t("totalFareUnavailable")}</span>
            )
          ) : (
            <FareChip fare={first.fare} sameAs={first.dataStatus} />
          )}
        </div>
      </header>

      <div className="space-y-3 p-4">
        {journey.legs.map((leg, i) => (
          <div key={leg.tripId}>
            {i > 0 && (
              <div className="my-3 flex items-center gap-2 rounded-lg border border-dashed border-brand-300 bg-white px-3 py-2 text-sm text-brand-900">
                <span aria-hidden>🔁</span>
                <span>
                  {t("changeAt")} <strong>{stopName(stops[journey.transferStopId ?? ""], lang)}</strong> · {t("wait")}{" "}
                  {formatDuration(journey.waitMin ?? 0, lang)}
                </span>
              </div>
            )}
            <LegBlock leg={leg} stops={stops} index={i} multi={multi} onReport={onReport} />
          </div>
        ))}
      </div>

      <footer className="space-y-1 px-4 pb-4">
        {statuses.map((s) => {
          const verifiedLeg = s === "verified" ? journey.legs.find((l) => l.dataStatus === "verified" && l.verifiedAt) : undefined;
          return (
            <p key={s} className={`rounded-lg border px-3 py-2 text-xs ${STATUS_STYLE[s].strip}`}>
              <span aria-hidden>{STATUS_STYLE[s].icon} </span>
              {t(statusLongKey(s))}
              {verifiedLeg && (
                <>
                  {" "}
                  {t("verifiedOn", { date: verifiedLeg.verifiedAt!.slice(0, 10), source: verifiedLeg.verifiedSource ?? "—" })}
                </>
              )}
            </p>
          );
        })}
        {journey.legs.map((l) =>
          l.fare?.dataStatus === "verified" && l.fare.verifiedAt ? (
            <p key={`f-${l.tripId}`} className={`rounded-lg border px-3 py-2 text-xs ${STATUS_STYLE.verified.strip}`}>
              <span aria-hidden>✅ </span>
              {t("fareVerifiedOn", { date: l.fare.verifiedAt.slice(0, 10), source: l.fare.verifiedSource ?? "—" })}
            </p>
          ) : null,
        )}
      </footer>
    </article>
  );
}
