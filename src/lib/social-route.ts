import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { addDays, isDate, todayVN } from "@/lib/bluejay-metrics";
import { SYNC_DAYS, syncSocial, type Source } from "@/lib/social-store";

/** GET = figures of a date range from the stored days; POST = the page button, re-pulls the last SYNC_DAYS days from Windsor. */
export function socialRoute(source: Source, maxDays: number, read: (db: SupabaseClient, from: string, to: string) => Promise<object>) {
  const fail = (message: string, status: number) => Response.json({ message }, { status });
  return {
    async GET(request: Request) {
      const denied = await bluejayViewer();
      if (denied) return fail(denied.message, denied.status);
      const q = new URL(request.url).searchParams;
      const from = q.get("from"), to = q.get("to");
      if (!isDate(from) || !isDate(to) || from > to) return fail("Ngày không hợp lệ.", 400);
      if (addDays(from, maxDays - 1) < to) return fail(`Chọn tối đa ${maxDays} ngày.`, 400);
      try {
        return Response.json(await read(serviceDb(), from, to));
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e), 502);
      }
    },
    async POST() {
      const denied = await bluejayViewer();
      if (denied) return fail(denied.message, denied.status);
      try {
        const today = todayVN();
        return Response.json(await syncSocial(serviceDb(), source, addDays(today, -SYNC_DAYS), today));
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e), 502);
      }
    },
  };
}
