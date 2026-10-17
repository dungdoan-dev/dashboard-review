import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAds } from "./facebook-ads.ts";

test("campaign totals come from the range query (reach is people), daily rows are newest first, ratios guard against zero", () => {
  const m = "actions_onsite_conversion_messaging_conversation_started_7d";
  const days = [
    { date: "2026-09-01", campaign_id: "c1", campaign: "YZT", spend: 100, impressions: 1000, reach: 600, clicks: 50, link_clicks: 20, [m]: 2 },
    { date: "2026-09-02", campaign_id: "c1", campaign: "YZT", spend: 50, impressions: 500, reach: 400, clicks: null, link_clicks: null, [m]: null },
  ];
  const period = [
    { campaign_id: "c1", campaign: "YZT", spend: 150, impressions: 1500, reach: 800, clicks: 50, link_clicks: 20, [m]: 2 },
    { campaign_id: "c2", campaign: "VTDC", spend: 10, impressions: 100, reach: 90, clicks: 0, link_clicks: 0, [m]: null },
  ];
  const { campaigns, daily } = summarizeAds(days, period, "2026-09-01", "2026-09-28");
  assert.deepEqual(campaigns.map((c) => [c.campaign, c.reach, c.frequency, c.ctr, c.cpc, c.costPerMessage]), [["YZT", 800, 1.875, 50 / 1500, 3, 75], ["VTDC", 90, 100 / 90, 0, 0, 0]]);
  assert.deepEqual(daily.map((d) => [d.day, d.messages]), [["2026-09-02", 0], ["2026-09-01", 2]]);
});
