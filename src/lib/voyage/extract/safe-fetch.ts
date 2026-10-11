// The ONLY outbound network code in the travel-planning services. It exists to read the small amount of public
// metadata (title, author, caption) that YouTube, Vimeo, TikTok, Pinterest and Instagram publish for a shared link.
//
// Safeguards (all enforced here, whatever the caller passes):
//  * only these exact platform hosts (no arbitrary web addresses, no IP addresses, no localhost, no other ports);
//  * https only, no credentials in the URL;
//  * redirects are followed manually (at most 3) and every hop is checked against the same rules;
//  * a timeout, a response size cap, no cookies and no custom headers beyond Accept and a plain User-Agent;
//  * VOYAGE_DISABLE_FETCH=1 turns the network off completely (tests and offline use).
// `fetchImpl` is injectable so tests never touch the network.

const ALLOWED: RegExp[] = [
  /^(www\.|m\.)?youtube\.com$/,
  /^youtu\.be$/,
  /^(www\.)?vimeo\.com$/,
  /^(www\.|vm\.|vt\.)?tiktok\.com$/,
  /^([a-z]{2}\.|www\.)?pinterest\.(com|co\.uk|com\.au|[a-z]{2})$/,
  /^pin\.it$/,
  /^(www\.)?instagram\.com$/,
  /^instagr\.am$/,
];

export type FetchFailure =
  | "disabled"
  | "host_not_allowed"
  | "bad_url"
  | "timeout"
  | "network"
  | "too_many_redirects"
  | "redirect_blocked"
  | "too_large"
  | `http_${number}`;

export type FetchResult =
  | { ok: true; status: number; contentType: string; body: string; finalUrl: string }
  | { ok: false; reason: FetchFailure };

export type FetchLike = (input: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/** True only for https URLs on the allow-listed platform hosts (default port, no credentials). */
export function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  return ALLOWED.some((re) => re.test(u.hostname.toLowerCase()));
}

export interface FetchOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
}

const MAX_REDIRECTS = 3;

export async function fetchPublic(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  if (process.env.VOYAGE_DISABLE_FETCH === "1") return { ok: false, reason: "disabled" };
  const impl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const maxBytes = opts.maxBytes ?? 512 * 1024;

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedUrl(current)) return { ok: false, reason: hop === 0 ? "host_not_allowed" : "redirect_blocked" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
    let res: Response;
    try {
      res = await impl(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: opts.accept ?? "text/html,application/json;q=0.9", "User-Agent": "VoyageLinkReader/1.0 (+public metadata only)" },
      });
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, reason: (err as Error)?.name === "AbortError" ? "timeout" : "network" };
    }

    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: `http_${res.status}` };
      try {
        current = new URL(loc, current).toString();
      } catch {
        return { ok: false, reason: "bad_url" };
      }
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      return { ok: false, reason: `http_${res.status}` };
    }

    try {
      const body = await readCapped(res, maxBytes);
      clearTimeout(timer);
      if (body === null) return { ok: false, reason: "too_large" };
      return { ok: true, status: res.status, contentType: res.headers.get("content-type") ?? "", body, finalUrl: current };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, reason: (err as Error)?.name === "AbortError" ? "timeout" : "network" };
    }
  }
  return { ok: false, reason: "too_many_redirects" };
}

/** Reads the body as text but gives up (null) as soon as it exceeds maxBytes. */
async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) {
    const t = await res.text();
    return t.length > maxBytes ? null : t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => {}); // do not wait: a stalled stream must not stall us
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}
