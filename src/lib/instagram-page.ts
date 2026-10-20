// Instagram figures through Windsor.ai (connector "instagram", the Instagram Insights source), stored by social-store.ts (cron + the page button), read from the stored days.
// No "@/" imports: the pure part is tested with plain Node (instagram-page.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStored } from "./social-store.ts";
import { windsorRows, type WindsorRow } from "./windsor.ts";

export const IG_MAX_DAYS = 120;
const dayOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10); // Vietnam day of a timestamp
const n = (v: unknown) => Math.round(Number(v) || 0);

export type IgDaily = { day: string; id: string; name: string; views: number; reach: number; engagement: number; linkClicks: number };
export type IgTotals = Omit<IgDaily, "day"> & { posts: number };

/**
 * Per account and day, then per account for the range. Windsor field behind each figure (checked against the "C. Bc Tiếp Cận" workbook, Sept 2026):
 *  views = views, reach = reach (sum of the days, so people seen on several days count more than once: above the workbook figure),
 *  engagement = total_interactions (matched on 3 of 3 accounts), linkClicks = profile_links_taps, posts = media created in the range.
 * views run 3-4 times below the workbook, which has the Meta Business Suite figure. Not available: profile visits, new followers (only the last 30 days),
 * Messenger contacts, response rate.
 */
export function summarizeInstagram(days: WindsorRow[], posts: WindsorRow[], from: string, to: string) {
  const daily: IgDaily[] = days.filter((r) => String(r.date) >= from && String(r.date) <= to).map((r) => ({
    day: String(r.date), id: String(r.account_id), name: String(r.name ?? r.account_name), // name = the profile name; account_name is the @username
    views: n(r.views), reach: n(r.reach), engagement: n(r.total_interactions), linkClicks: n(r.profile_links_taps),
  })).sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
  const accounts = new Map<string, IgTotals>();
  for (const d of daily) {
    const t = accounts.get(d.id) ?? { id: d.id, name: d.name, views: 0, reach: 0, engagement: 0, linkClicks: 0, posts: 0 };
    t.views += d.views; t.reach += d.reach; t.engagement += d.engagement; t.linkClicks += d.linkClicks;
    accounts.set(d.id, t);
  }
  const seen = new Set<string>();
  for (const p of posts) {
    if (!p.media_id || !p.timestamp || seen.has(String(p.media_id))) continue;
    seen.add(String(p.media_id));
    const d = dayOf(String(p.timestamp)), t = accounts.get(String(p.account_id));
    if (t && d >= from && d <= to) t.posts++;
  }
  return { accounts: [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name)), daily };
}

export async function readInstagram(db: SupabaseClient, from: string, to: string) {
  const stored = await readStored(db, "instagram", from, to);
  return { ...summarizeInstagram(stored.days, stored.items, from, to), fetchedAt: stored.fetchedAt };
}
