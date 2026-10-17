import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTiktok } from "./tiktok-page.ts";

test("adds the days, counts each video once by Vietnam day (create time has no zone, taken as UTC)", () => {
  const days = [
    { account_id: "t1", account_name: "Gia Lai", date: "2026-09-29", video_views: 341, engaged_audience: 5, profile_views: 2, phone_number_clicks: 0, bio_link_clicks: 1, daily_total_followers: 3 },
    { account_id: "t1", account_name: "Gia Lai", date: "2026-09-30", video_views: 20, engaged_audience: null, profile_views: 0, phone_number_clicks: 1, bio_link_clicks: 0, daily_total_followers: 0 },
  ];
  const videos = [
    { account_id: "t1", video_id: "a", video_create_datetime: "2026-09-29T09:05:56" },
    { account_id: "t1", video_id: "a", video_create_datetime: "2026-09-29T09:05:56" },
    { account_id: "t1", video_id: "b", video_create_datetime: "2026-09-30T17:30:00" }, // 01/10 in Vietnam: outside
  ];
  const { accounts, daily } = summarizeTiktok(days, videos, "2026-09-01", "2026-09-30");
  assert.deepEqual(accounts, [{ id: "t1", name: "Gia Lai", views: 361, reach: 5, profileViews: 2, phoneClicks: 1, linkClicks: 1, follows: 3, posts: 1 }]);
  assert.deepEqual(daily.map((d) => d.day), ["2026-09-30", "2026-09-29"]);
});
