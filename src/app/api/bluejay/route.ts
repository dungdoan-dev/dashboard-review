import { SyncStop, listReports, listWeekStarts, readReport, serviceDb, syncBusy, syncWeeks } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { inApiWindow, isDate, lastFullWeek, mondayOf } from "@/lib/bluejay-metrics";

export const maxDuration = 300; // a refresh makes ~30 sequential API calls; syncWeeks stops itself at 240 s

const weekOf = (request: Request) => {
  const week = new URL(request.url).searchParams.get("week");
  return isDate(week) ? mondayOf(week) : lastFullWeek();
};

// Stored weekly report plus up to 12 earlier weeks for the trend charts. No call to Blue Jay.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const monday = weekOf(request);
  try {
    const db = serviceDb();
    const [report, history, weeks] = await Promise.all([readReport(db, monday), listReports(db, monday), listWeekStarts(db, monday)]);
    return Response.json({ monday, report, history, weeks });
  } catch (e) {
    return Response.json({ monday, message: `Không đọc được dữ liệu đã lưu: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}

// "Cập nhật từ Blue Jay": pulls the week again (only inside the API window). Goes through the same logged, non-overlapping
// runner as the cron and "Chạy ngay" in Cài đặt, so two pulls never hit the provider at once.
export async function POST(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const monday = weekOf(request);
  if (!inApiWindow()) return Response.json({ monday, message: new SyncStop("window").message }, { status: 409 });
  try {
    const db = serviceDb();
    if (await syncBusy(db)) return Response.json({ monday, message: "Đang có một lượt đồng bộ Blue Jay chạy, thử lại sau vài phút." }, { status: 409 });
    const r = await syncWeeks(db, [monday], "manual", Date.now() + 240_000);
    if (r.done) return Response.json({ monday });
    return Response.json({ monday, message: r.lastError ?? new SyncStop(r.stoppedBy ?? "window").message }, { status: 502 });
  } catch (e) {
    return Response.json({ monday, message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
