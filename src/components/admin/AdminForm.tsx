"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/admin/actions";
import { useFlash } from "./Flash";

const TONES = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  danger: "bg-rose-700 text-white hover:bg-rose-800",
  neutral: "bg-slate-700 text-white hover:bg-slate-800",
} as const;

/**
 * A form wired to a server action, with an optional confirmation and an accessible result message.
 *
 * The result is handed to the page-level banner (Flash) from the submit handler. It cannot be an effect on
 * this component's own state: after a successful save the page re-renders and this form may be gone already
 * (for example the "verify" form disappears once the bus is verified), and the admin would see nothing.
 */
export function AdminForm({
  action,
  children,
  submitLabel,
  tone = "primary",
  confirmText,
  className = "",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  tone?: keyof typeof TONES;
  confirmText?: string;
  className?: string;
}) {
  const [result, setResult] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const flash = useFlash();

  return (
    <form
      className={`space-y-3 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirmText && !window.confirm(confirmText)) return;
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          let res: ActionState;
          try {
            res = await action(null, data);
          } catch {
            res = { ok: false, message: "Something went wrong. Nothing was changed. Check your connection and try again." };
          }
          setResult(res);
          flash(res);
        });
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${TONES[tone]}`}
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <p className={`text-sm font-medium ${result?.ok ? "text-brand-700" : "text-rose-700"}`}>{result?.message}</p>
      </div>
    </form>
  );
}
