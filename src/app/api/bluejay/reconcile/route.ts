import { readReconcileBookings, serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS, isDate } from "@/lib/bluejay-metrics";

// Stored Blue Jay bookings of one hotel for the ledger period, to reconcile against an uploaded cash ledger. No call to Blue Jay.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), from = q.get("from"), to = q.get("to");
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel)) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  if (!isDate(from) || !isDate(to)) return Response.json({ message: "Ngày không hợp lệ." }, { status: 400 });
  try {
    return Response.json(await readReconcileBookings(serviceDb(), hotel, from, to));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ message }, { status: /Chọn tối đa|không hợp lệ/.test(message) ? 400 : 500 });
  }
}
