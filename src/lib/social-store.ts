// Facebook Page / Instagram / TikTok / Facebook Ads rows from Windsor.ai, kept as raw rows in supabase/migrations/20261020010000_social_metrics.sql.
// No "@/" imports: used by files tested with plain Node.
import type { SupabaseClient } from "@supabase/supabase-js";
import { windsorRows, type WindsorRow } from "./windsor.ts";

export type Source = "facebook" | "instagram" | "tiktok" | "ads" | "gads";
export const ADS_MESSAGES = "actions_onsite_conversion_messaging_conversation_started_7d"; // conversations started with the page from the ad
export const SYNC_DAYS = 35; // each sync re-pulls this many days: the platforms fill the latest days in late (TikTok serves only 60 days)

type Spec = { connector: string; dayFields: string[]; dayKey: string; postFields: string[]; postId: string; postAt: string; utc?: boolean; keyEnv?: string; keep?: (row: WindsorRow) => boolean };
const SPECS: Record<Source, Spec> = {
  facebook: { connector: "facebook_organic", dayKey: "account_id", dayFields: ["account_id", "account_name", "date", "page_impressions", "page_actions_post_reactions_total", "page_views_total", "page_daily_follows_unique"], postFields: ["account_id", "post_id", "post_created_time"], postId: "post_id", postAt: "post_created_time" },
  instagram: { connector: "instagram", keyEnv: "API_WINDSOR_2", dayKey: "account_id", dayFields: ["account_id", "account_name", "name", "date", "views", "reach", "total_interactions", "profile_links_taps"], postFields: ["account_id", "media_id", "timestamp"], postId: "media_id", postAt: "timestamp" },
  tiktok: { connector: "tiktok_organic", dayKey: "account_id", dayFields: ["account_id", "account_name", "date", "video_views", "engaged_audience", "profile_views", "phone_number_clicks", "bio_link_clicks", "daily_total_followers"], postFields: ["account_id", "video_id", "video_create_datetime"], postId: "video_id", postAt: "video_create_datetime", utc: true },
  ads: { connector: "facebook", dayKey: "campaign_id", dayFields: ["date", "campaign_id", "campaign", "spend", "impressions", "reach", "clicks", "link_clicks", ADS_MESSAGES, "results"], postFields: [], postId: "", postAt: "", keep: (r) => Number(r.spend) > 0 || Number(r.impressions) > 0 }, // "results" makes Windsor send every campaign of the account for every day: keep the days that ran
  gads: { connector: "google_ads", dayKey: "campaign_id", dayFields: ["date", "account_name", "campaign_id", "campaign", "spend", "impressions", "clicks", "conversions"], postFields: [], postId: "", postAt: "" },
};

/** Pulls [from, to] (yyyy-mm-dd) from Windsor and upserts the day rows and posts. */
export async function syncSocial(db: SupabaseClient, source: Source, from: string, to: string) {
  const s = SPECS[source], at = new Date().toISOString();
  // Windsor can answer one exact range with an empty list for a while (seen for ads, 36 days) while the same range one day wider works: retry once from the day before.
  const pull = async (fields: string[]) => {
    const rows = await windsorRows(s.connector, fields, from, to, s.keyEnv);
    return rows.length ? rows : windsorRows(s.connector, fields, new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10), to, s.keyEnv);
  };
  const [dayRows, postRows] = await Promise.all([pull(s.dayFields), s.postFields.length ? pull(s.postFields) : []]);
  // Windsor can repeat a row; one upsert may not carry the same key twice.
  const days = new Map(dayRows.filter((r) => r[s.dayKey] && r.date && (s.keep?.(r) ?? true)).map((r) => [`${r[s.dayKey]}|${r.date}`, { source, key: String(r[s.dayKey]), day: String(r.date), row: r, fetched_at: at }]));
  const posts = new Map(postRows.filter((r) => r[s.postId] && r[s.postAt]).map((r) => [String(r[s.postId]), { source, post_id: String(r[s.postId]), created_at: new Date(`${r[s.postAt]}${s.utc ? "Z" : ""}`).toISOString(), row: r }]));
  if (days.size) { const { error } = await db.from("social_days").upsert([...days.values()]); if (error) throw new Error(error.message); }
  if (posts.size) { const { error } = await db.from("social_posts").upsert([...posts.values()]); if (error) throw new Error(error.message); }
  return { days: days.size, posts: posts.size };
}

/** Stored rows of [from, to]: the day rows and the posts as Windsor sent them, so the summarize functions run on them unchanged. */
export async function readStored(db: SupabaseClient, source: Source, from: string, to: string) {
  const page = async (table: "social_days" | "social_posts", column: string, tie: string, lo: string, hi: string) => {
    const rows: WindsorRow[] = [];
    for (let start = 0; ; start += 1000) { // one query returns at most 1000 rows
      const { data, error } = await db.from(table).select("row").eq("source", source).gte(column, lo).lte(column, hi).order(column).order(tie).range(start, start + 999);
      if (error) throw new Error(error.message);
      rows.push(...data.map((d) => d.row as WindsorRow));
      if (data.length < 1000) return rows;
    }
  };
  const [days, items, latest] = await Promise.all([
    page("social_days", "day", "key", from, to),
    page("social_posts", "created_at", "post_id", `${from}T00:00:00+07:00`, `${to}T23:59:59+07:00`),
    db.from("social_days").select("fetched_at").eq("source", source).order("fetched_at", { ascending: false }).limit(1),
  ]);
  return { days, items, fetchedAt: (latest.data?.[0]?.fetched_at as string | undefined) ?? null };
}
