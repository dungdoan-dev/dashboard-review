import test from "node:test";
import assert from "node:assert/strict";
import { summarizeInstagram } from "./instagram-page.ts";

test("adds the days, counts each media once by Vietnam day (timestamps carry +0000)", () => {
  const days = [
    { account_id: "i1", account_name: "yzistel", date: "2026-09-01", views: 10, reach: 6, total_interactions: 1, profile_links_taps: 0 },
    { account_id: "i1", account_name: "yzistel", date: "2026-09-02", views: 5, reach: 4, total_interactions: null, profile_links_taps: 2 },
  ];
  const posts = [
    { account_id: "i1", media_id: "a", timestamp: "2026-09-02T01:00:06+0000" },
    { account_id: "i1", media_id: "a", timestamp: "2026-09-02T01:00:06+0000" },
    { account_id: "i1", media_id: "b", timestamp: "2026-09-28T17:30:00+0000" }, // 29/09 in Vietnam: outside
  ];
  const { accounts, daily } = summarizeInstagram(days, posts, "2026-09-01", "2026-09-28");
  assert.deepEqual(accounts, [{ id: "i1", name: "yzistel", views: 15, reach: 10, engagement: 1, linkClicks: 2, posts: 1 }]);
  assert.deepEqual(daily.map((d) => d.day), ["2026-09-02", "2026-09-01"]);
});
