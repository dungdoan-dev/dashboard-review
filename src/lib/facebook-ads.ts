// Facebook Ads through Windsor.ai (connector "facebook"), stored by social-store.ts (cron + the page button), read from the stored days.
// No "@/" imports: the pure part is tested with plain Node (facebook-ads.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADS_MESSAGES, readStored } from "./social-store.ts";
import { windsorRows, type WindsorRow } from "./windsor.ts";

export const ADS_MAX_DAYS = 120;
const n = (v: unknown) => Number(v) || 0;
const MESSAGES = ADS_MESSAGES;

/** results = the campaign's own goal as Ads Manager's "Kết quả" column (resultType says which: ThruPlays for video campaigns, conversations for message campaigns). */
export type AdsDaily = { day: string; id: string; campaign: string; spend: number; impressions: number; reach: number; clicks: number; linkClicks: number; messages: number; results: number; resultType: string };
/** reach is people over the whole range (Windsor answers once for it), so it is not the sum of the days. */
export type AdsTotals = Omit<AdsDaily, "day"> & { frequency: number; ctr: number; cpc: number; costPerMessage: number; costPerResult: number };

const ratio = (a: number, b: number) => (b ? a / b : 0);

/** Windsor's "results" of one day row: [{ indicator, values: [{ value }] }], the first entry is the campaign goal. */
function resultOf(r: WindsorRow) {
  const first = (Array.isArray(r.results) ? r.results[0] : null) as { indicator?: string; values?: { value?: string | number }[] } | null;
  return { type: first?.indicator ?? "", value: n(first?.values?.[0]?.value) };
}

/** Name shown for a result indicator. */
export function resultLabel(type: string) {
  if (/thruplay/.test(type)) return "Lượt ThruPlay";
  if (/messaging_conversation_started/.test(type)) return "Cuộc trò chuyện qua tin nhắn";
  if (/link_click/.test(type)) return "Lượt click liên kết";
  if (/post_engagement|post_interaction/.test(type)) return "Lượt tương tác bài viết";
  if (/like/.test(type)) return "Lượt thích";
  return type.replace(/^actions:/, "");
}

/** Per campaign for the range (from the range query) and per campaign and day (newest first). Money is in the account currency (VND). */
export function summarizeAds(days: WindsorRow[], period: WindsorRow[], from: string, to: string) {
  const daily: AdsDaily[] = days.filter((r) => String(r.date) >= from && String(r.date) <= to).map((r) => ({
    day: String(r.date), id: String(r.campaign_id), campaign: String(r.campaign), spend: n(r.spend), impressions: n(r.impressions),
    reach: n(r.reach), clicks: n(r.clicks), linkClicks: n(r.link_clicks), messages: n(r[MESSAGES]), results: resultOf(r).value, resultType: resultOf(r).type,
  })).sort((a, b) => b.day.localeCompare(a.day) || a.campaign.localeCompare(b.campaign));
  // results add up over the days (a campaign keeps one goal; if it changed, the goal with the most results is shown)
  const goals = new Map<string, Map<string, number>>();
  for (const d of daily) if (d.resultType) { const g = goals.get(d.id) ?? new Map<string, number>(); g.set(d.resultType, (g.get(d.resultType) ?? 0) + d.results); goals.set(d.id, g); }
  // the range query can come back from Windsor's cache with names from before a rename: the name of the newest stored day with spend wins
  const names = new Map<string, string>();
  for (const d of daily) if (d.spend > 0 && !names.has(d.id)) names.set(d.id, d.campaign); // days without spend can be left over from before a rename
  const campaigns: AdsTotals[] = period.map((r) => {
    const [resultType, results] = [...(goals.get(String(r.campaign_id)) ?? [])].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const t = { id: String(r.campaign_id), campaign: names.get(String(r.campaign_id)) ?? String(r.campaign), spend: n(r.spend), impressions: n(r.impressions), reach: n(r.reach), clicks: n(r.clicks), linkClicks: n(r.link_clicks), messages: n(r[MESSAGES]), results, resultType };
    return { ...t, frequency: ratio(t.impressions, t.reach), ctr: ratio(t.clicks, t.impressions), cpc: ratio(t.spend, t.clicks), costPerMessage: ratio(t.spend, t.messages), costPerResult: ratio(t.spend, results) };
  }).sort((a, b) => b.spend - a.spend);
  return { campaigns, daily };
}

/** The range totals per campaign added up from the days: everything is exact except reach (people), which is then the sum of the days. */
export function sumByCampaign(days: WindsorRow[]): WindsorRow[] {
  const keys = ["spend", "impressions", "reach", "clicks", "link_clicks", ADS_MESSAGES];
  const byCampaign = new Map<string, WindsorRow>();
  for (const r of days) {
    const t = byCampaign.get(String(r.campaign_id)) ?? { campaign_id: r.campaign_id, campaign: r.campaign, ...Object.fromEntries(keys.map((k) => [k, 0])) };
    for (const k of keys) t[k] = n(t[k]) + n(r[k]);
    byCampaign.set(String(r.campaign_id), t);
  }
  return [...byCampaign.values()];
}

export async function readFacebookAds(db: SupabaseClient, from: string, to: string) {
  const [stored, period] = await Promise.all([
    readStored(db, "ads", from, to),
    // no date field: reach comes back as people over the whole range; when Windsor does not answer, the totals are added up from the stored days
    windsorRows("facebook", ["campaign_id", "campaign", "spend", "impressions", "reach", "clicks", "link_clicks", ADS_MESSAGES], from, to).catch(() => []),
  ]);
  return { ...summarizeAds(stored.days, period.length ? period : sumByCampaign(stored.days), from, to), fetchedAt: stored.fetchedAt };
}
