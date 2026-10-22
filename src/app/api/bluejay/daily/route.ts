import { readDailyRevenue, serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { isDate } from "@/lib/bluejay-metrics";

// Revenue per day of stay for any date range, computed from the revenue weeks already stored. No call to Blue Jay.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const from = q.get("from"), to = q.get("to");
  if (!isDate(from) || !isDate(to)) return Response.json({ message: "Ngày không hợp lệ." }, { status: 400 });
  try {
    return Response.json(await readDailyRevenue(serviceDb(), from, to));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ message }, { status: /Chọn tối đa|không hợp lệ/.test(message) ? 400 : 500 });
  }
}
