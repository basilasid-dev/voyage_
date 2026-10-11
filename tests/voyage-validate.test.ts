import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashOwner, isValidOwnerToken, newOwnerToken } from "../src/lib/voyage/owner-core";
import {
  VoyageError, dayDate, duration, formatDuration, formatMoney, formatRange, money, notes, parseDate, parseLink, text, tripLength,
} from "../src/lib/voyage/validate";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof VoyageError, `expected VoyageError, got ${e}`);
    return (e as VoyageError).code;
  }
  assert.fail("expected the call to throw");
};

describe("links", () => {
  it("recognises Pinterest, Instagram and video platforms", () => {
    const platform = (u: string) => parseLink(u)?.platform;
    assert.equal(platform("https://www.pinterest.com/pin/123456/"), "pinterest");
    assert.equal(platform("https://in.pinterest.com/pin/1/"), "pinterest");
    assert.equal(platform("https://pin.it/abc123"), "pinterest");
    assert.equal(platform("https://www.instagram.com/reel/Cxyz/"), "instagram");
    assert.equal(platform("https://instagr.am/p/abc"), "instagram");
    assert.equal(platform("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
    assert.equal(platform("https://youtu.be/dQw4w9WgXcQ"), "youtube");
    assert.equal(platform("https://www.tiktok.com/@a/video/1"), "tiktok");
    assert.equal(platform("https://vimeo.com/12345"), "vimeo");
    assert.equal(platform("https://example.com/blog/istanbul"), "web");
  });
  it("does not mistake look-alike hosts for a platform", () => {
    assert.equal(parseLink("https://pinterest.com.evil.example/x")?.platform, "web");
    assert.equal(parseLink("https://notinstagram.com/x")?.platform, "web");
    assert.equal(parseLink("https://youtube.com.example.org/x")?.platform, "web");
  });
  it("adds https when no scheme is typed", () => {
    assert.equal(parseLink("pinterest.com/pin/99")?.url, "https://pinterest.com/pin/99");
    assert.equal(parseLink("  https://youtu.be/abc  ")?.host, "youtu.be");
  });
  it("rejects anything that is not a plain http(s) link", () => {
    for (const bad of [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd", "ftp://example.com/x",
      "https://user:pass@example.com/x", "https://localhost/x", "https://exa mple.com", "not a link at all", "http://", "vbscript:x",
      `https://example.com/${"a".repeat(2100)}`, "https://example.com/\u0000x",
    ]) assert.equal(code(() => parseLink(bad)), "validation", bad.slice(0, 40));
  });
  it("treats empty input as no link", () => {
    for (const v of ["", "   ", undefined, null]) assert.equal(parseLink(v), null);
  });
});

describe("money", () => {
  it("parses to cents", () => {
    assert.equal(money("12"), 1200);
    assert.equal(money("12.5"), 1250);
    assert.equal(money("1,250.00"), 125000);
    assert.equal(money("0"), 0);
    assert.equal(money(7), 700);
    assert.equal(money(""), null);
    assert.equal(money(undefined), null);
    assert.equal(money("0.07"), 7);
    assert.equal(money("19.99"), 1999); // no floating-point drift
  });
  it("rejects negatives, junk, excess precision and huge numbers", () => {
    for (const bad of ["-1", "abc", "1.234", "1e5", "12 USD", "1..2", "99999999999", "10000000.01"]) assert.equal(code(() => money(bad)), "validation", bad);
    assert.equal(money("10000000"), 1_000_000_000);
  });
  it("formats amounts and ranges", () => {
    assert.equal(formatMoney(25000, "INR"), "₹250");
    assert.equal(formatMoney(1250, "EUR"), "€12.50");
    assert.equal(formatRange(0, 0, "INR"), "Free");
    assert.equal(formatRange(1500, 4000, "EUR"), "€15 – €40");
    assert.equal(formatRange(500, 500, "EUR"), "€5");
    assert.equal(formatMoney(100, "NOTACURRENCY"), "1.00 NOTACURRENCY");
  });
});

describe("dates and durations", () => {
  it("accepts real calendar dates only", () => {
    assert.equal(formatDate(parseDate("2026-10-12")), "2026-10-12");
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-1", "10/12/2026", "", "2026-10-12T00:00", "1800-01-01", "2200-01-01", null]) {
      assert.equal(code(() => parseDate(bad)), "validation", String(bad));
    }
    assert.doesNotThrow(() => parseDate("2028-02-29")); // leap day
    assert.equal(code(() => parseDate("2027-02-29")), "validation");
  });
  it("counts trip days inclusively and enforces limits", () => {
    assert.equal(tripLength("2026-10-12", "2026-10-12"), 1);
    assert.equal(tripLength("2026-10-12", "2026-10-18"), 7);
    assert.equal(tripLength("2026-12-30", "2027-01-02"), 4); // across a year boundary
    assert.equal(tripLength("2026-01-01", "2026-03-01"), 60);
    assert.equal(code(() => tripLength("2026-01-01", "2026-03-02")), "validation");
    assert.equal(code(() => tripLength("2026-10-12", "2026-10-11")), "validation");
  });
  it("dates a trip day", () => {
    assert.equal(dayDate("2026-10-12", 1), "2026-10-12");
    assert.equal(dayDate("2026-10-30", 3), "2026-11-01");
  });
  it("durations are whole minutes", () => {
    assert.equal(duration("90"), 90);
    assert.equal(duration(""), null);
    for (const bad of ["0", "-5", "1.5", "abc", "1441"]) assert.equal(code(() => duration(bad)), "validation", bad);
    assert.equal(formatDuration(45), "45 min");
    assert.equal(formatDuration(120), "2 h");
    assert.equal(formatDuration(95), "1 h 35 min");
  });
});

describe("text", () => {
  it("normalises, bounds and refuses control characters", () => {
    assert.equal(text("  a   b\n c ", "T", { max: 20 }), "a b c");
    assert.equal(code(() => text("", "T", { max: 5, required: true })), "validation");
    assert.equal(code(() => text("x".repeat(6), "T", { max: 5 })), "validation");
    assert.equal(code(() => text("a\u0000b", "T", { max: 20 })), "validation");
    assert.equal(notes("line one\r\nline two  "), "line one\nline two");
    assert.equal(code(() => notes("bad\u0007")), "validation");
    assert.equal(code(() => notes("x".repeat(2001))), "validation");
  });
});

describe("visitor identity", () => {
  it("makes unguessable tokens and stores only a hash", () => {
    const a = newOwnerToken();
    assert.ok(isValidOwnerToken(a));
    assert.notEqual(a, newOwnerToken());
    assert.match(hashOwner(a), /^[0-9a-f]{64}$/);
    assert.ok(!hashOwner(a).includes(a));
    assert.equal(hashOwner(a), hashOwner(a));
  });
  it("rejects anything that is not one of our tokens", () => {
    for (const bad of [undefined, null, "", "short", "x".repeat(44), "../../etc/passwd" + "a".repeat(30), 5]) assert.equal(isValidOwnerToken(bad), false);
  });
});

function formatDate(n: number) {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}
