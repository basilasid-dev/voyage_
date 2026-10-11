"use server";

import { redirect } from "next/navigation";
import { adminConfig } from "@/lib/admin/auth-core";
import { endAdminSession, limiters, requestKey, startAdminSession } from "@/lib/admin/session";

export interface LoginState {
  error?: "not_configured" | "invalid" | "locked";
  retryAfter?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const cfg = adminConfig();
  if (!cfg.configured) return { error: "not_configured" };

  const key = await requestKey();
  if (!limiters.login.allowed(key) || !limiters.loginAll.allowed("*")) {
    return { error: "locked", retryAfter: Math.max(limiters.login.retryAfter(key), limiters.loginAll.retryAfter("*")) };
  }

  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!cfg.verify(password)) {
    limiters.login.record(key);
    limiters.loginAll.record("*");
    await sleep(500 + Math.floor(Math.random() * 300)); // slows scripted guessing
    return { error: "invalid" };
  }

  limiters.login.reset(key);
  await startAdminSession();
  redirect("/admin"); // outside any try/catch: redirect works by throwing
}

export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}
