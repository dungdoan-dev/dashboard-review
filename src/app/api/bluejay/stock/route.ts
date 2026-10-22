import { bluejayViewer } from "@/lib/bluejay-auth";
import { readServiceItems, serviceDb } from "@/lib/bluejay";
import { BLUEJAY_HOTELS } from "@/lib/bluejay-metrics";
import { readStockSheets } from "@/lib/google-sheets";
import { ledgerSheetUrl } from "@/lib/ledger-sheets";

// The kho sheets (MINIBAR, AMENITIES, VẬT TƯ, ĐỒ VẢI) of one hotel's spreadsheet for the month, with what Blue Jay sold as "Minibar" in the month (name -> quantity) to check the minibar against. Read only.
export async function GET(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return Response.json({ message: denied.message }, { status: denied.status });
  const q = new URL(request.url).searchParams;
  const hotel = Number(q.get("hotel")), month = q.get("month") ?? "";
  if (!BLUEJAY_HOTELS.some((h) => h.id === hotel)) return Response.json({ message: "Khách sạn không hợp lệ." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ message: "Tháng không hợp lệ." }, { status: 400 });
  const [year, mm] = month.split("-"), from = `${month}-01`, to = new Date(Date.UTC(Number(year), Number(mm), 0)).toISOString().slice(0, 10);
  try {
    const sheets = await readStockSheets(hotel, month);
    if (!sheets) return Response.json({ message: "Khách sạn này chưa có Google Sheet." }, { status: 404 });
    if (!sheets.length) return Response.json({ message: `Không thấy sheet kho của tháng ${mm}/${year} (cần các tab tên MINIBAR ${mm}/${year}, AMENITIES ${mm}/${year}, VẬT TƯ ${mm}/${year}, ĐỒ VẢI ${mm}/${year}).` }, { status: 404 });
    const sold = await readServiceItems(serviceDb(), hotel, from, to, "Minibar").catch(() => null); // the sheet is still shown when Blue Jay's side cannot be read
    return Response.json({ sheets, sheetUrl: ledgerSheetUrl(hotel), minibarSold: sold?.items ?? null, storedWeeks: sold?.weeks ?? [] });
  } catch (e) {
    return Response.json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
