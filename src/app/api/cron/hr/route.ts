import { serviceDb } from "@/lib/bluejay";
import { syncHr } from "@/lib/hr-sync";

export const maxDuration = 60;

// Daily at 08:00 VN (01:00 UTC): copies the staff of every HR Google Sheet in the Drive folder into the database.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncHr(serviceDb());
    return Response.json(result, { status: Object.values(result).some((r) => typeof r === "object") ? 500 : 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
