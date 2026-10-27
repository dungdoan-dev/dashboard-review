// Facebook Page figures through Windsor.ai (connector facebook_organic), stored by social-store.ts (cron + the page button), read from the stored days.
// No "@/" imports: the pure part is tested with plain Node (facebook-page.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStored } from "./social-store.ts";
import { windsorRows, type WindsorRow } from "./windsor.ts";
import { compareReach } from "./reach-order.ts";

export const FB_MAX_DAYS = 120;
const dayOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10); // Vietnam day of a timestamp
const n = (v: unknown) => Math.round(Number(v) || 0);

export type FbDaily = { day: string; id: string; name: string; views: number; engagement: number; visits: number; follows: number };
export type FbTotals = Omit<FbDaily, "day"> & { viewers: number; posts: number };

/**
 * Per page and day, then per page for the range. Windsor field behind each figure (checked against the "C. Bc Tiếp Cận" workbook, Sept 2026):
 *  views = page_impressions (sum of days), viewers = page_total_media_view_unique asked for the whole range (people, so days cannot be added),
 *  engagement = page_actions_post_reactions_total (reactions only; the workbook figure is 5-11% higher), visits = page_views_total,
 *  follows = page_daily_follows_unique (new follows), posts = posts created in the range.
 * Not available from Windsor: link clicks, Messenger contacts, response rate.
 */
export function summarizeFacebook(days: WindsorRow[], period: WindsorRow[], posts: WindsorRow[], from: string, to: string) {
  const daily: FbDaily[] = days.filter((r) => String(r.date) >= from && String(r.date) <= to).map((r) => ({
    day: String(r.date), id: String(r.account_id), name: String(r.account_name),
    views: n(r.page_impressions), engagement: n(r.page_actions_post_reactions_total), visits: n(r.page_views_total), follows: n(r.page_daily_follows_unique),
  })).sort((a, b) => b.day.localeCompare(a.day) || compareReach(a.name, b.name));
  const pages = new Map<string, FbTotals>();
  for (const d of daily) {
    const t = pages.get(d.id) ?? { id: d.id, name: d.name, views: 0, engagement: 0, visits: 0, follows: 0, viewers: 0, posts: 0 };
    t.views += d.views; t.engagement += d.engagement; t.visits += d.visits; t.follows += d.follows;
    pages.set(d.id, t);
  }
  for (const r of period) { const t = pages.get(String(r.account_id)); if (t) t.viewers = n(r.page_total_media_view_unique); }
  const seen = new Set<string>();
  for (const p of posts) {
    if (!p.post_id || !p.post_created_time || seen.has(String(p.post_id))) continue;
    seen.add(String(p.post_id));
    const d = dayOf(String(p.post_created_time)), t = pages.get(String(p.account_id));
    if (t && d >= from && d <= to) t.posts++;
  }
  return { pages: [...pages.values()].sort((a, b) => compareReach(a.name, b.name)), daily };
}

export async function readFacebook(db: SupabaseClient, from: string, to: string) {
  const [stored, period] = await Promise.all([
    readStored(db, "facebook", from, to),
    // people over the whole range cannot be added from days: asked live (no date field, Windsor answers once); without it "Người xem" shows 0
    windsorRows("facebook_organic", ["account_id", "account_name", "page_total_media_view_unique"], from, to, "API_WINDSOR_2").catch(() => []),
  ]);
  return { ...summarizeFacebook(stored.days, period, stored.items, from, to), fetchedAt: stored.fetchedAt };
}
