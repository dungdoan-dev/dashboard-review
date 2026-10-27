import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { sheetIdOf } from "@/lib/branch-sheets";
import { isSheetKind, sheetUrl } from "@/lib/ledger-sheets";
import { readLedgerTabs } from "@/lib/google-sheets";

// The ledger tab(s) of one branch's Google Sheet for a month, as plain rows for the same parser as an uploaded file. Read only.
// kind = hotel (default): the hotel's BK tabs; kind = fnb: the thu and chi tabs of Ăn sáng, cafe, mini mart.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "", kind = q.get("kind") ?? "hotel";
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel)) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ message: "Tháng không hợp lệ." }, { status: 400 });
  if (!isSheetKind(kind)) return Response.json({ message: "Loại sheet không hợp lệ." }, { status: 400 });
  try {
    const id = await sheetIdOf(hotel, kind);
    if (!id) return Response.json({ message: kind === "fnb" ? "Chi nhánh này chưa có link Ăn sáng, cafe, mini mart. Thêm ở Cài đặt → Link Google Sheet." : "Khách sạn này chưa có Google Sheet bảng kê. Dùng file Excel." }, { status: 404 });
    const sheets = await readLedgerTabs(id, month, kind);
    if (!sheets.length) return Response.json({ message: `Không thấy tab bảng kê tháng ${month.slice(5)}/${month.slice(0, 4)} (tên tab cần có “${month.slice(5)}/${month.slice(0, 4)}” hoặc “${month.slice(5)}-${month.slice(0, 4)}”).` }, { status: 404 });
    return Response.json({ sheets, sheetUrl: sheetUrl(id), gid: sheets[0].gid });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
