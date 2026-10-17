// Google Business Profile (Google Maps) metrics through Windsor.ai; the tables are in supabase/migrations/20261017000000_google_profile.sql.
// No "@/" imports: the pure part is tested with plain Node (google-profile.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { windsorRows } from "./windsor.ts";

export const MAX_DAYS = 120; // shortcut: one query returns at most 1000 rows (3 locations x 120 days fit), page the reads before adding many more locations
const dayOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10); // Vietnam day of a timestamp
const windsor = (fields: string[], from: string, to: string) => windsorRows("google_my_business", fields, from, to);

/** Pulls [from, to] (yyyy-mm-dd) from Windsor and upserts it; Google fills the last days in late, so the cron re-pulls the recent weeks. */
export async function syncGoogleProfile(db: SupabaseClient, from: string, to: string) {
  const n = (v: unknown) => Math.round(Number(v) || 0);
  const days = (await windsor(["account_id", "account_name", "date", "call_clicks", "direction_requests", "website_clicks", "business_bookings", "business_food_menu_clicks"], from, to))
    .map((r) => ({ location_id: String(r.account_id), location_name: String(r.account_name), day: String(r.date), call_clicks: n(r.call_clicks), direction_requests: n(r.direction_requests), website_clicks: n(r.website_clicks), bookings: n(r.business_bookings), menu_clicks: n(r.business_food_menu_clicks), fetched_at: new Date().toISOString() }));
  const posts = (await windsor(["account_id", "post_id", "post_create_time"], from, to)).filter((r) => r.post_id && r.post_create_time)
    .map((r) => ({ post_id: String(r.post_id), location_id: String(r.account_id), created_at: String(r.post_create_time) }));
  if (days.length) { const { error } = await db.from("google_profile_days").upsert(days); if (error) throw new Error(error.message); }
  if (posts.length) { const { error } = await db.from("google_profile_posts").upsert(posts); if (error) throw new Error(error.message); }
  return { days: days.length, posts: posts.length };
}

export type DayRow = { location_id: string; location_name: string; day: string; call_clicks: number; direction_requests: number; website_clicks: number; bookings: number; menu_clicks: number };
export type PostRow = { post_id: string; location_id: string; created_at: string };
export type LocationTotals = { id: string; name: string; engagement: number; calls: number; directions: number; website: number; bookingMenu: number; posts: number; days: number };

/** Per location, the six figures of the "C. Bc Tiếp Cận" workbook. engagement = calls + directions + website clicks + booking/menu clicks (how the workbook adds it up). */
export function summarize(days: DayRow[], posts: PostRow[], from: string, to: string): LocationTotals[] {
  const byLocation = new Map<string, LocationTotals>();
  for (const d of days) {
    if (d.day < from || d.day > to) continue;
    const t = byLocation.get(d.location_id) ?? { id: d.location_id, name: d.location_name, engagement: 0, calls: 0, directions: 0, website: 0, bookingMenu: 0, posts: 0, days: 0 };
    t.calls += d.call_clicks; t.directions += d.direction_requests; t.website += d.website_clicks; t.bookingMenu += d.bookings + d.menu_clicks; t.days++;
    t.engagement = t.calls + t.directions + t.website + t.bookingMenu;
    byLocation.set(d.location_id, t);
  }
  for (const p of posts) { const d = dayOf(p.created_at); if (d >= from && d <= to) { const t = byLocation.get(p.location_id); if (t) t.posts++; } }
  return [...byLocation.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type DailyRow = Omit<LocationTotals, "days"> & { day: string };

/** One row per location and day, newest day first: the same six figures as summarize, so the daily rows add up to the period totals. */
export function dailyRows(days: DayRow[], posts: PostRow[], from: string, to: string): DailyRow[] {
  const rows = new Map<string, DailyRow>();
  for (const d of days) {
    if (d.day < from || d.day > to) continue;
    const bookingMenu = d.bookings + d.menu_clicks;
    rows.set(`${d.day}|${d.location_id}`, { day: d.day, id: d.location_id, name: d.location_name, calls: d.call_clicks, directions: d.direction_requests, website: d.website_clicks, bookingMenu, engagement: d.call_clicks + d.direction_requests + d.website_clicks + bookingMenu, posts: 0 });
  }
  for (const p of posts) { const r = rows.get(`${dayOf(p.created_at)}|${p.location_id}`); if (r) r.posts++; } // a post on a day Windsor sent no figures for is only in the period total
  return [...rows.values()].sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
}

export async function readGoogleProfile(db: SupabaseClient, from: string, to: string) {
  const [days, posts, latest] = await Promise.all([
    db.from("google_profile_days").select("*").gte("day", from).lte("day", to),
    db.from("google_profile_posts").select("*").gte("created_at", `${from}T00:00:00+07:00`).lte("created_at", `${to}T23:59:59+07:00`),
    db.from("google_profile_days").select("fetched_at").order("fetched_at", { ascending: false }).limit(1),
  ]);
  if (days.error || posts.error) throw new Error((days.error ?? posts.error)!.message);
  return { locations: summarize(days.data as DayRow[], posts.data as PostRow[], from, to), daily: dailyRows(days.data as DayRow[], posts.data as PostRow[], from, to), fetchedAt: (latest.data?.[0]?.fetched_at as string | undefined) ?? null };
}
