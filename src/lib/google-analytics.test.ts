import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGoogleAnalytics } from "./google-analytics.ts";

test("site and channel totals add the rows, daily is newest first, out-of-range days and zero sessions are handled", () => {
  const row = (date: string, source: string, medium: string, sessions: number, engaged: number) => ({ date, account_id: "1", account_name: "yzistel.com", source, medium, sessions, users: sessions, newusers: 1, engaged_sessions: engaged, screen_page_views: sessions * 2, conversions: null });
  const days = [row("2026-10-08", "google", "organic", 4, 2), row("2026-10-09", "google", "organic", 6, 3), row("2026-10-09", "(direct)", "(none)", 12, 0), row("2026-09-01", "google", "organic", 99, 99)];
  const { sites, channels, daily } = summarizeGoogleAnalytics(days, "2026-10-01", "2026-10-19");
  assert.deepEqual(sites.map((s) => [s.site, s.sessions, s.engagedSessions, s.views, s.conversions, s.engagementRate]), [["yzistel.com", 22, 5, 44, 0, 5 / 22]]);
  assert.deepEqual(channels.map((c) => [c.source, c.medium, c.sessions]), [["(direct)", "(none)", 12], ["google", "organic", 10]]);
  assert.deepEqual(daily.map((d) => [d.day, d.sessions]), [["2026-10-09", 18], ["2026-10-08", 4]]);
  assert.equal(summarizeGoogleAnalytics([row("2026-10-09", "x", "y", 0, 0)], "2026-10-01", "2026-10-19").sites[0].engagementRate, 0);
});
