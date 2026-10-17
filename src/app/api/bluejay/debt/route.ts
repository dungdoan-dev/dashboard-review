import { SyncStop, readDebts, refreshPayments, serviceDb, syncBusy } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { inApiWindow, todayVN } from "@/lib/bluejay-metrics";

export const maxDuration = 300; // refreshPayments stops itself at 240 s

// Open OTA debts from the stored weeks. No call to Blue Jay.
export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  try {
    return Response.json(await readDebts(serviceDb(), todayVN()));
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// "Cập nhật thanh toán": re-pulls the reservations of weeks that still show an OTA debt (only inside the API window, never alongside another pull).
export async function POST() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  if (!inApiWindow()) return Response.json({ message: new SyncStop("window").message }, { status: 409 });
  try {
    const db = serviceDb();
    if (await syncBusy(db)) return Response.json({ message: "Đang có một lượt đồng bộ Blue Jay chạy, thử lại sau vài phút." }, { status: 409 });
    return Response.json(await refreshPayments(db, Date.now() + 240_000));
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
