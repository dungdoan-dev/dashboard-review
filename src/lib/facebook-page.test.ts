import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFacebook } from "./facebook-page.ts";

test("adds the days, takes viewers from the range query, counts each post once by Vietnam day", () => {
  const days = [
    { account_id: "p1", account_name: "Quy Nhon", date: "2026-09-01", page_impressions: 100, page_actions_post_reactions_total: 5, page_views_total: 10, page_daily_follows_unique: 1 },
    { account_id: "p1", account_name: "Quy Nhon", date: "2026-09-02", page_impressions: 50, page_actions_post_reactions_total: null, page_views_total: 7, page_daily_follows_unique: 0 },
  ];
  const period = [{ account_id: "p1", account_name: "Quy Nhon", page_total_media_view_unique: 120 }]; // not 60 + 90: people are not additive
  const posts = [
    { account_id: "p1", post_id: "a", post_created_time: "2026-09-08T04:00:00Z" },
    { account_id: "p1", post_id: "a", post_created_time: "2026-09-08T04:00:00Z" }, // Windsor repeats a post per row
    { account_id: "p1", post_id: "b", post_created_time: "2026-09-28T17:30:00Z" }, // 29/09 in Vietnam: outside
  ];
  const { pages, daily } = summarizeFacebook(days, period, posts, "2026-09-01", "2026-09-28");
  assert.deepEqual(pages, [{ id: "p1", name: "Quy Nhon", views: 150, engagement: 5, visits: 17, follows: 1, viewers: 120, posts: 1 }]);
  assert.deepEqual(daily.map((d) => d.day), ["2026-09-02", "2026-09-01"]);
});
