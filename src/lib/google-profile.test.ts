import test from "node:test";
import assert from "node:assert/strict";
import { dailyRows, summarize, type DayRow } from "./google-profile.ts";

const day = (d: string, over: Partial<DayRow> = {}): DayRow => ({ location_id: "L1", location_name: "Quy Nhon", day: d, call_clicks: 0, direction_requests: 0, website_clicks: 0, bookings: 0, menu_clicks: 0, ...over });

test("sums the period, adds engagement like the workbook, counts posts by Vietnam day", () => {
  const days = [day("2026-09-01", { call_clicks: 4, direction_requests: 23 }), day("2026-09-02", { website_clicks: 2, bookings: 1, menu_clicks: 3 }), day("2026-09-29", { call_clicks: 99 })];
  const posts = [
    { post_id: "a", location_id: "L1", created_at: "2026-09-08T04:32:32Z" },
    { post_id: "b", location_id: "L1", created_at: "2026-09-28T17:30:00Z" }, // 29/09 00:30 in Vietnam: outside
    { post_id: "c", location_id: "L1", created_at: "2026-08-31T17:30:00Z" }, // 01/09 00:30 in Vietnam: inside
  ];
  const [t] = summarize(days, posts, "2026-09-01", "2026-09-28");
  assert.deepEqual({ calls: t.calls, directions: t.directions, website: t.website, bookingMenu: t.bookingMenu, engagement: t.engagement, posts: t.posts, days: t.days }, { calls: 4, directions: 23, website: 2, bookingMenu: 4, engagement: 33, posts: 2, days: 2 });
});

test("daily rows are newest first and add up to the period totals", () => {
  const days = [day("2026-09-01", { call_clicks: 4, direction_requests: 23 }), day("2026-09-02", { website_clicks: 2, bookings: 1, menu_clicks: 3 })];
  const posts = [{ post_id: "a", location_id: "L1", created_at: "2026-09-02T04:00:00Z" }];
  const rows = dailyRows(days, posts, "2026-09-01", "2026-09-28");
  assert.deepEqual(rows.map((r) => [r.day, r.engagement, r.posts]), [["2026-09-02", 6, 1], ["2026-09-01", 27, 0]]);
  assert.equal(rows.reduce((n, r) => n + r.engagement, 0), summarize(days, posts, "2026-09-01", "2026-09-28")[0].engagement);
});
