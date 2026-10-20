import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS, isDate, mondayOf } from "@/lib/bluejay-metrics";
import { LEDGER_SHEETS } from "@/lib/ledger-sheets";
import { sheetLock } from "@/lib/sheet-lock";

const fail = (message: string, status: number) => Response.json({ message }, { status });

async function handle(request: Request, action: "status" | "lock" | "unlock") {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "", week = q.get("week");
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel) || !LEDGER_SHEETS[hotel]) return fail("Khách sạn không hợp lệ hoặc chưa có Google Sheet.", 400);
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("Tháng không hợp lệ.", 400);
  if (action !== "status" && (!isDate(week) || mondayOf(week) !== week)) return fail("Tuần không hợp lệ (cần ngày thứ Hai).", 400);
  try {
    return Response.json(await sheetLock({ action, hotel, month, week: week ?? undefined }));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}

// Weeks already locked in the sheet's tab for the month.
export const GET = (request: Request) => handle(request, "status");
// Lock the rows of one week (Monday) in the sheet.
export const POST = (request: Request) => handle(request, "lock");
export const DELETE = (request: Request) => handle(request, "unlock");
