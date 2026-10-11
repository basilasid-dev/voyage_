"use client";

import { useRouter, usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/(voyage)/actions";

// ---------------------------------------------------------------- page-level confirmation banner

export const FlashContext = createContext<(r: ActionResult) => void>(() => {});

/**
 * Confirmation banner that survives page refreshes. After a successful action the page re-renders and the form
 * that was used may be gone (for example the item it deleted), so the result is shown here, in the one live region
 * that screen readers announce.
 */
export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ActionResult>(null);
  const path = usePathname();
  useEffect(() => setMsg(null), [path]);
  return (
    <FlashContext.Provider value={setMsg}>
      <div role="status" aria-live="polite" className="pointer-events-none sticky top-2 z-40 h-0 overflow-visible px-4">
        {msg && (
          <div
            className={`pointer-events-auto mx-auto flex max-w-xl items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
              msg.ok ? "border-brand-200 bg-brand-50 text-brand-900" : "border-rose-300 bg-rose-50 text-rose-900"
            }`}
          >
            <span>
              {msg.ok ? "✅ " : "⚠️ "}
              {msg.message}
            </span>
            <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss message" className="-my-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5">
              ✕
            </button>
          </div>
        )}
      </div>
      {children}
    </FlashContext.Provider>
  );
}

// ---------------------------------------------------------------- forms

const TONES = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  danger: "bg-rose-700 text-white hover:bg-rose-800",
  neutral: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
} as const;

/**
 * A form wired to a server action: optional confirmation, a result message, optional reset after success and an
 * optional redirect (the action says where to go). The result also goes to the page banner.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  tone = "primary",
  confirmText,
  resetOnSuccess = false,
  compact = false,
  className = "",
  buttonClassName = "",
  ariaLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children?: React.ReactNode;
  submitLabel: string;
  tone?: keyof typeof TONES;
  confirmText?: string;
  resetOnSuccess?: boolean;
  compact?: boolean; // no inline message (for small icon-like buttons); the banner still reports
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
}) {
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, startTransition] = useTransition();
  const flash = useContext(FlashContext);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className={compact ? className : `space-y-3 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirmText && !window.confirm(confirmText)) return;
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          let res: ActionResult;
          try {
            res = await action(null, data);
          } catch {
            res = { ok: false, message: "Something went wrong. Nothing was changed. Check your connection and try again." };
          }
          setResult(res);
          flash(res);
          if (res?.ok) {
            if (resetOnSuccess) formRef.current?.reset();
            if (res.redirect) router.push(res.redirect);
          }
        });
      }}
    >
      {children}
      <div className={compact ? "" : "flex flex-wrap items-center gap-3"}>
        <button
          type="submit"
          disabled={pending}
          aria-label={ariaLabel}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${TONES[tone]} ${buttonClassName}`}
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {!compact && result && <p className={`text-sm font-medium ${result.ok ? "text-brand-700" : "text-rose-700"}`}>{result.message}</p>}
      </div>
    </form>
  );
}
