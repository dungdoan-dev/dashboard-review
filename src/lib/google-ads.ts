// Google Ads through Windsor.ai (connector "google_ads"), stored by social-store.ts (cron + the page button), read from the stored days.
// No "@/" imports: the pure part is tested with plain Node (google-ads.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStored } from "./social-store.ts";
import type { WindsorRow } from "./windsor.ts";

export const GADS_MAX_DAYS = 120;
const n = (v: unknown) => Number(v) || 0;
const ratio = (a: number, b: number) => (b ? a / b : 0);

export type GadsDaily = { day: string; id: string; campaign: string; spend: number; impressions: number; clicks: number; conversions: number };
export type GadsTotals = Omit<GadsDaily, "day"> & { ctr: number; cpc: number; costPerConversion: number };

/** Per campaign for the range (days added up) and per campaign and day (newest first). Money is in the account currency (VND). */
export function summarizeGoogleAds(days: WindsorRow[], from: string, to: string) {
  const daily: GadsDaily[] = days.filter((r) => String(r.date) >= from && String(r.date) <= to).map((r) => ({
    day: String(r.date), id: String(r.campaign_id), campaign: String(r.campaign), spend: n(r.spend), impressions: n(r.impressions), clicks: n(r.clicks), conversions: n(r.conversions),
  })).sort((a, b) => b.day.localeCompare(a.day) || a.campaign.localeCompare(b.campaign));
  const byCampaign = new Map<string, Omit<GadsTotals, "ctr" | "cpc" | "costPerConversion">>();
  for (const d of daily) {
    const t = byCampaign.get(d.id) ?? { id: d.id, campaign: d.campaign, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    t.spend += d.spend; t.impressions += d.impressions; t.clicks += d.clicks; t.conversions += d.conversions;
    byCampaign.set(d.id, t);
  }
  const campaigns: GadsTotals[] = [...byCampaign.values()].map((t) => ({ ...t, ctr: ratio(t.clicks, t.impressions), cpc: ratio(t.spend, t.clicks), costPerConversion: ratio(t.spend, t.conversions) })).sort((a, b) => b.spend - a.spend);
  return { campaigns, daily };
}

export async function readGoogleAds(db: SupabaseClient, from: string, to: string) {
  const stored = await readStored(db, "gads", from, to);
  return { ...summarizeGoogleAds(stored.days, from, to), fetchedAt: stored.fetchedAt };
}
