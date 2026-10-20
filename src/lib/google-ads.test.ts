import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGoogleAds } from "./google-ads.ts";

test("campaign totals add the days, daily rows are newest first, ratios guard against zero", () => {
  const days = [
    { date: "2026-10-08", campaign_id: "g1", campaign: "TPVH", spend: 100, impressions: 1000, clicks: 50, conversions: 2 },
    { date: "2026-10-09", campaign_id: "g1", campaign: "TPVH", spend: 50, impressions: 500, clicks: null, conversions: null },
    { date: "2026-10-09", campaign_id: "g2", campaign: "Brand", spend: 10, impressions: 100, clicks: 0, conversions: 0 },
    { date: "2026-09-01", campaign_id: "g1", campaign: "TPVH", spend: 999, impressions: 1, clicks: 1, conversions: 1 },
  ];
  const { campaigns, daily } = summarizeGoogleAds(days, "2026-10-01", "2026-10-19");
  assert.deepEqual(campaigns.map((c) => [c.campaign, c.spend, c.impressions, c.clicks, c.ctr, c.cpc, c.costPerConversion]), [["TPVH", 150, 1500, 50, 50 / 1500, 3, 75], ["Brand", 10, 100, 0, 0, 0, 0]]);
  assert.deepEqual(daily.map((d) => [d.day, d.campaign]), [["2026-10-09", "Brand"], ["2026-10-09", "TPVH"], ["2026-10-08", "TPVH"]]);
});
