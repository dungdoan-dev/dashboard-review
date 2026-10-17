import { plannedWeeks, refreshPayments, serviceDb, syncBusy, syncWeeks } from "@/lib/bluejay";
import { inApiWindow } from "@/lib/bluejay-metrics";

export const maxDuration = 300;

// Runs at the start of each API window (00:05, 08:05, 16:05 VN): the last full week if missing, then missing backfill weeks, then the payment refresh.
// One path per window (/api/cron/bluejay/0, /8, /16) because Vercel Hobby allows each cron job to run only once a day;
// the slot itself is not used, the API window check below decides.
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
    const deadline = Date.now() + 240_000;
    const synced = await syncWeeks(db, weeks, "cron", deadline);
    // Missing weeks come first; the time left goes to re-pulling payments of weeks that still show an open OTA debt.
    const payments = synced.stoppedBy ? null : await refreshPayments(db, deadline);
    return Response.json({ planned: weeks.length, ...synced, payments });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
