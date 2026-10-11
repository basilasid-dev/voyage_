import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminConfig, createSession, destroySession, hashPassword, RateLimiter, SESSION_TTL_MS, validateSession, verifyPassword,
} from "../src/lib/admin/auth-core";
import { memoryDb } from "./helpers";

describe("passwords", () => {
  it("hashes with a random salt and verifies in either direction", () => {
    const a = hashPassword("correct horse battery");
    const b = hashPassword("correct horse battery");
    assert.notEqual(a, b);
    assert.match(a, /^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/); // no "$": safe inside .env files
    assert.equal(verifyPassword("correct horse battery", a), true);
    assert.equal(verifyPassword("correct horse batterY", a), false);
    assert.equal(verifyPassword("", a), false);
  });
  it("rejects malformed stored hashes instead of throwing", () => {
    for (const bad of ["", "plain", "scrypt:1:2:3", "scrypt:x:8:1:aa:bb", "bcrypt:1:2:3:aa:bb", "scrypt:16384:8:1:aaaa:"]) {
      assert.equal(verifyPassword("anything", bad), false, bad);
    }
  });
});

describe("admin configuration fails closed", () => {
  const hash = hashPassword("a long enough passphrase");
  it("is unavailable when nothing is configured", () => {
    const c = adminConfig({});
    assert.equal(c.configured, false);
    assert.equal(c.verify("anything"), false);
    assert.equal(c.verify(""), false);
    assert.match(c.problem ?? "", /not configured/);
  });
  it("accepts the hashed password", () => {
    const c = adminConfig({ ADMIN_PASSWORD_HASH: hash, ADMIN_NAME: "Basil" });
    assert.equal(c.configured, true);
    assert.equal(c.actor, "Basil");
    assert.equal(c.verify("a long enough passphrase"), true);
    assert.equal(c.verify("wrong"), false);
  });
  it("rejects an invalid hash setting rather than falling back to something weaker", () => {
    const c = adminConfig({ ADMIN_PASSWORD_HASH: "not-a-hash", ADMIN_PASSWORD: "dev-password-123" });
    assert.equal(c.configured, false);
    assert.equal(c.verify("dev-password-123"), false);
  });
  it("accepts a plain password only outside production", () => {
    assert.equal(adminConfig({ ADMIN_PASSWORD: "dev-password-123", NODE_ENV: "development" }).verify("dev-password-123"), true);
    const prod = adminConfig({ ADMIN_PASSWORD: "dev-password-123", NODE_ENV: "production" });
    assert.equal(prod.configured, false);
    assert.equal(prod.verify("dev-password-123"), false);
    assert.match(prod.problem ?? "", /ignored in production/);
  });
  it("defaults the audit name and bounds its length", () => {
    assert.equal(adminConfig({ ADMIN_PASSWORD_HASH: hash }).actor, "admin");
    assert.equal(adminConfig({ ADMIN_PASSWORD_HASH: hash, ADMIN_NAME: "x".repeat(200) }).actor.length, 40);
  });
});

describe("sessions", () => {
  it("creates, validates and destroys; the token itself is never stored", () => {
    const db = memoryDb();
    const { token } = createSession(db);
    assert.equal(validateSession(db, token), true);
    const stored = JSON.stringify(db.prepare("SELECT * FROM admin_sessions").all());
    assert.ok(!stored.includes(token));
    destroySession(db, token);
    assert.equal(validateSession(db, token), false);
  });
  it("expires after the TTL and cleans up", () => {
    const db = memoryDb();
    const t0 = Date.now();
    const { token } = createSession(db, t0);
    assert.equal(validateSession(db, token, t0 + SESSION_TTL_MS - 1000), true);
    assert.equal(validateSession(db, token, t0 + SESSION_TTL_MS + 1000), false);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM admin_sessions").get() as { n: number }).n, 0);
  });
  it("rejects guesses, empty and odd tokens", () => {
    const db = memoryDb();
    createSession(db);
    for (const t of [undefined, "", "short", "x".repeat(200), "A".repeat(43), "' OR 1=1 --"]) assert.equal(validateSession(db, t), false);
  });
  it("every login gets a different token", () => {
    const db = memoryDb();
    assert.notEqual(createSession(db).token, createSession(db).token);
  });
});

describe("RateLimiter", () => {
  it("blocks after the maximum and recovers when the window passes", () => {
    let now = 1_000_000;
    const rl = new RateLimiter(3, 60_000, () => now);
    for (let i = 0; i < 3; i++) {
      assert.equal(rl.allowed("ip"), true);
      rl.record("ip");
    }
    assert.equal(rl.allowed("ip"), false);
    assert.equal(rl.retryAfter("ip"), 60);
    assert.equal(rl.allowed("other"), true);
    now += 30_000;
    assert.equal(rl.allowed("ip"), false);
    assert.equal(rl.retryAfter("ip"), 30);
    now += 31_000;
    assert.equal(rl.allowed("ip"), true);
    assert.equal(rl.retryAfter("ip"), 0);
  });
  it("reset clears a key", () => {
    const rl = new RateLimiter(1, 60_000);
    rl.record("k");
    assert.equal(rl.allowed("k"), false);
    rl.reset("k");
    assert.equal(rl.allowed("k"), true);
  });
  it("stays bounded in memory under many distinct keys", () => {
    const rl = new RateLimiter(1, 60_000);
    for (let i = 0; i < 10_500; i++) rl.record(`k${i}`);
    assert.ok((rl as unknown as { hits: Map<string, number[]> }).hits.size <= 10_001);
  });
});
