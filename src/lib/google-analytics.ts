// Google Analytics 4 through Windsor.ai (connector "googleanalytics4"), stored by social-store.ts (cron + the page button), read from the stored days.
// No "@/" imports: the pure part is tested with plain Node (google-analytics.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStored } from "./social-store.ts";
import type { WindsorRow } from "./windsor.ts";

export const GA4_MAX_DAYS = 120;
const n = (v: unknown) => Number(v) || 0;
const ratio = (a: number, b: number) => (b ? a / b : 0);

export type Ga4Totals = { sessions: number; users: number; newUsers: number; engagedSessions: number; views: number; conversions: number; engagementRate: number };
const empty = () => ({ sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, views: 0, conversions: 0 });
const finish = (t: ReturnType<typeof empty>): Ga4Totals => ({ ...t, engagementRate: ratio(t.engagedSessions, t.sessions) });

/** Per site, per source / medium and per site and day (newest first) for the range. Users add up across the source rows, so they can count a person twice: use them to compare, not as the site's unique users. */
export function summarizeGoogleAnalytics(days: WindsorRow[], from: string, to: string) {
  const add = (t: ReturnType<typeof empty>, r: WindsorRow) => {
    t.sessions += n(r.sessions); t.users += n(r.users); t.newUsers += n(r.newusers); t.engagedSessions += n(r.engaged_sessions); t.views += n(r.screen_page_views); t.conversions += n(r.conversions);
  };
  const sites = new Map<string, { id: string; site: string } & ReturnType<typeof empty>>();
  const channels = new Map<string, { id: string; site: string; source: string; medium: string } & ReturnType<typeof empty>>();
  const daily = new Map<string, { day: string; id: string; site: string } & ReturnType<typeof empty>>();
  for (const r of days) {
    if (String(r.date) < from || String(r.date) > to) continue;
    const id = String(r.account_id), site = String(r.account_name), source = String(r.source), medium = String(r.medium);
    add(sites.get(id) ?? sites.set(id, { id, site, ...empty() }).get(id)!, r);
    add(channels.get(`${id}|${source}|${medium}`) ?? channels.set(`${id}|${source}|${medium}`, { id, site, source, medium, ...empty() }).get(`${id}|${source}|${medium}`)!, r);
    add(daily.get(`${id}|${r.date}`) ?? daily.set(`${id}|${r.date}`, { day: String(r.date), id, site, ...empty() }).get(`${id}|${r.date}`)!, r);
  }
  return {
    sites: [...sites.values()].map((t) => ({ ...t, ...finish(t) })).sort((a, b) => b.sessions - a.sessions),
    channels: [...channels.values()].map((t) => ({ ...t, ...finish(t) })).sort((a, b) => b.sessions - a.sessions),
    daily: [...daily.values()].map((t) => ({ ...t, ...finish(t) })).sort((a, b) => b.day.localeCompare(a.day) || a.site.localeCompare(b.site)),
  };
}

export async function readGoogleAnalytics(db: SupabaseClient, from: string, to: string) {
  const stored = await readStored(db, "ga4", from, to);
  return { ...summarizeGoogleAnalytics(stored.days, from, to), fetchedAt: stored.fetchedAt };
}
