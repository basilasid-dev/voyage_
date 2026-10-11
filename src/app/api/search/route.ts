import { NextResponse } from "next/server";
import { searchJourneys } from "@/lib/db/search";
import { getStopsByIds } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const after = searchParams.get("after"); // optional "HH:MM" (24h)

  if (!ID_RE.test(from) || !ID_RE.test(to)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ error: "same_stop" }, { status: 400 });
  }
  let afterMin = 0;
  if (after) {
    const m = TIME_RE.exec(after);
    if (!m) return NextResponse.json({ error: "invalid_time" }, { status: 400 });
    afterMin = Number(m[1]) * 60 + Number(m[2]);
  }
  try {
    if (getStopsByIds([from, to]).length !== 2) {
      return NextResponse.json({ error: "unknown_stop" }, { status: 404 });
    }
    return NextResponse.json(searchJourneys(from, to, { afterMin }));
  } catch (err) {
    console.error("search failed", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
