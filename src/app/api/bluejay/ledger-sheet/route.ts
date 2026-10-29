import { bluejayViewer } from "@/lib/bluejay-auth";
import { BLUEJAY_HOTELS, isStandalone } from "@/lib/bluejay-metrics";
import { sheetIdOf } from "@/lib/branch-sheets";
import { isSheetKind, sheetUrl } from "@/lib/ledger-sheets";
import { readKiotvietTabs, readLedgerTabs } from "@/lib/google-sheets";

// The ledger tab(s) of one branch's Google Sheet for a month, as plain rows for the same parser as an uploaded file. Read only.
// kind = hotel (default): the hotel's BK tabs; kind = fnb: the thu and chi tabs of Ăn sáng, cafe, mini mart.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "", kind = q.get("kind") ?? "hotel";
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel) && !(isStandalone(hotel) && kind === "fnb")) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ message: "Tháng không hợp lệ." }, { status: 400 });
  if (!isSheetKind(kind)) return Response.json({ message: "Loại sheet không hợp lệ." }, { status: 400 });
  try {
    const id = await sheetIdOf(hotel, kind, month);
    if (!id) return Response.json({ message: `Chưa có link Google Sheet ${kind === "fnb" ? "Ăn sáng, cafe, mini mart" : "khách sạn"} của tháng ${month.slice(5)}/${month.slice(0, 4)} cho chi nhánh này. Thêm ở Cài đặt → Link Google Sheet.` }, { status: 404 });
    const sheets = await readLedgerTabs(id, month, kind);
    if (!sheets.length) return Response.json({ message: kind === "fnb" ? "Không thấy tab thu chi trong sheet Ăn sáng, cafe, mini mart (cần BK THU, BK CHI, THU MINIMART, CHI MINIMART)." : `Không thấy tab bảng kê (cần tab BK THU và BK CHI; mỗi tháng một file, hoặc tab có “${month.slice(5)}/${month.slice(0, 4)}” trong tên).` }, { status: 404 });
    const kiotviet = kind === "fnb" ? await readKiotvietTabs(id).catch(() => []) : []; // the weekly KiotViet export, pasted by the staff; a failure to read it must not hide the ledger
    return Response.json({ sheets, kiotviet, sheetUrl: sheetUrl(id), gid: sheets[0].gid });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
