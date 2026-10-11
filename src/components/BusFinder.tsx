"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime, statusKey, stopName } from "@/lib/i18n";
import { similarStops, stopLabels } from "@/lib/stop-match";
import type { DataInfo, SearchResult, Stop } from "@/lib/types";
import { DataInfoPanel } from "./DataInfoPanel";
import { JourneyCard } from "./JourneyCard";
import { useLang } from "./LanguageProvider";
import { ReportDialog, type ReportContext } from "./ReportDialog";
import { StopPicker } from "./StopPicker";

type FailKind = "generic" | "offline" | "stops";
type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; why: FailKind }
  | { kind: "done"; result: SearchResult; after: string };

interface Query {
  from: string;
  to: string;
  after: string;
}

const card = "rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200 sm:p-5";

export function BusFinder({ stops, info }: { stops: Stop[]; info: DataInfo }) {
  const { lang, t } = useLang();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [after, setAfter] = useState(""); // optional "HH:MM"
  const [formError, setFormError] = useState<"pickBoth" | "sameStop" | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [reportCtx, setReportCtx] = useState<ReportContext | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);

  const byId = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const labels = useMemo(
    () => stopLabels(stops, lang, (s) => t(statusKey(s.dataStatus))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, lang],
  );
  const hasDemo = stops.some((s) => s.dataStatus === "demo");

  async function runSearch(q: Query) {
    if (!q.from || !q.to) return setFormError("pickBoth");
    if (q.from === q.to) return setFormError("sameStop");
    setFormError(null);
    setState({ kind: "loading" });
    const id = ++requestId.current;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    try {
      const qs = new URLSearchParams({ from: q.from, to: q.to });
      if (q.after) qs.set("after", q.after);
      const res = await fetch(`/api/search?${qs}`);
      if (id !== requestId.current) return; // a newer search replaced this one
      if (res.status === 404 || res.status === 400) return setState({ kind: "error", why: "stops" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as SearchResult;
      if (id !== requestId.current) return;
      setState({ kind: "done", result, after: q.after });
      window.history.replaceState(null, "", `?${qs}`); // shareable link
    } catch {
      if (id !== requestId.current) return;
      setState({ kind: "error", why: navigator.onLine ? "generic" : "offline" });
    }
  }

  // Open a shared link such as /?from=beypore&to=medical-college&after=07:00
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("from") ?? "";
    const tt = p.get("to") ?? "";
    const a = /^([01]\d|2[0-3]):[0-5]\d$/.test(p.get("after") ?? "") ? p.get("after")! : "";
    if (byId.has(f) && byId.has(tt) && f !== tt) {
      setFrom(f);
      setTo(tt);
      setAfter(a);
      void runSearch({ from: f, to: tt, after: a });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function swap() {
    setFrom(to);
    setTo(from);
    setFormError(null);
    if (from && to) void runSearch({ from: to, to: from, after });
    else setState({ kind: "idle" });
  }

  function setNow() {
    const d = new Date();
    setAfter(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  }

  const loading = state.kind === "loading";
  const result = state.kind === "done" ? state.result : null;
  const journeys = result ? [...result.direct, ...result.transfers] : [];
  const anyUnverified = journeys.some((j) => j.legs.some((l) => l.dataStatus === "unverified"));
  const empty = result && journeys.length === 0;

  const fromStop = byId.get(from);
  const toStop = byId.get(to);
  const similarFrom = empty && fromStop ? similarStops(fromStop, stops, 4) : [];
  const similarTo = empty && toStop ? similarStops(toStop, stops, 4) : [];

  const reportRoute = () =>
    setReportCtx({
      kind: "route",
      label: fromStop && toStop ? `${stopName(fromStop, lang)} → ${stopName(toStop, lang)}` : undefined,
      fromStopId: from || undefined,
      toStopId: to || undefined,
    });
  const linkButton =
    "inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900";
  const stopReportButton = (
    <button type="button" onClick={() => setReportCtx({ kind: "stop_name" })} className={linkButton}>
      🚩 {t("reportStopShort")}
    </button>
  );

  const counts = result && (
    <p className="text-sm text-slate-600" aria-live="polite">
      {t(result.direct.length === 1 ? "directOne" : "directMany", { n: result.direct.length })}
      {" · "}
      {t(result.transfers.length === 1 ? "transferOne" : "transferMany", { n: result.transfers.length })}
    </p>
  );

  return (
    <div className="mx-auto -mt-12 max-w-6xl gap-6 px-4 pb-16 lg:grid lg:grid-cols-[400px_1fr] lg:items-start">
      <aside className="space-y-4 lg:sticky lg:top-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch({ from, to, after });
          }}
          className={card}
          aria-label={t("find")}
        >
          {stops.length === 0 ? (
            <p className="text-sm text-slate-600">{t("noStops")}</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 space-y-3">
                <StopPicker
                  label={t("from")}
                  placeholder={t("fromPlaceholder")}
                  value={from}
                  onChange={setFrom}
                  stops={stops}
                  labels={labels}
                  marker="from"
                />
                <StopPicker
                  label={t("to")}
                  placeholder={t("toPlaceholder")}
                  value={to}
                  onChange={setTo}
                  stops={stops}
                  labels={labels}
                  marker="to"
                />
                </div>
                <button
                  type="button"
                  onClick={swap}
                  aria-label={t("swap")}
                  title={t("swap")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-brand-700 shadow transition hover:bg-brand-50 active:scale-95"
                >
                  ⇅
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label htmlFor="leave-after" className="text-sm font-medium text-slate-700">
                  {t("leaveAfter")}
                </label>
                <input
                  id="leave-after"
                  type="time"
                  value={after}
                  onChange={(e) => setAfter(e.target.value)}
                  className="min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
                <button
                  type="button"
                  onClick={setNow}
                  className="min-h-10 rounded-full border border-brand-300 px-4 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  {t("now")}
                </button>
                {after ? (
                  <button type="button" onClick={() => setAfter("")} className="min-h-10 px-1 text-sm text-slate-700 underline">
                    {t("anyTime")}
                  </button>
                ) : (
                  <span className="text-sm text-slate-600">{t("anyTime")}</span>
                )}
              </div>

              {formError && (
                <p role="alert" className="mt-3 text-sm font-medium text-rose-700">
                  {t(formError)}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? t("searching") : `🔍 ${t("find")}`}
              </button>
            </>
          )}
        </form>

        {hasDemo && (
          <div role="note" className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            🧪 {t("demoWarning")}
          </div>
        )}
        <div className="hidden lg:block">
          <DataInfoPanel info={info} />
          <div className="mt-2">{stopReportButton}</div>
        </div>
      </aside>

      <section
        ref={resultsRef}
        id="results"
        aria-busy={loading}
        className="mt-5 min-w-0 scroll-mt-4 space-y-4 lg:mt-14"
      >
        {state.kind === "idle" && (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-8 text-center">
            <div aria-hidden className="text-4xl">
              🚏
            </div>
            <p className="mt-2 font-semibold text-brand-900">{t("tagline")}</p>
            <p className="mt-1 text-sm text-slate-600">{t("timetableOnly")}</p>
          </div>
        )}

        {loading && (
          <div role="status" aria-label={t("searchingBuses")} className="space-y-3">
            <p className="text-sm text-slate-600">{t("searchingBuses")}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="h-16 bg-brand-50" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-1/2 rounded bg-slate-200" />
                  <div className="h-4 w-2/3 rounded bg-slate-100" />
                  <div className="h-4 w-1/3 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state.kind === "error" && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
            <p className="text-lg font-semibold">😕 {t("errorTitle")}</p>
            <p className="mt-1 text-sm">
              {t(state.why === "offline" ? "errorOffline" : state.why === "stops" ? "errorStops" : "errorBody")}
            </p>
            {state.why !== "stops" && (
              <button
                type="button"
                onClick={() => void runSearch({ from, to, after })}
                className="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
              >
                {t("retry")}
              </button>
            )}
          </div>
        )}

        {empty && (
          <div className="rounded-2xl border border-dashed border-brand-300 bg-white p-6 text-center">
            <div aria-hidden className="text-4xl">
              🚏
            </div>
            <h2 className="mt-2 text-lg font-bold">{t("emptyTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {state.kind === "done" && state.after
                ? t("emptyBodyAfter", { time: formatTime(Number(state.after.slice(0, 2)) * 60 + Number(state.after.slice(3))) })
                : t("emptyBody")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {state.kind === "done" && state.after && (
                <button
                  type="button"
                  onClick={() => {
                    setAfter("");
                    void runSearch({ from, to, after: "" });
                  }}
                  className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  {t("clearTime")}
                </button>
              )}
              <button
                type="button"
                onClick={swap}
                className="rounded-full border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                ⇅ {t("emptyTipSwap")}
              </button>
              <button
                type="button"
                onClick={reportRoute}
                className="min-h-10 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                🚩 {t("reportRouteShort")}
              </button>
            </div>

            {(similarFrom.length > 0 || similarTo.length > 0) && (
              <div className="mt-5 border-t border-slate-100 pt-4 text-left">
                <p className="text-sm font-semibold text-slate-700">
                  {t("similarStops")} <span className="font-normal text-slate-500">· {t("emptyTipNearby")}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {similarFrom.map((s) => (
                    <button
                      key={`f-${s.id}`}
                      type="button"
                      onClick={() => {
                        setFrom(s.id);
                        void runSearch({ from: s.id, to, after });
                      }}
                      className="min-h-10 rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                    >
                      {t("from")}: <strong>{stopName(s, lang)}</strong>
                    </button>
                  ))}
                  {similarTo.map((s) => (
                    <button
                      key={`t-${s.id}`}
                      type="button"
                      onClick={() => {
                        setTo(s.id);
                        void runSearch({ from, to: s.id, after });
                      }}
                      className="min-h-10 rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                    >
                      {t("to")}: <strong>{stopName(s, lang)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result && journeys.length > 0 && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-brand-900">
                {stopName(fromStop, lang)} → {stopName(toStop, lang)}
              </h2>
              {counts}
            </div>

            {anyUnverified && (
              <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                ⚠️ {t("unverifiedWarning")}
              </div>
            )}
            <p className="text-xs text-slate-500">{t("timetableOnly")}</p>

            {result.direct.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-800">🚌 {t("direct")}</h3>
                {result.direct.map((j) => (
                  <JourneyCard key={j.legs[0].tripId} journey={j} stops={result.stops} onReport={setReportCtx} />
                ))}
              </div>
            )}
            {result.transfers.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-800">🔁 {t("transfer")}</h3>
                {result.transfers.map((j) => (
                  <JourneyCard key={`${j.legs[0].tripId}-${j.legs[1].tripId}`} journey={j} stops={result.stops} onReport={setReportCtx} />
                ))}
              </div>
            )}
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-slate-700">
              {t("reportRoutePrompt")}
              <button type="button" onClick={reportRoute} className={linkButton}>
                🚩 {t("reportRouteShort")}
              </button>
            </p>
          </>
        )}

        <div className="lg:hidden">
          <DataInfoPanel info={info} />
          <div className="mt-2">{stopReportButton}</div>
        </div>
      </section>

      <ReportDialog context={reportCtx} onClose={() => setReportCtx(null)} />
    </div>
  );
}
