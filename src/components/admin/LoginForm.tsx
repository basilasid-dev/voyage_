"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";

const MESSAGES = {
  invalid: "Wrong password.",
  not_configured: "Admin sign-in is not set up on this server.",
  locked: "Too many attempts. Please wait before trying again.",
} as const;

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-800">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className="w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-rose-700">
          {MESSAGES[state.error]}
          {state.error === "locked" && state.retryAfter ? ` Try again in about ${Math.ceil(state.retryAfter / 60)} minute(s).` : ""}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
