import { NextResponse } from "next/server";
import { AdminError } from "@/lib/admin/errors";
import { limiters, clientKey } from "@/lib/admin/session";
import { getDb } from "@/lib/db/connection";
import { createReport, validateReportInput } from "@/lib/reports";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;
const json = (body: unknown, status: number, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Passenger feedback. Public, so it is strict: same-origin JSON only, size-limited, validated, rate-limited. */
export async function POST(req: Request) {
  // Cross-site pages must not be able to post on a visitor's behalf.
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return json({ error: "forbidden" }, 403);
    } catch {
      return json({ error: "forbidden" }, 403);
    }
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "unsupported" }, 415);

  const key = clientKey(req.headers);
  if (!limiters.report.allowed(key) || !limiters.reportAll.allowed("*")) {
    const wait = Math.max(limiters.report.retryAfter(key), limiters.reportAll.retryAfter("*"));
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(wait) });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const result = validateReportInput(raw);
  if (!result.ok) {
    // Bots that fill the hidden field get the same answer as everyone else, and nothing is stored.
    if (result.spam) return json({ ok: true }, 201);
    return json({ error: "validation", fields: result.errors }, 400);
  }

  limiters.report.record(key);
  limiters.reportAll.record("*");
  try {
    createReport(getDb(), result.value);
    return json({ ok: true }, 201);
  } catch (err) {
    if (err instanceof AdminError) return json({ error: "busy" }, 503);
    console.error("report failed", err);
    return json({ error: "server_error" }, 500);
  }
}
