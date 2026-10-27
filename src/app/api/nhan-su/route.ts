import { serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { readHr, syncHr } from "@/lib/hr-sync";

export const maxDuration = 60;

const fail = (message: string, status: number) => Response.json({ message }, { status });

// Staff of the HR Google Sheets from the database (GET); the page button copies them from the sheets now (POST).
export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  try {
    return Response.json(await readHr(serviceDb()));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}

export async function POST() {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  try {
    return Response.json(await syncHr(serviceDb()));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}
