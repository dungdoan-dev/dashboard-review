import { serviceDb } from "@/lib/bluejay";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { SYNC_DAYS, syncSocial, type Source } from "@/lib/social-store";

export const maxDuration = 60;

// Daily at 07:40 VN: re-pulls the last 35 days of Facebook Page, Instagram, TikTok, Facebook Ads, Google Ads and Google Analytics 4 (the platforms fill in the latest days late). One source failing does not stop the others.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const today = todayVN(), db = serviceDb();
  const sources: Source[] = ["facebook", "instagram", "tiktok", "ads", "gads", "ga4"];
  const results = await Promise.allSettled(sources.map((s) => syncSocial(db, s, addDays(today, -SYNC_DAYS), today)));
  const body = Object.fromEntries(results.map((r, i) => [sources[i], r.status === "fulfilled" ? r.value : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }]));
  return Response.json(body, { status: results.some((r) => r.status === "rejected") ? 500 : 200 });
}
