import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { branchSheets, saveBranchSheet } from "@/lib/branch-sheets";
import { checkSheet, serviceAccountEmail } from "@/lib/google-sheets";
import { isSheetKind, sheetIdFromLink, sheetUrl } from "@/lib/ledger-sheets";

const fail = (message: string, status: number) => Response.json({ message }, { status });
const BAD_LINK = "Link không đúng: dán link Google Sheet (docs.google.com/spreadsheets/d/…) hoặc mã của sheet.";

// Cài đặt → Link Google Sheet: the two links of every branch (hotel; Ăn sáng, cafe, mini mart). Admin only.
export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  try {
    const links = await branchSheets();
    return Response.json({
      serviceEmail: serviceAccountEmail(),
      branches: BLUEJAY_HOTELS.map((h) => ({ hotel: h.id, name: h.name, hotelUrl: links[h.id]?.hotel ? sheetUrl(links[h.id].hotel!) : null, fnbUrl: links[h.id]?.fnb ? sheetUrl(links[h.id].fnb!) : null })),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

// Save one link (an empty link removes it): { hotel, kind, link }.
export async function PUT(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  const body = await request.json().catch(() => ({})) as { hotel?: unknown; kind?: unknown; link?: unknown };
  if (!BLUEJAY_HOTELS.some((h) => h.id === body.hotel) || !isSheetKind(body.kind) || typeof body.link !== "string") return fail("Chi nhánh hoặc loại sheet không hợp lệ.", 400);
  const id = body.link.trim() ? sheetIdFromLink(body.link) : null;
  if (body.link.trim() && !id) return fail(BAD_LINK, 400);
  try {
    await saveBranchSheet(body.hotel as number, body.kind, id);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

// Check a link before or after saving it: opens it with the read-only account and says which tabs of the month it has and which are missing: { link, kind, month }.
export async function POST(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  const body = await request.json().catch(() => ({})) as { link?: unknown; kind?: unknown; month?: unknown };
  const id = typeof body.link === "string" ? sheetIdFromLink(body.link) : null;
  if (!id) return fail(BAD_LINK, 400);
  if (!isSheetKind(body.kind) || typeof body.month !== "string" || !/^\d{4}-\d{2}$/.test(body.month)) return fail("Loại sheet hoặc tháng không hợp lệ.", 400);
  try {
    return Response.json(await checkSheet(id, body.kind, body.month));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}
