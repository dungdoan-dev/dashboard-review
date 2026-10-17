import { bluejayViewer } from "@/lib/bluejay-auth";
import { addDays, isDate } from "@/lib/bluejay-metrics";
import { TT_MAX_DAYS, readTiktok } from "@/lib/tiktok-page";

export const maxDuration = 60;

// TikTok figures of a date range, read from Windsor on every call (Windsor keeps only the last 60 days).
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const from = q.get("from"), to = q.get("to");
  if (!isDate(from) || !isDate(to) || from > to) return Response.json({ message: "Ngày không hợp lệ." }, { status: 400 });
  if (addDays(from, TT_MAX_DAYS - 1) < to) return Response.json({ message: `Chọn tối đa ${TT_MAX_DAYS} ngày.` }, { status: 400 });
  try {
    return Response.json(await readTiktok(from, to));
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
