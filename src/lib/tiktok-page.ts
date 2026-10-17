// TikTok figures through Windsor.ai (connector "tiktok_organic"), read live for the chosen range; nothing is stored.
// Windsor only serves the last 60 days of TikTok Organic, so older ranges come back as an error from Windsor.
// No "@/" imports: the pure part is tested with plain Node (tiktok-page.test.ts).
import { windsorRows, type WindsorRow } from "./windsor.ts";

export const TT_MAX_DAYS = 60;
const dayOf = (iso: string) => new Date(Date.parse(`${iso}Z`) + 7 * 3_600_000).toISOString().slice(0, 10); // video_create_datetime has no zone: taken as UTC
const n = (v: unknown) => Math.round(Number(v) || 0);

export type TtDaily = { day: string; id: string; name: string; views: number; reach: number; profileViews: number; phoneClicks: number; linkClicks: number; follows: number };
export type TtTotals = Omit<TtDaily, "day"> & { posts: number };

/**
 * Per account and day, then per account for the range. Windsor field behind each figure:
 *  views = video_views, reach = engaged_audience (sum of the days, so people on several days count more than once), profileViews = profile_views,
 *  phoneClicks = phone_number_clicks, linkClicks = bio_link_clicks, follows = daily_total_followers (new followers), posts = videos created in the range.
 * No TikTok baseline exists in the "C. Bc Tiếp Cận" workbook (the only linked account has no sheet), so these are not checked against it.
 */
export function summarizeTiktok(days: WindsorRow[], videos: WindsorRow[], from: string, to: string) {
  const daily: TtDaily[] = days.filter((r) => String(r.date) >= from && String(r.date) <= to).map((r) => ({
    day: String(r.date), id: String(r.account_id), name: String(r.account_name),
    views: n(r.video_views), reach: n(r.engaged_audience), profileViews: n(r.profile_views), phoneClicks: n(r.phone_number_clicks), linkClicks: n(r.bio_link_clicks), follows: n(r.daily_total_followers),
  })).sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
  const accounts = new Map<string, TtTotals>();
  for (const d of daily) {
    const t = accounts.get(d.id) ?? { id: d.id, name: d.name, views: 0, reach: 0, profileViews: 0, phoneClicks: 0, linkClicks: 0, follows: 0, posts: 0 };
    t.views += d.views; t.reach += d.reach; t.profileViews += d.profileViews; t.phoneClicks += d.phoneClicks; t.linkClicks += d.linkClicks; t.follows += d.follows;
    accounts.set(d.id, t);
  }
  const seen = new Set<string>();
  for (const v of videos) {
    if (!v.video_id || !v.video_create_datetime || seen.has(String(v.video_id))) continue; // Windsor repeats a video on every day row
    seen.add(String(v.video_id));
    const d = dayOf(String(v.video_create_datetime)), t = accounts.get(String(v.account_id));
    if (t && d >= from && d <= to) t.posts++;
  }
  return { accounts: [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name)), daily };
}

export async function readTiktok(from: string, to: string) {
  const [days, videos] = await Promise.all([
    windsorRows("tiktok_organic", ["account_id", "account_name", "date", "video_views", "engaged_audience", "profile_views", "phone_number_clicks", "bio_link_clicks", "daily_total_followers"], from, to),
    windsorRows("tiktok_organic", ["account_id", "video_id", "video_create_datetime"], from, to),
  ]);
  return summarizeTiktok(days, videos, from, to);
}
