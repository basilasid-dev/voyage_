import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { analyzeSource } from "../src/lib/voyage/extract";
import { decodeEntities, parseOEmbed, parseOpenGraph, readSourceMetadata, safeThumbnail } from "../src/lib/voyage/extract/metadata";
import { extractFromText } from "../src/lib/voyage/extract/places-text";
import { fetchPublic, isAllowedUrl, type FetchLike } from "../src/lib/voyage/extract/safe-fetch";
import { parseLink } from "../src/lib/voyage/validate";

const link = (u: string) => parseLink(u)!;
const res = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });
/** A fake network: maps URL -> Response (or throws). Records every URL requested. */
function fakeNet(map: Record<string, Response | Error | (() => Response)>) {
  const calls: string[] = [];
  const impl: FetchLike = async (url) => {
    calls.push(url);
    const hit = map[url];
    if (!hit) return new Response("not found", { status: 404 });
    if (hit instanceof Error) throw hit;
    return typeof hit === "function" ? hit() : hit.clone();
  };
  return { impl, calls };
}

afterEach(() => {
  delete process.env.VOYAGE_DISABLE_FETCH;
});

describe("network guard", () => {
  it("allows only https URLs on the platform hosts", () => {
    for (const ok of ["https://www.youtube.com/watch?v=x", "https://youtu.be/x", "https://vimeo.com/1", "https://www.tiktok.com/@a/video/1", "https://www.pinterest.com/pin/1/", "https://in.pinterest.com/pin/1/", "https://pin.it/abc", "https://www.instagram.com/reel/abc/"]) {
      assert.equal(isAllowedUrl(ok), true, ok);
    }
    for (const bad of [
      "http://www.youtube.com/watch?v=x", "https://example.com/", "https://youtube.com.evil.example/x", "https://evilyoutube.com/x", "https://localhost/x",
      "https://127.0.0.1/x", "https://[::1]/x", "https://169.254.169.254/latest/meta-data", "https://www.youtube.com:8443/x", "https://user:pw@www.youtube.com/x",
      "ftp://www.youtube.com/x", "file:///etc/passwd", "javascript:alert(1)", "not a url",
    ]) assert.equal(isAllowedUrl(bad), false, bad);
  });

  it("refuses hosts that are not allowed without making a request", async () => {
    const net = fakeNet({});
    for (const url of ["https://example.com/x", "http://www.youtube.com/x", "https://10.0.0.5/admin"]) {
      const r = await fetchPublic(url, { fetchImpl: net.impl });
      assert.deepEqual(r, { ok: false, reason: "host_not_allowed" });
    }
    assert.equal(net.calls.length, 0);
  });

  it("returns the body on success", async () => {
    const net = fakeNet({ "https://vimeo.com/1": res("hello", { headers: { "content-type": "text/html" } }) });
    const r = await fetchPublic("https://vimeo.com/1", { fetchImpl: net.impl });
    assert.ok(r.ok && r.body === "hello" && r.contentType === "text/html");
  });

  it("follows a redirect only to another allowed host, and re-checks every hop", async () => {
    const good = fakeNet({
      "https://pin.it/abc": new Response(null, { status: 302, headers: { location: "https://www.pinterest.com/pin/9/" } }),
      "https://www.pinterest.com/pin/9/": res("page"),
    });
    const ok = await fetchPublic("https://pin.it/abc", { fetchImpl: good.impl });
    assert.ok(ok.ok && ok.finalUrl === "https://www.pinterest.com/pin/9/");

    for (const location of ["https://evil.example/steal", "http://www.pinterest.com/pin/9/", "https://127.0.0.1/", "https://169.254.169.254/"]) {
      const bad = fakeNet({ "https://pin.it/abc": new Response(null, { status: 302, headers: { location } }) });
      const r = await fetchPublic("https://pin.it/abc", { fetchImpl: bad.impl });
      assert.deepEqual(r, { ok: false, reason: "redirect_blocked" }, location);
      assert.deepEqual(bad.calls, ["https://pin.it/abc"]); // the blocked address was never requested
    }
  });

  it("gives up after too many redirects", async () => {
    const loop = fakeNet({ "https://pin.it/a": new Response(null, { status: 302, headers: { location: "https://pin.it/a" } }) });
    assert.deepEqual(await fetchPublic("https://pin.it/a", { fetchImpl: loop.impl }), { ok: false, reason: "too_many_redirects" });
  });

  it("reports http errors, timeouts, network failures and oversized bodies", async () => {
    assert.deepEqual(await fetchPublic("https://vimeo.com/1", { fetchImpl: fakeNet({ "https://vimeo.com/1": new Response("no", { status: 403 }) }).impl }), { ok: false, reason: "http_403" });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    assert.deepEqual(await fetchPublic("https://vimeo.com/1", { fetchImpl: fakeNet({ "https://vimeo.com/1": abort }).impl }), { ok: false, reason: "timeout" });
    assert.deepEqual(await fetchPublic("https://vimeo.com/1", { fetchImpl: fakeNet({ "https://vimeo.com/1": new TypeError("fetch failed") }).impl }), { ok: false, reason: "network" });
    const big = fakeNet({ "https://vimeo.com/1": res("x".repeat(2000)) });
    assert.deepEqual(await fetchPublic("https://vimeo.com/1", { fetchImpl: big.impl, maxBytes: 1000 }), { ok: false, reason: "too_large" });
  });

  it("can be switched off completely", async () => {
    process.env.VOYAGE_DISABLE_FETCH = "1";
    const net = fakeNet({ "https://vimeo.com/1": res("x") });
    assert.deepEqual(await fetchPublic("https://vimeo.com/1", { fetchImpl: net.impl }), { ok: false, reason: "disabled" });
    assert.equal(net.calls.length, 0);
  });

  it("sends no cookies or credentials", async () => {
    let seen: Record<string, string> = {};
    await fetchPublic("https://vimeo.com/1", { fetchImpl: async (_u, init) => ((seen = init.headers), res("ok")) });
    assert.deepEqual(Object.keys(seen).map((k) => k.toLowerCase()).sort(), ["accept", "user-agent"]);
  });
});

describe("metadata parsing", () => {
  it("decodes entities", () => {
    assert.equal(decodeEntities("Tom &amp; Jerry &#39;s &quot;x&quot; &#x1F30D;"), 'Tom & Jerry \'s "x" 🌍');
    assert.equal(decodeEntities("&unknown; &#99999999;"), "&unknown; &#99999999;");
  });

  it("reads Open Graph tags in any attribute order and quote style", () => {
    const html = `<html><head><title>Fallback title</title>
      <meta property="og:title" content="Istanbul in 3 days &amp; a ferry">
      <meta content='A trip: 📍 Galata Tower' property='og:description'>
      <meta name="og:image" content="https://i.pinimg.com/x.jpg"></head></html>`;
    const og = parseOpenGraph(html);
    assert.equal(og.title, "Istanbul in 3 days & a ferry");
    assert.equal(og.description, "A trip: 📍 Galata Tower");
    assert.equal(og.image, "https://i.pinimg.com/x.jpg");
    assert.equal(parseOpenGraph("<title>Only a title</title>").title, "Only a title");
    assert.deepEqual(parseOpenGraph("<p>nothing</p>"), { title: null, description: null, image: null, siteName: null });
  });

  it("reads oEmbed JSON and rejects junk", () => {
    assert.deepEqual(parseOEmbed('{"title":"Vlog","author_name":"Ann","thumbnail_url":"https://i.ytimg.com/a.jpg"}'), { title: "Vlog", author: "Ann", description: null, thumbnail: "https://i.ytimg.com/a.jpg" });
    assert.equal(parseOEmbed("<html>"), null);
    assert.equal(parseOEmbed("null"), null);
  });

  it("keeps thumbnails only from the platform's own CDN over https", () => {
    assert.equal(safeThumbnail("youtube", "https://i.ytimg.com/vi/x/hq.jpg"), "https://i.ytimg.com/vi/x/hq.jpg");
    assert.equal(safeThumbnail("youtube", "http://i.ytimg.com/x.jpg"), null);
    assert.equal(safeThumbnail("youtube", "https://evil.example/x.jpg"), null);
    assert.equal(safeThumbnail("youtube", "javascript:alert(1)"), null);
    assert.equal(safeThumbnail("pinterest", "https://i.pinimg.com/236x/a.jpg"), "https://i.pinimg.com/236x/a.jpg");
    assert.equal(safeThumbnail("youtube", null), null);
  });
});

describe("reading a link honestly", () => {
  const yt = "https://www.youtube.com/watch?v=abc";
  const ytEmbed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(yt)}`;

  it("YouTube: title and channel are real but the description is not public, so the result is 'partial'", async () => {
    const net = fakeNet({ [ytEmbed]: res('{"title":"48 hours in Istanbul","author_name":"Wanderer","thumbnail_url":"https://i.ytimg.com/vi/abc/hq.jpg"}') });
    const m = await readSourceMetadata(link(yt), { fetchImpl: net.impl });
    assert.equal(m.status, "partial");
    assert.equal(m.title, "48 hours in Istanbul");
    assert.equal(m.author, "Wanderer");
    assert.equal(m.thumbnailUrl, "https://i.ytimg.com/vi/abc/hq.jpg");
    assert.match(m.reason ?? "", /Paste the description/);
  });

  it("Vimeo with a description is 'retrieved'", async () => {
    const u = "https://vimeo.com/123";
    const net = fakeNet({ [`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`]: res('{"title":"Kerala","description":"Kozhikode beach","author_name":"A"}') });
    assert.equal((await readSourceMetadata(link(u), { fetchImpl: net.impl })).status, "retrieved");
  });

  it("Pinterest: reads Open Graph from the page", async () => {
    const u = "https://www.pinterest.com/pin/1/";
    const net = fakeNet({ [u]: res('<meta property="og:title" content="Galata Tower"><meta property="og:description" content="Sunset spot in Istanbul">') });
    const m = await readSourceMetadata(link(u), { fetchImpl: net.impl });
    assert.deepEqual([m.status, m.title, m.description], ["retrieved", "Galata Tower", "Sunset spot in Istanbul"]);
  });

  it("Instagram behind a login wall is reported as blocked, never as success", async () => {
    const u = "https://www.instagram.com/reel/abc/";
    const net = fakeNet({ [u]: res('<meta property="og:title" content="Instagram"><meta property="og:description" content="Log in to see this">') });
    const m = await readSourceMetadata(link(u), { fetchImpl: net.impl });
    assert.equal(m.status, "blocked");
    assert.equal(m.title, null);
    assert.match(m.reason ?? "", /Paste the caption/);
  });

  it("explains refusals, timeouts, missing pages and switched-off fetching", async () => {
    const u = "https://www.instagram.com/reel/abc/";
    assert.equal((await readSourceMetadata(link(u), { fetchImpl: fakeNet({ [u]: new Response("", { status: 429 }) }).impl })).status, "blocked");
    assert.equal((await readSourceMetadata(link(u), { fetchImpl: fakeNet({ [u]: Object.assign(new Error("t"), { name: "AbortError" }) }).impl })).status, "unavailable");
    assert.equal((await readSourceMetadata(link(u), { fetchImpl: fakeNet({}).impl })).status, "unavailable"); // 404
    process.env.VOYAGE_DISABLE_FETCH = "1";
    assert.equal((await readSourceMetadata(link(u))).status, "skipped");
  });

  it("does not read ordinary web pages at all", async () => {
    const net = fakeNet({});
    const m = await readSourceMetadata(link("https://example.com/blog"), { fetchImpl: net.impl });
    assert.equal(m.status, "skipped");
    assert.equal(net.calls.length, 0);
  });
});

/** Every quoted snippet in the evidence must really occur in the text we were given. */
function assertEvidenceIsReal(texts: string[], result: ReturnType<typeof extractFromText>) {
  const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
  const hay = norm(texts.join("\n"));
  for (const c of result.candidates) {
    if (c.evidence === "Added by you") continue;
    const quote = /“(.*)”/s.exec(c.evidence)?.[1]?.replace(/^…|…$/g, "");
    assert.ok(quote && hay.includes(norm(quote)), `evidence for ${c.name} is not in the text: ${c.evidence}`);
  }
}
const names = (r: ReturnType<typeof extractFromText>) => r.candidates.map((c) => c.name);
const find = (r: ReturnType<typeof extractFromText>, n: string) => r.candidates.find((c) => c.name === n);

describe("finding places in text", () => {
  it("Istanbul caption: separate places, matched to curated records, with the destination and activities", () => {
    const text = "Day 1 in Istanbul 🇹🇷\n📍 Galata Tower, Istanbul\nThen baklava at Karaköy Güllüoğlu and a ferry to Kadıköy at sunset. #TravelDiaries #fyp";
    const r = extractFromText([{ label: "caption", text }]);
    assert.ok(names(r).includes("Galata Tower"));
    assert.ok(names(r).includes("Karaköy Güllüoğlu"));
    assert.ok(names(r).includes("Kadıköy"));
    const gt = find(r, "Galata Tower")!;
    assert.deepEqual([gt.confidence, gt.matchedPlaceId, gt.destinationId, gt.category], ["high", "galata-tower", "istanbul", "landmark"]);
    assert.equal(find(r, "Karaköy Güllüoğlu")!.category, "food");
    assert.equal(find(r, "Kadıköy")!.matchedPlaceId, null); // known by name, not a curated record
    assert.equal(r.destinations[0].id, "istanbul");
    assert.ok(r.activities.includes("ferry ride") && r.activities.includes("sunset"));
    assert.equal(r.overall, "high");
    assert.ok(!names(r).some((n) => /Istanbul|TravelDiaries|fyp/i.test(n)), "destination and generic hashtags are not places");
    assertEvidenceIsReal([text], r);
  });

  it("Kozhikode list caption with aliases and a numbered list", () => {
    const text = "Kozhikode food & beach trail\n1. Paragon - the famous biryani\n2. SM Street halwa\n3. Calicut Beach for sunset\n4. Kappad";
    const r = extractFromText([{ label: "caption", text }]);
    for (const id of ["paragon-restaurant", "sm-street", "kozhikode-beach", "kappad-beach"]) assert.ok(r.candidates.some((c) => c.matchedPlaceId === id), id);
    assert.equal(r.candidates.filter((c) => c.matchedPlaceId === "kozhikode-beach").length, 1); // alias merged, not duplicated
    assert.equal(r.destinations[0].id, "kozhikode");
    assertEvidenceIsReal([text], r);
  });

  it("does not double count 'Galata Bridge' as 'Galata Tower'", () => {
    const r = extractFromText([{ label: "caption", text: "Walking across Galata Bridge at dusk." }]);
    assert.deepEqual(names(r), ["Galata Bridge"]);
  });

  it("resolves CamelCase hashtags to known places", () => {
    const r = extractFromText([{ label: "caption", text: "Views! #GalataTower #HagiaSophia #BalatStreets" }]);
    assert.ok(r.candidates.some((c) => c.matchedPlaceId === "galata-tower" && c.confidence === "high"));
    assert.ok(r.candidates.some((c) => c.matchedPlaceId === "hagia-sophia"));
  });

  it("offers unknown places only as low-confidence guesses, with evidence", () => {
    const text = "Best kunafa at Hafiz Mustafa in Istanbul, worth the queue!";
    const r = extractFromText([{ label: "caption", text }]);
    const hm = find(r, "Hafiz Mustafa")!;
    assert.equal(hm.confidence, "low");
    assert.equal(hm.matchedPlaceId, null);
    assert.equal(hm.destinationId, "istanbul");
    assert.equal(r.overall, "low");
    assert.ok(r.gaps.some((g) => /low-confidence/.test(g)));
    assertEvidenceIsReal([text], r);
  });

  it("finds nothing in text without places, and says so instead of inventing", () => {
    const r = extractFromText([{ label: "caption", text: "Love this vibe!! 😍 Follow for more #fyp #travel #reels" }]);
    assert.deepEqual(r.candidates, []);
    assert.equal(r.overall, "none");
    assert.ok(r.gaps.some((g) => /No place names were recognised/.test(g)));
    assert.deepEqual(extractFromText([]).gaps, ["There was no text to read. Paste the caption or describe the places."]);
  });

  it("flags an unclear destination when both are mentioned equally", () => {
    const r = extractFromText([{ label: "caption", text: "Istanbul or Kozhikode? Both are great." }]);
    assert.ok(r.gaps.some((g) => /destination is not clear/.test(g)));
    assert.equal(r.destinations.length, 2);
  });

  it("uses title, description and caption together", () => {
    const r = extractFromText([
      { label: "title", text: "48 hours in Istanbul" },
      { label: "description", text: "We start at the Basilica Cistern." },
      { label: "caption", text: "Then the Grand Bazaar!" },
    ]);
    assert.ok(names(r).includes("Basilica Cistern") && names(r).includes("Grand Bazaar (Kapalıçarşı)"));
    assert.equal(r.candidates.find((c) => c.name.startsWith("Grand Bazaar"))!.matchedPlaceId, "grand-bazaar");
  });

  it("copes with hostile and huge input", () => {
    const evil = "(((((" + "A".repeat(50_000) + "))))) <script>alert(1)</script> 📍 " + "B".repeat(5000);
    const t0 = Date.now();
    const r = extractFromText([{ label: "caption", text: evil }]);
    assert.ok(Date.now() - t0 < 3000, "extraction must stay fast");
    assert.ok(r.candidates.length <= 14);
    for (const c of r.candidates) assert.ok(c.name.length <= 200);
  });
});

describe("analyzeSource", () => {
  it("needs a link or some text", async () => {
    await assert.rejects(() => analyzeSource({}), /Paste a link/);
    await assert.rejects(() => analyzeSource({ url: "javascript:alert(1)" }), /http and https/);
  });

  it("caption only: no network, text is read", async () => {
    const a = await analyzeSource({ caption: "📍 Mananchira Square, Kozhikode" });
    assert.equal(a.metadata.status, "skipped");
    assert.equal(a.platform, "manual");
    assert.equal(a.extraction.candidates[0].matchedPlaceId, "mananchira-square");
  });

  it("link + pasted caption: metadata and the caption are combined", async () => {
    const yt = "https://youtu.be/xyz";
    const net = fakeNet({ [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(yt)}`]: res('{"title":"Istanbul vlog","author_name":"A"}') });
    const a = await analyzeSource({ url: yt, caption: "We visited Hagia Sophia." }, { fetchImpl: net.impl });
    assert.equal(a.platform, "youtube");
    assert.equal(a.metadata.status, "partial");
    assert.ok(a.extraction.candidates.some((c) => c.matchedPlaceId === "hagia-sophia"));
    assert.equal(a.extraction.destinations[0].id, "istanbul");
  });

  it("a blocked link with no caption reads nothing and tells the person what to do", async () => {
    const u = "https://www.instagram.com/reel/abc/";
    const net = fakeNet({ [u]: res('<meta property="og:title" content="Instagram">') });
    const a = await analyzeSource({ url: u }, { fetchImpl: net.impl });
    assert.equal(a.metadata.status, "blocked");
    assert.equal(a.extraction.candidates.length, 0);
    assert.ok(a.extraction.gaps.length > 0);
  });
});
