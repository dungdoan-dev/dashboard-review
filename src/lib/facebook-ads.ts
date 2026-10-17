// Facebook Ads through Windsor.ai (connector "facebook"), read live for the chosen range; nothing is stored.
// No "@/" imports: the pure part is tested with plain Node (facebook-ads.test.ts).
import { windsorRows, type WindsorRow } from "./windsor.ts";

export const ADS_MAX_DAYS = 120;
const n = (v: unknown) => Number(v) || 0;
const MESSAGES = "actions_onsite_conversion_messaging_conversation_started_7d"; // conversations started with the page from the ad

export type AdsDaily = { day: string; id: string; campaign: string; spend: number; impressions: number; reach: number; clicks: number; linkClicks: number; messages: number };
/** reach is people over the whole range (Windsor answers once for it), so it is not the sum of the days. */
export type AdsTotals = Omit<AdsDaily, "day"> & { frequency: number; ctr: number; cpc: number; costPerMessage: number };

const ratio = (a: number, b: number) => (b ? a / b : 0);

/** Per campaign for the range (from the range query) and per campaign and day (newest first). Money is in the account currency (VND). */
export function summarizeAds(days: WindsorRow[], period: WindsorRow[], from: string, to: string) {
  const daily: AdsDaily[] = days.filter((r) => String(r.date) >= from && String(r.date) <= to).map((r) => ({
    day: String(r.date), id: String(r.campaign_id), campaign: String(r.campaign), spend: n(r.spend), impressions: n(r.impressions),
    reach: n(r.reach), clicks: n(r.clicks), linkClicks: n(r.link_clicks), messages: n(r[MESSAGES]),
  })).sort((a, b) => b.day.localeCompare(a.day) || a.campaign.localeCompare(b.campaign));
  const campaigns: AdsTotals[] = period.map((r) => {
    const t = { id: String(r.campaign_id), campaign: String(r.campaign), spend: n(r.spend), impressions: n(r.impressions), reach: n(r.reach), clicks: n(r.clicks), linkClicks: n(r.link_clicks), messages: n(r[MESSAGES]) };
    return { ...t, frequency: ratio(t.impressions, t.reach), ctr: ratio(t.clicks, t.impressions), cpc: ratio(t.spend, t.clicks), costPerMessage: ratio(t.spend, t.messages) };
  }).sort((a, b) => b.spend - a.spend);
  return { campaigns, daily };
}

export async function readFacebookAds(from: string, to: string) {
  const fields = ["campaign_id", "campaign", "spend", "impressions", "reach", "clicks", "link_clicks", MESSAGES];
  const [days, period] = await Promise.all([
    windsorRows("facebook", ["date", ...fields], from, to),
    windsorRows("facebook", fields, from, to), // no date field: reach comes back as people over the whole range
  ]);
  return summarizeAds(days, period, from, to);
}
