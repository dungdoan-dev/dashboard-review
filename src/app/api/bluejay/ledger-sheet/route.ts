import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { ledgerSheetUrl } from "@/lib/ledger-sheets";
import { readLedgerTabs } from "@/lib/google-sheets";

// The ledger tab of one hotel's Google Sheet for a month, as plain rows for the same parser as an uploaded file. Read only.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "";
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel)) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ message: "Tháng không hợp lệ." }, { status: 400 });
  try {
    const sheets = await readLedgerTabs(hotel, month);
    if (!sheets) return Response.json({ message: "Khách sạn này chưa có Google Sheet bảng kê. Dùng file Excel." }, { status: 404 });
    if (!sheets.length) return Response.json({ message: `Không thấy tab bảng kê tháng ${month.slice(5)}/${month.slice(0, 4)} (tên tab cần có “${month.slice(5)}/${month.slice(0, 4)}”).` }, { status: 404 });
    return Response.json({ sheets, sheetUrl: ledgerSheetUrl(hotel), gid: sheets[0].gid });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
