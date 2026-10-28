import { bluejayViewer } from "@/lib/bluejay-auth";
import { readServiceItems, serviceDb } from "@/lib/bluejay";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { sheetIdOf } from "@/lib/branch-sheets";
import { KHO_KINDS, readStockSheets } from "@/lib/google-sheets";
import { isSheetKind, sheetUrl } from "@/lib/ledger-sheets";

// The kho sheets of one branch's spreadsheet for the month. kind = hotel (default): MINIBAR, AMENITIES, VẬT TƯ, ĐỒ VẢI, with what Blue Jay sold as "Minibar" in the month (name -> quantity) to check the minibar against;
// kind = fnb: NGUYÊN LIỆU CAFE, NGUYÊN LIỆU ĂN SÁNG, VẬT TƯ (nothing to check against). Read only.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "", kind = q.get("kind") ?? "hotel";
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel)) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ message: "Tháng không hợp lệ." }, { status: 400 });
  if (!isSheetKind(kind)) return Response.json({ message: "Loại sheet không hợp lệ." }, { status: 400 });
  const [year, mm] = month.split("-"), from = `${month}-01`, to = new Date(Date.UTC(Number(year), Number(mm), 0)).toISOString().slice(0, 10);
  try {
    const id = await sheetIdOf(hotel, kind, month);
    if (!id) return Response.json({ message: kind === "fnb" ? "Chi nhánh này chưa có link Ăn sáng, cafe, mini mart. Thêm ở Cài đặt → Link Google Sheet." : "Khách sạn này chưa có Google Sheet." }, { status: 404 });
    const sheets = await readStockSheets(id, month, kind);
    if (!sheets.length) return Response.json({ message: `Không thấy sheet kho (cần các tab ${KHO_KINDS[kind].map((k) => k.toUpperCase()).join(", ")}; mỗi tháng một file, hoặc thêm “${mm}/${year}” vào tên tab).` }, { status: 404 });
    const sold = kind === "hotel" ? await readServiceItems(serviceDb(), hotel, from, to, "Minibar").catch(() => null) : null; // the sheet is still shown when Blue Jay's side cannot be read
    return Response.json({ sheets, sheetUrl: sheetUrl(id), minibarSold: sold?.items ?? null, storedWeeks: sold?.weeks ?? [] });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
