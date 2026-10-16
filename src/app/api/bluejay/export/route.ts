import { readReport, readRevenue, serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { workbookFor } from "@/lib/bluejay-excel";
import { BLUEJAY_HOTELS, isDate, mondayOf } from "@/lib/bluejay-metrics";

// Exports only what is already stored: no call to Blue Jay.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return new Response(denied.message, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const week = q.get("week");
  if (!isDate(week)) return new Response("Tuần không hợp lệ.", { status: 400 });
  const monday = mondayOf(week); // any day of the week, like /api/bluejay
  let report, revenue;
  try { const db = serviceDb(); [report, revenue] = await Promise.all([readReport(db, monday), readRevenue(db, monday)]); } catch (e) {
    return new Response(`Không đọc được dữ liệu đã lưu: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
  if (!report) return new Response("Chưa có dữ liệu cho tuần này.", { status: 404 });
  const scopeId = BLUEJAY_HOTELS.find((h) => String(h.id) === q.get("hotel"))?.id ?? null;
  // A hotel added after this week was stored is not in its report: nothing to export for it.
  if (scopeId && !report.hotels.some((h) => h.id === scopeId)) return new Response("Báo cáo tuần này chưa có khách sạn này.", { status: 404 });
  return new Response(new Uint8Array(workbookFor(report, scopeId, revenue)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-tuan-${report.weekNo}-${monday}${scopeId ? `-${scopeId}` : ""}.xlsx"`,
    },
  });
}
