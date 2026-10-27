import { readChannelCounts, serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";

// Bookings and cancellations per channel per week of a month, from the revenue weeks already stored. No call to Blue Jay.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "";
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel)) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  try {
    return Response.json(await readChannelCounts(serviceDb(), hotel, month));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ message }, { status: /không hợp lệ/.test(message) ? 400 : 500 });
  }
}
