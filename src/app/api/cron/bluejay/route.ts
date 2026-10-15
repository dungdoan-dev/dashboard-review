import { plannedWeeks, serviceDb, syncBusy, syncWeeks } from "@/lib/bluejay";
import { inApiWindow } from "@/lib/bluejay-metrics";

export const maxDuration = 300;

// Runs at the start of each API window (00:05, 08:05, 16:05 VN): the last full week if missing, then missing backfill weeks.
// Settings and the run log are in Cài đặt → Đồng bộ Blue Jay.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!inApiWindow()) return Response.json({ skipped: "outside_api_window" });
  try {
    const db = serviceDb();
    if (await syncBusy(db)) return Response.json({ skipped: "already_running" });
    const weeks = await plannedWeeks(db);
    return Response.json({ planned: weeks.length, ...(await syncWeeks(db, weeks, "cron", Date.now() + 240_000)) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
