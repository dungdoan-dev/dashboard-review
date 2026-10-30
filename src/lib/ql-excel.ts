// The Excel file of the management report (the finance team's "QL HĐKD" layout): one sheet per table of the page, ruled with borders, real numbers (not text) so Excel can sum and chart them.
// Built with exceljs (borders, colours); the page loads this file only when the file is downloaded. Tests run it with plain Node, so imports use ".ts".
import { kiotvietSummary, type KiotvietExport } from "./kiotviet.ts";
import type { fnbResult } from "./ql-fnb-result.ts";
import ExcelJS from "exceljs";
import { partyTotals, type Book, type FundLine, type Party, type PartyLine, type qlResult, type qlWeekly } from "./ql-report.ts";
import type { parseOutsideServices } from "./outside-services.ts";
import type { StockReport } from "./inventory.ts";
import type { ChannelCounts } from "./ql-channels.ts";

type Layout = { widths?: number[]; labelCol?: number; frozenCols?: number }; // labelCol: the column with the row label (indented on detail rows); frozenCols: columns kept in view when scrolling

type Cell = string | number | Date | null;
type TRow = { cells: Cell[]; kind?: "section" | "total" | "line" };
const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const NUMBER = "#,##0;[Red]-#,##0";
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** A ruled table: title, unit line, a dark header row, then the rows (sections are a banner across the table, totals are bold). */
function table(book: ExcelJS.Workbook, name: string, title: string, head: string[], rows: TRow[], { widths, labelCol = 0, frozenCols = 1 }: Layout = {}) {
  const ws = book.addWorksheet(name, { views: [{ state: "frozen", xSplit: frozenCols, ySplit: 3 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const n = head.length;
  ws.mergeCells(1, 1, 1, n);
  Object.assign(ws.getCell(1, 1), { value: title, font: { bold: true, size: 14, color: { argb: "FF1F3A5F" } } });
  Object.assign(ws.getCell(2, 1), { value: "Đơn vị tính: đồng", font: { italic: true, color: { argb: "FF6B7280" } } });
  const header = ws.getRow(3);
  header.height = 32;
  head.forEach((text, i) => Object.assign(header.getCell(i + 1), { value: text, fill: fill("1F3A5F"), font: { bold: true, color: { argb: "FFFFFFFF" } }, border: BORDER, alignment: { horizontal: i === labelCol ? "left" : "center", vertical: "middle", wrapText: true } }));
  rows.forEach((r, k) => {
    const at = 4 + k, row = ws.getRow(at);
    r.cells.forEach((value, i) => {
      const c = row.getCell(i + 1);
      c.value = value;
      c.border = BORDER;
      c.alignment = typeof value === "number" ? { horizontal: "right", vertical: "middle" } : value instanceof Date ? { horizontal: "center", vertical: "middle" } : { vertical: "middle", wrapText: true, indent: r.kind === "line" && i === labelCol ? 1 : 0 };
      if (typeof value === "number") c.numFmt = NUMBER;
      if (value instanceof Date) c.numFmt = "dd/mm/yyyy";
      if (r.kind === "total") { c.font = { bold: true }; c.fill = fill("EEF2F8"); }
    });
    if (r.kind === "section") {
      for (let i = 1; i <= n; i++) Object.assign(row.getCell(i), { border: BORDER, fill: fill("D9E2F3"), font: { bold: true, color: { argb: "FF1F3A5F" } } });
      ws.mergeCells(at, 1, at, n);
    }
  });
  ws.columns = head.map((_, i) => ({ width: widths?.[i] ?? (i === labelCol ? 62 : 17) }));
  return ws;
}

/** The sổ of a fund day by day (the finance team's "TK TM" / "TK TG NH"): STT, date, opening balance, the money in and out of each unit, closing balance; the total row comes first, as in their sheet. */
function bookRows(b: Book): { head: string[]; rows: TRow[] } {
  const head = ["STT", "Ngày tháng", "Số dư đầu kỳ", ...b.cols.map((c) => (c.memo ? `${c.label}
(tài khoản riêng, không vào số dư)` : c.label)), "Số dư cuối kỳ"];
  const rows: TRow[] = [{ kind: "total", cells: ["", "TỔNG", b.opening, ...b.total.values, b.total.close] }];
  b.rows.forEach((r, i) => rows.push({ cells: [i + 1, new Date(`${r.date}T00:00:00Z`), r.open, ...r.values, r.close] }));
  if (b.sheetClose !== null) {
    const last = (label: string, value: number): TRow => ({ kind: "total", cells: ["", label, null, ...b.cols.map(() => null), value] });
    rows.push(last("Số dư cuối kỳ ghi trong sheet", b.sheetClose), last("Chênh (sổ − sheet)", b.total.close - b.sheetClose));
  }
  return { head, rows };
}

export type QlExtra = {
  fnbResults?: { label: string; result: ReturnType<typeof fnbResult> }[]; // KQ HĐKD of each F&B unit in its own template
  omitHotelResult?: boolean;                                      // a branch with no hotel: the hotel-style KQ HĐKD would be empty
  kiotviet?: { label: string; kv: KiotvietExport }[];             // the weekly KiotViet export of each unit that has the tab
  books?: { cash: Book; bank: Book };
  outside?: ReturnType<typeof parseOutsideServices> | null;      // the "DV Ngoài" tab of the hotel's sheet
  stocks?: { name: string; fnb: boolean; report: StockReport }[]; // one per kho tab
  channels?: ChannelCounts;                                       // bookings and cancellations per channel per week
  parties?: Party[];                                              // thu and chi of the hotel and each F&B unit, line by line
};

/** The finance team's "DT bán hàng": the month, then by week, by group of goods and by item: quantity, list price, discount (negative) and net revenue. */
function kiotvietRows(kv: KiotvietExport, columns: { label: string; from: string; to: string }[]): TRow[] {
  const s = kiotvietSummary(kv, columns.slice(0, -1)); // the last column is the whole month
  const sum = (f: (k: { qty: number; listed: number; revenue: number }) => number) => kv.items.reduce((t, k) => t + f(k), 0);
  const rows: TRow[] = [{ kind: "total", cells: ["CẢ THÁNG", sum((k) => k.qty), kv.days.reduce((t, d) => t + d.invoices, 0), sum((k) => k.listed), sum((k) => k.revenue - k.listed), sum((k) => k.revenue)] }];
  rows.push({ kind: "section", cells: ["THEO TUẦN"] });
  for (const w of s.weeks) rows.push({ kind: "line", cells: [`${w.label} (${dm(w.from)}-${dm(w.to)})`, null, w.invoices, w.listed, w.discount, w.revenue] });
  rows.push({ kind: "section", cells: ["THEO NHÓM HÀNG"] });
  for (const g of s.groups) rows.push({ kind: "line", cells: [g.group || "(không có nhóm)", g.qty, null, g.listed, g.revenue - g.listed, g.revenue] });
  rows.push({ kind: "section", cells: ["THEO HÀNG HÓA"] });
  for (const k of s.items) rows.push({ kind: "line", cells: [k.group ? `${k.name} · ${k.group}` : k.name, k.qty, null, k.listed, k.revenue - k.listed, k.revenue] });
  return rows;
}

const sheetName = (name: string, fnb: boolean, taken: Set<string>) => {
  const base = `${fnb ? "F&B " : ""}${name.replace(/\s*\d{1,2}[/-]\d{4}$/, "").replace(/[\\/?*[\]:]/g, "-").trim()}`.slice(0, 31);
  let out = base;
  for (let i = 2; taken.has(out); i++) out = `${base.slice(0, 31 - String(i).length - 3)} (${i})`;
  taken.add(out);
  return out;
};

/** The "DV Ngoài" sheet: the totals by service on top, then every order; cost is what the partner charges, price what the guest pays. */
function outsideRows(o: NonNullable<QlExtra["outside"]>): TRow[] {
  const sum = (f: (s: { cost: number; price: number; profit: number; discount: number }) => number) => o.byService.reduce((t, s) => t + f(s), 0);
  return [
    { kind: "section", cells: ["TỔNG HỢP THEO DỊCH VỤ"] },
    ...o.byService.map((s): TRow => ({ cells: ["", "", s.name, `${s.count} đơn`, s.cost, s.price, s.profit, s.discount] })),
    { kind: "total", cells: ["", "", "TỔNG", `${o.lines.length} đơn`, sum((s) => s.cost), sum((s) => s.price), sum((s) => s.profit), sum((s) => s.discount)] },
    { kind: "section", cells: ["CHI TIẾT TỪNG ĐƠN"] },
    ...o.lines.map((l): TRow => ({ cells: [new Date(`${l.date}T00:00:00Z`), l.room, l.service, l.note, l.cost, l.price, l.profit, l.discount] })),
  ];
}

/** One sheet per party (hotel, each F&B unit): thu on the left, chi on the right with a blank column between, line by line; the totals come first, then thu − chi under the thu side. */
function partySheet(book: ExcelJS.Workbook, name: string, title: string, p: Party) {
  const thu = partyTotals(p.thu), chi = partyTotals(p.chi), money = (t: ReturnType<typeof partyTotals>): Cell[] => [t.cash, t.bank, t.card, t.all];
  const date = (d: string) => new Date(`${d}T00:00:00Z`), blank = (n: number): Cell[] => Array(n).fill(null);
  const left = (l: PartyLine): Cell[] => [date(l.date), l.what, l.note, l.cash || null, l.bank || null, l.card || null, l.cash + l.bank + l.card];  // Ngày, Nội dung, Ghi chú
  const right = (l: PartyLine): Cell[] => [date(l.date), l.what, l.note, l.cash || null, l.bank || null, l.card || null, l.cash + l.bank + l.card]; // Ngày, Hạng mục, Nội dung chi
  const rows: TRow[] = [
    { kind: "total", cells: ["TỔNG THU", "", "", ...money(thu), null, "TỔNG CHI", "", "", ...money(chi)] },
    { kind: "total", cells: ["THU − CHI", "", "", thu.cash - chi.cash, thu.bank - chi.bank, thu.card - chi.card, thu.all - chi.all, ...blank(8)] },
  ];
  for (let i = 0; i < Math.max(p.thu.length, p.chi.length); i++) rows.push({ cells: [...(p.thu[i] ? left(p.thu[i]) : blank(7)), null, ...(p.chi[i] ? right(p.chi[i]) : blank(7))] });
  const head = ["Ngày thu", "Nội dung thu", "Ghi chú", "Tiền mặt", "Ngân hàng", "Thẻ visa", "Tổng thu", "", "Ngày chi", "Hạng mục chi", "Nội dung chi", "Tiền mặt", "Ngân hàng", "Thẻ visa", "Tổng chi"];
  const ws = table(book, name, title, head, rows, { widths: [12, 30, 34, 15, 15, 12, 15, 3, 12, 28, 34, 15, 15, 12, 15], labelCol: 1, frozenCols: 0 });
  for (let r = 3; r <= 3 + rows.length; r++) { const c = ws.getCell(r, 8); c.border = {}; c.fill = { type: "pattern", pattern: "none" }; c.value = null; } // the blank column between thu and chi is not part of either table
  return ws;
}

/** The "OTA-OTP" sheet: a week per row, BOOK and HỦY for each OTA, a blank column, then the same for the direct channels; zero is left blank as in the finance team's sheet. */
function channelTable(c: ChannelCounts): { head: string[]; rows: TRow[] } {
  const pair = (k: string) => [`${k.toUpperCase()}\nBOOK`, `${k.toUpperCase()}\nHỦY`];
  const cells = (w: ChannelCounts["weeks"][number], keys: string[]): Cell[] => keys.flatMap((k) => [w.counts[k]?.book || null, w.counts[k]?.cancel || null]);
  return {
    head: ["TUẦN", ...c.ota.flatMap(pair), "", ...c.otp.flatMap(pair)],
    rows: c.weeks.map((w, i): TRow => ({ kind: i === c.weeks.length - 1 ? "total" : undefined, cells: [i === c.weeks.length - 1 ? "CẢ THÁNG" : `${w.label} (${dm(w.from)}-${dm(w.to)})`, ...cells(w, c.ota), null, ...cells(w, c.otp)] })),
  };
}

/** A kho like the finance team's AMENIES / MINIBAR sheets: opening, bought, issued and closing stock per item (quantity and value), the totals of the values first. */
function stockRows(r: StockReport): TRow[] {
  const t = r.totals;
  return [
    { kind: "total", cells: ["", "TỔNG", "", "", null, t.openValue, null, t.receiptValue, null, t.issueValue, null, t.closingValue, t.countDiffValue] },
    ...r.lines.map((l, i): TRow => ({ cells: [i + 1, l.item.name, l.item.kind, l.item.unit, l.item.openQty, l.item.openValue, l.receiptQty, l.receiptValue, l.issueQty, l.issueValue, l.closingQty, l.closingValue, l.count ? l.count.diffValue : null] })),
  ];
}

/** title: e.g. "BÁO CÁO QUẢN LÝ · SƠN TRÀ SEA · THÁNG 10/2026". debt: OTA still owing. notes: what could not be read, so the file says it too. */
export function qlWorkbook(title: string, weekly: ReturnType<typeof qlWeekly>, funds: FundLine[], result: ReturnType<typeof qlResult>, debt?: { bookings: number; balance: number }, notes: string[] = [], extra: QlExtra = {}) {
  const book = new ExcelJS.Workbook();
  const lines = (rows: { label: string; kind: "section" | "total" | "line"; values: number[] }[]): TRow[] => rows.map((r) => ({ kind: r.kind, cells: r.kind === "section" ? [r.label] : [r.label, ...r.values] }));
  table(book, "Theo tuần", title, ["Chỉ tiêu", ...weekly.columns.map((c, i) => (i < weekly.columns.length - 1 ? `${c.label}\n(${dm(c.from)}-${dm(c.to)})` : "Cả tháng"))], lines(weekly.rows));
  const fundRows: TRow[] = funds.map((l) => ({ kind: l.total ? "total" : "line", cells: [l.label, l.open, l.in, l.out, l.net, l.close] }));
  if (debt) fundRows.push({ cells: [] }, { kind: "total", cells: [`OTA chưa thanh toán đến hôm nay (${debt.bookings} đặt phòng đã trả phòng còn nợ)`, null, null, null, null, debt.balance] });
  table(book, "Dòng tiền", title, ["Quỹ", "Dư đầu kỳ", "Thu vào", "Chi ra", "Biến động", "Dư cuối kỳ"], fundRows);
  // the finance team's sheet: STT, Chỉ tiêu, Mã số, the values, Ghi chú
  const kq: TRow[] = result.rows.map((r) => ({ kind: r.kind, cells: [r.stt ?? "", r.label, r.code ?? "", ...r.values, r.note ?? ""] }));
  if (!extra.omitHotelResult) table(book, "KQ HĐKD", title.replace(/^BÁO CÁO QUẢN LÝ/, "BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH"), ["STT", "Chỉ tiêu", "Mã số", ...result.columns, "Ghi chú"], kq, { widths: [7, 52, 9, ...result.columns.map(() => 18), 52], labelCol: 1, frozenCols: 2 });
  for (const u of extra.fnbResults ?? []) {
    const rows: TRow[] = u.result.rows.map((r) => ({ kind: r.kind, cells: [r.stt ?? "", r.label, r.code ?? "", ...r.values, r.note ?? ""] }));
    for (const n of u.result.notes) rows.push({ kind: "line", cells: ["", n, "", ...u.result.columns.map(() => null), ""] });
    table(book, u.label === "Mini mart" ? "KQ HĐKD Mini mart" : "KQ HĐKD AS, CF", title.replace(/^BÁO CÁO QUẢN LÝ/, `BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH ${u.label.toUpperCase()}`), ["STT", "Chỉ tiêu", "Mã số", ...u.result.columns, "Ghi chú"], rows, { widths: [7, 52, 9, ...u.result.columns.map(() => 18), 52], labelCol: 1, frozenCols: 2 });
  }
  const named = new Set(book.worksheets.map((w) => w.name));
  for (const p of extra.parties ?? []) partySheet(book, sheetName(`Thu chi ${p.label}`, false, named), title.replace(/^BÁO CÁO QUẢN LÝ/, `THU CHI ${p.label.toUpperCase()}`), p);
  for (const [name, heading, b] of [["TK TM", "SỔ QUỸ TIỀN MẶT (TK TM)", extra.books?.cash], ["TK TG NH", "SỔ TIỀN GỬI NGÂN HÀNG (TK TG NH)", extra.books?.bank]] as const) {
    if (!b || !b.cols.length) continue;
    const { head, rows } = bookRows(b);
    table(book, name, title.replace(/^BÁO CÁO QUẢN LÝ/, heading), head, rows, { widths: [6, 14, 16, ...b.cols.map(() => 17), 16], labelCol: 1, frozenCols: 2 });
  }
  if (extra.outside?.lines.length) table(book, "DV Ngoài", title.replace(/^BÁO CÁO QUẢN LÝ/, "DỊCH VỤ NGOÀI"), ["Ngày đặt", "ID phòng", "Dịch vụ", "Diễn giải", "Giá DV thuê", "Giá bán DV", "Lợi nhuận", "Chiết khấu 20%"], outsideRows(extra.outside), { widths: [14, 12, 28, 40, 16, 16, 16, 16], labelCol: 2, frozenCols: 0 });
  if (extra.channels) {
    const { head, rows } = channelTable(extra.channels);
    table(book, "OTA-OTP", title.replace(/^BÁO CÁO QUẢN LÝ/, "BẢNG TỔNG HỢP OTA, OTP"), head, rows, { widths: [30, ...head.slice(1).map((h) => (h ? 10 : 3))] });
  }
  for (const k of extra.kiotviet ?? []) table(book, k.label === "Mini mart" ? "Bán hàng KiotViet MM" : "Bán hàng KiotViet", title.replace(/^BÁO CÁO QUẢN LÝ/, `BÁN HÀNG KIOTVIET ${k.label.toUpperCase()}`), ["Chỉ tiêu", "Số lượng", "Hóa đơn", "Giá niêm yết", "Giảm giá", "Doanh thu thuần"], kiotvietRows(k.kv, weekly.columns), { widths: [58, 12, 12, 17, 17, 19] });
  const taken = new Set(book.worksheets.map((w) => w.name));
  for (const s of extra.stocks ?? []) {
    if (!s.report.lines.length) continue;
    table(book, sheetName(s.name, s.fnb, taken), title.replace(/^BÁO CÁO QUẢN LÝ/, `BẢNG KÊ HÀNG HÓA ${s.name.replace(/\s*\d{1,2}[/-]\d{4}$/, "").toUpperCase()}`), ["STT", "Tên hàng hóa", "Loại", "ĐVT", "Tồn đầu (SL)", "Tồn đầu (giá trị)", "Mua vào (SL)", "Mua vào (giá trị)", "Xuất (SL)", "Xuất (giá trị)", "Tồn cuối (SL)", "Tồn cuối (giá trị)", "Chênh kiểm kê (giá trị)"], stockRows(s.report), { widths: [6, 36, 14, 9, 12, 16, 12, 16, 12, 16, 12, 16, 16], labelCol: 1, frozenCols: 2 });
  }
  if (notes.length) table(book, "Ghi chú", "Ghi chú khi lấy số liệu", ["Ghi chú"], notes.map((n) => ({ cells: [n] })), { widths: [120] });
  return book;
}

/** Browser: hand the workbook to the user as a file download. */
export async function downloadQlWorkbook(filename: string, book: ExcelJS.Workbook) {
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
