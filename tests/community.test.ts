import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMUNITY_LIMITS, createCommunityPost, deleteCommunityPost, getCommunityPost, listCommunityPosts, listForModeration,
  moderatePost, reportCommunityPost, toggleHelpful,
} from "../src/lib/voyage/community";
import { seedVoyageContent } from "../src/lib/voyage/seed";
import { memoryDb } from "./helpers";

const base = {
  destinationId: "kozhikode",
  title: "Best time to visit",
  content: "Catch the sunset at 6:15 PM and walk along the old sea pier.",
  category: "tip",
};

function fresh() {
  const db = memoryDb();
  seedVoyageContent(db);
  return db;
}

describe("traveller community (real contributions only)", () => {
  it("starts empty: no invented travellers, likes or verified posts", () => {
    const db = fresh();
    assert.equal(listCommunityPosts(db).length, 0);
  });

  it("stores a contribution with visit details and shows it as the owner's", () => {
    const db = fresh();
    const id = createCommunityPost(db, "me", {
      ...base, authorName: "Rohan K.", placeId: "kozhikode-beach", visitDate: "2025-01-10", spend: "150", timeNeededMin: 90, bestTime: "Weekday evenings",
    });
    const post = getCommunityPost(db, id, "me");
    assert.ok(post);
    assert.equal(post.authorName, "Rohan K.");
    assert.equal(post.visitDate, "2025-01-10");
    assert.equal(post.spendCents, 15000);
    assert.equal(post.timeNeededMin, 90);
    assert.equal(post.helpfulCount, 0);
    assert.equal(post.mine, true);
    assert.equal(getCommunityPost(db, id, "someone-else")?.mine, false);
    assert.equal(getCommunityPost(db, id)?.authorName, "Rohan K.");
  });

  it("defaults the name to Traveller and rejects bad input", () => {
    const db = fresh();
    const id = createCommunityPost(db, "me", base);
    assert.equal(getCommunityPost(db, id)?.authorName, "Traveller");
    assert.throws(() => createCommunityPost(db, "me", { ...base, content: "too short" }), /20 characters/);
    assert.throws(() => createCommunityPost(db, "me", { ...base, destinationId: "nowhere" }), /destination/i);
    assert.throws(() => createCommunityPost(db, "me", { ...base, placeId: "grand-bazaar" }), /does not belong/);
    assert.throws(() => createCommunityPost(db, "me", { ...base, visitDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) }), /future/);
  });

  it("limits how many posts one visitor can make per day", () => {
    const db = fresh();
    for (let i = 0; i < COMMUNITY_LIMITS.postsPerDay; i++) createCommunityPost(db, "spammer", base);
    assert.throws(() => createCommunityPost(db, "spammer", base), /at most/);
    assert.ok(createCommunityPost(db, "other", base));
  });

  it("allows one helpful vote per visitor, toggles it, and blocks voting on your own post", () => {
    const db = fresh();
    const id = createCommunityPost(db, "author", base);
    assert.equal(toggleHelpful(db, "a", id), true);
    assert.equal(getCommunityPost(db, id)?.helpfulCount, 1);
    assert.equal(getCommunityPost(db, id, "a")?.votedByMe, true);
    assert.equal(toggleHelpful(db, "b", id), true);
    assert.equal(getCommunityPost(db, id)?.helpfulCount, 2);
    assert.equal(toggleHelpful(db, "a", id), false);
    assert.equal(getCommunityPost(db, id)?.helpfulCount, 1);
    assert.throws(() => toggleHelpful(db, "author", id), /own/);
  });

  it("only the author can delete a contribution", () => {
    const db = fresh();
    const id = createCommunityPost(db, "author", base);
    assert.throws(() => deleteCommunityPost(db, "intruder", id), /not found/);
    deleteCommunityPost(db, "author", id);
    assert.equal(getCommunityPost(db, id), null);
  });

  it("accepts one report per visitor and hides a post once enough different visitors report it", () => {
    const db = fresh();
    const id = createCommunityPost(db, "author", base);
    reportCommunityPost(db, "r1", { postId: id, reason: "spam" });
    assert.throws(() => reportCommunityPost(db, "r1", { postId: id, reason: "spam" }), /already reported/);
    assert.throws(() => reportCommunityPost(db, "r2", { postId: id, reason: "bogus" }), /Reason/i);
    assert.equal(listCommunityPosts(db).length, 1, "one report does not hide anything");
    reportCommunityPost(db, "r2", { postId: id, reason: "inaccurate", details: "Timings changed." });
    reportCommunityPost(db, "r3", { postId: id, reason: "other" });
    assert.equal(listCommunityPosts(db).length, 0, "three different reporters hide it pending review");
    assert.equal(getCommunityPost(db, id)?.status, "reported");
    assert.throws(() => toggleHelpful(db, "z", id), /not found/);
  });

  it("lets an admin hide, restore and dismiss, and records each decision", () => {
    const db = fresh();
    const id = createCommunityPost(db, "author", base);
    reportCommunityPost(db, "r1", { postId: id, reason: "spam" });
    assert.equal(listForModeration(db).length, 1);
    assert.equal(listForModeration(db)[0].openReports.length, 1);

    assert.throws(() => moderatePost(db, "admin", id, "hide", ""), /required|Note/i);
    moderatePost(db, "admin", id, "hide", "Advertising");
    assert.equal(getCommunityPost(db, id)?.status, "hidden");
    assert.equal(listCommunityPosts(db).length, 0);

    moderatePost(db, "admin", id, "restore", "Checked, fine");
    assert.equal(getCommunityPost(db, id)?.status, "published");
    assert.equal(listForModeration(db).length, 0, "reports were closed");

    const audit = db.prepare("SELECT action FROM audit_log WHERE entity_type = 'community_post' ORDER BY id").all() as { action: string }[];
    assert.deepEqual(audit.map((a) => a.action), ["community_hide", "community_restore"]);
    assert.throws(() => moderatePost(db, "admin", 9999, "dismiss"), /not found/);
  });

  it("filters by destination, place and category", () => {
    const db = fresh();
    createCommunityPost(db, "o", { ...base, placeId: "kozhikode-beach" });
    createCommunityPost(db, "o", { ...base, destinationId: "istanbul", category: "food", title: "Simit by the water" });
    assert.equal(listCommunityPosts(db, { destinationId: "istanbul" }).length, 1);
    assert.equal(listCommunityPosts(db, { category: "food" }).length, 1);
    assert.equal(listCommunityPosts(db, { placeId: "kozhikode-beach" }).length, 1);
    assert.equal(listCommunityPosts(db, { category: "all" }).length, 2);
  });
});


