import { serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { addDays, isDate, todayVN } from "@/lib/bluejay-metrics";
import { MAX_DAYS, readGoogleProfile, syncGoogleProfile } from "@/lib/google-profile";

export const maxDuration = 60;

// Google Maps figures of a date range from the stored days. No call to Windsor.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const from = q.get("from"), to = q.get("to");
  if (!isDate(from) || !isDate(to) || from > to) return Response.json({ message: "Ngày không hợp lệ." }, { status: 400 });
  if (addDays(from, MAX_DAYS - 1) < to) return Response.json({ message: `Chọn tối đa ${MAX_DAYS} ngày.` }, { status: 400 });
  try {
    return Response.json(await readGoogleProfile(serviceDb(), from, to));
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// "Cập nhật" button: re-pull the last 35 days from Windsor.
export async function POST() {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  try {
    const today = todayVN();
    return Response.json(await syncGoogleProfile(serviceDb(), addDays(today, -35), today));
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
