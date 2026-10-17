import { bluejayViewer } from "@/lib/bluejay-auth";
import { addDays, isDate } from "@/lib/bluejay-metrics";
import { ADS_MAX_DAYS, readFacebookAds } from "@/lib/facebook-ads";

export const maxDuration = 60;

// Facebook Ads figures of a date range, read from Windsor on every call.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const from = q.get("from"), to = q.get("to");
  if (!isDate(from) || !isDate(to) || from > to) return Response.json({ message: "Ngày không hợp lệ." }, { status: 400 });
  if (addDays(from, ADS_MAX_DAYS - 1) < to) return Response.json({ message: `Chọn tối đa ${ADS_MAX_DAYS} ngày.` }, { status: 400 });
  try {
    return Response.json(await readFacebookAds(from, to));
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
