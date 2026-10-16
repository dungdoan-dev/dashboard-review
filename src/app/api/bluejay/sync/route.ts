import { plannedWeeks, serviceDb, storedWeeks, syncBusy, syncWeeks } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { inApiWindow, isDate, lastFullWeek, mondayOf } from "@/lib/bluejay-metrics";

export const maxDuration = 300;

const fail = (e: unknown, status = 500) => Response.json({ message: e instanceof Error ? e.message : String(e) }, { status });

// Settings, backfill progress and the last 30 runs, for Cài đặt → Đồng bộ Blue Jay.
export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  try {
    const db = serviceDb();
    const [{ data: settings, error }, { data: runs, error: runsError }] = await Promise.all([
      db.from("bluejay_sync_settings").select("enabled, backfill_from, backfill_to, updated_at").eq("id", 1).maybeSingle(),
      db.from("bluejay_sync_runs").select("id, week_start, trigger, status, message, api_calls, started_at, finished_at").order("started_at", { ascending: false }).limit(30),
    ]);
    if (error || runsError) throw new Error((error ?? runsError)!.message);
    let backfill = null;
    if (settings?.backfill_from && settings.backfill_to) {
      const to = settings.backfill_to < lastFullWeek() ? settings.backfill_to : lastFullWeek();
      const total = settings.backfill_from <= to ? Math.round((Date.parse(to) - Date.parse(settings.backfill_from)) / 7 / 864e5) + 1 : 0;
      backfill = { total, stored: total ? (await storedWeeks(db, settings.backfill_from, to)).size : 0 };
    }
    return Response.json({ settings, runs, backfill, pending: (await plannedWeeks(db)).length, inWindow: inApiWindow() });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const body = await request.json().catch(() => ({}));
  const week = (v: unknown) => (v === null || v === "" || v === undefined ? null : isDate(v) ? mondayOf(v) : undefined);
  const from = week(body.backfill_from), to = week(body.backfill_to);
  if (typeof body.enabled !== "boolean" || from === undefined || to === undefined || (from === null) !== (to === null) || (from && to && from > to)) {
    return Response.json({ message: "Cấu hình không hợp lệ: chọn đủ “từ tuần” và “đến tuần”, từ ≤ đến." }, { status: 400 });
  }
  const { error } = await serviceDb().from("bluejay_sync_settings")
    .upsert({ id: 1, enabled: body.enabled, backfill_from: from, backfill_to: to, updated_at: new Date().toISOString() });
  return error ? fail(error) : Response.json({ ok: true });
}

// "Chạy ngay": same as the cron, started by hand (only inside the API window).
export async function POST() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  if (!inApiWindow()) return Response.json({ message: "Ngoài khung giờ API (00:00–00:59, 08:00–08:30, 16:00–16:59 giờ VN)." }, { status: 409 });
  try {
    const db = serviceDb();
    if (await syncBusy(db)) return Response.json({ message: "Đang có một lượt đồng bộ chạy, thử lại sau." }, { status: 409 });
    return Response.json(await syncWeeks(db, await plannedWeeks(db), "manual", Date.now() + 240_000));
  } catch (e) {
    return fail(e);
  }
}
