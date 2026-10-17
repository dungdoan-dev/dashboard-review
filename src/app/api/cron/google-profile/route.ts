import { serviceDb } from "@/lib/bluejay";
import { addDays, todayVN } from "@/lib/bluejay-metrics";
import { syncGoogleProfile } from "@/lib/google-profile";

export const maxDuration = 60;

// Daily at 07:30 VN: re-pulls the last 35 days of Google Maps figures (Google fills in the latest days late, so recent days are overwritten).
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const today = todayVN();
    return Response.json(await syncGoogleProfile(serviceDb(), addDays(today, -35), today));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
