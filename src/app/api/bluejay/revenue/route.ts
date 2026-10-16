import { readRevenue, serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { isDate, mondayOf } from "@/lib/bluejay-metrics";

// Stored revenue report of one week. No call to Blue Jay; "Cập nhật từ Blue Jay" on the operations report refreshes both.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const week = new URL(request.url).searchParams.get("week");
  if (!isDate(week)) return Response.json({ message: "Tuần không hợp lệ." }, { status: 400 });
  const monday = mondayOf(week);
  try {
    return Response.json({ monday, revenue: await readRevenue(serviceDb(), monday) });
  } catch (e) {
    return Response.json({ monday, message: `Không đọc được dữ liệu đã lưu: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
