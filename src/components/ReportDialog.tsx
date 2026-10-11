"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TKey } from "@/lib/i18n";
import { REPORT_KINDS, REPORT_LIMITS, type ReportFieldError, type ReportKind } from "@/lib/reports";
import { useLang } from "./LanguageProvider";

/** What the passenger was looking at when they decided to report something. */
export interface ReportContext {
  kind: ReportKind;
  label?: string; // shown to the passenger: "DEMO Route 1 · Mananchira → Kunnamangalam"
  serviceId?: string;
  tripId?: number;
  stopId?: string;
  fromStopId?: string;
  toStopId?: string;
}

const KIND_LABEL: Record<ReportKind, TKey> = {
  timing: "reportKindTiming",
  route: "reportKindRoute",
  stop_name: "reportKindStop",
  other: "reportKindOther",
};

type Fields = "kind" | "message" | "suggestion" | "contact";
type Phase = "form" | "sending" | "done";

const inputClass =
  "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200 aria-[invalid=true]:border-rose-600";

function ReportForm({ context, onClose }: { context: ReportContext; onClose: () => void }) {
  const { lang, t } = useLang();
  const uid = useId();
  const [kind, setKind] = useState<ReportKind>(context.kind);
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [phase, setPhase] = useState<Phase>("form");
  const [errors, setErrors] = useState<Partial<Record<Fields, ReportFieldError>>>({});
  const [serverError, setServerError] = useState<TKey | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase === "done") doneRef.current?.focus();
  }, [phase]);

  const fieldMessage = (field: Fields) => {
    const e = errors[field];
    if (!e) return null;
    if (e === "required") return t("fieldRequired");
    if (e === "too_short") return t("fieldTooShort", { n: REPORT_LIMITS.messageMin });
    if (e === "too_long")
      return t("fieldTooLong", { n: field === "message" ? REPORT_LIMITS.messageMax : field === "suggestion" ? REPORT_LIMITS.suggestion : REPORT_LIMITS.contact });
    return t("fieldInvalid");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    // Light client-side check so people get instant feedback; the server checks everything again.
    const local: Partial<Record<Fields, ReportFieldError>> = {};
    const trimmed = message.trim();
    if (!trimmed) local.message = "required";
    else if (trimmed.length < REPORT_LIMITS.messageMin) local.message = "too_short";
    if (Object.keys(local).length) {
      setErrors(local);
      queueMicrotask(() => document.getElementById(`${uid}-message`)?.focus());
      return;
    }
    setErrors({});
    setPhase("sending");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, message, suggestion, contact, website, lang,
          serviceId: context.serviceId, tripId: context.tripId, stopId: context.stopId,
          fromStopId: context.fromStopId, toStopId: context.toStopId,
        }),
      });
      if (res.status === 201) return setPhase("done");
      setPhase("form");
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { fields?: Partial<Record<Fields, ReportFieldError>> };
        setErrors(body.fields ?? {});
        if (!body.fields || Object.keys(body.fields).length === 0) setServerError("reportFailed");
      } else if (res.status === 429) setServerError("errorRateLimited");
      else if (res.status === 503) setServerError("reportBusy");
      else setServerError("reportFailed");
    } catch {
      setPhase("form");
      setServerError(navigator.onLine ? "reportFailed" : "errorOffline");
    }
  }

  const label = "mb-1 block text-sm font-semibold text-slate-800";
  const hint = "mt-1 block text-xs text-slate-600";
  const err = "mt-1 block text-sm font-medium text-rose-700";

  if (phase === "done") {
    return (
      <div className="space-y-4 p-5" role="status">
        <p className="text-lg font-semibold text-brand-900">✅ {t("reportThanks")}</p>
        <button ref={doneRef} type="button" onClick={onClose} className="min-h-11 w-full rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">
          {t("reportClose")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 p-5" aria-describedby={`${uid}-intro`}>
      <p id={`${uid}-intro`} className="text-sm text-slate-700">{t("reportIntro")}</p>
      {context.label && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
          <span className="font-semibold">{t("reportAbout")}:</span> {context.label}
        </p>
      )}

      <fieldset>
        <legend className={label}>{t("reportKind")}</legend>
        <div className="grid gap-1">
          {REPORT_KINDS.map((k) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} className="h-5 w-5 accent-[#16883f]" />
              <span>{t(KIND_LABEL[k])}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${uid}-message`} className={label}>{t("reportMessage")} *</label>
        <textarea
          id={`${uid}-message`}
          rows={4}
          value={message}
          maxLength={REPORT_LIMITS.messageMax}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={!!errors.message}
          aria-describedby={`${uid}-message-hint${errors.message ? ` ${uid}-message-err` : ""}`}
          required
          className={inputClass}
        />
        <span id={`${uid}-message-hint`} className={hint}>{t("reportMessageHint", { n: REPORT_LIMITS.messageMin })}</span>
        {errors.message && <span id={`${uid}-message-err`} role="alert" className={err}>{fieldMessage("message")}</span>}
      </div>

      <div>
        <label htmlFor={`${uid}-suggestion`} className={label}>{t("reportSuggestion")}</label>
        <input id={`${uid}-suggestion`} value={suggestion} maxLength={REPORT_LIMITS.suggestion} onChange={(e) => setSuggestion(e.target.value)} aria-invalid={!!errors.suggestion} className={inputClass} />
        {errors.suggestion && <span role="alert" className={err}>{fieldMessage("suggestion")}</span>}
      </div>

      <div>
        <label htmlFor={`${uid}-contact`} className={label}>{t("reportContact")}</label>
        <input id={`${uid}-contact`} value={contact} maxLength={REPORT_LIMITS.contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" aria-describedby={`${uid}-contact-hint`} aria-invalid={!!errors.contact} className={inputClass} />
        <span id={`${uid}-contact-hint`} className={hint}>{t("reportContactHint")}</span>
        {errors.contact && <span role="alert" className={err}>{fieldMessage("contact")}</span>}
      </div>

      {/* Spam trap: invisible to people and assistive tech, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" /></label>
      </div>

      {serverError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900">{t(serverError)}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50">{t("reportCancel")}</button>
        <button type="submit" disabled={phase === "sending"} className="min-h-11 rounded-xl bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {phase === "sending" ? t("reportSending") : t("reportSend")}
        </button>
      </div>
    </form>
  );
}

/** Modal dialog. `context` non-null = open. Uses the native <dialog> (focus trap, Esc, focus restore). */
export function ReportDialog({ context, onClose }: { context: ReportContext | null; onClose: () => void }) {
  const { t } = useLang();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [openCount, setOpenCount] = useState(0); // new key = fresh, empty form each time

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (context && !d.open) {
      setOpenCount((n) => n + 1);
      d.showModal();
    } else if (!context && d.open) d.close();
  }, [context]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // click on the dimmed backdrop
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3">
        <h2 id={titleId} className="text-lg font-bold">{t("reportTitle")}</h2>
        <button type="button" onClick={onClose} aria-label={t("reportClose")} className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-slate-100">✕</button>
      </div>
      {context && <ReportForm key={openCount} context={context} onClose={onClose} />}
    </dialog>
  );
}
