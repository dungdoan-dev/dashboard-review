// The Excel file of the management report (the finance team's "QL HĐKD" layout): one sheet per table of the page, ruled with borders, real numbers (not text) so Excel can sum and chart them.
// Built with exceljs (borders, colours); the page loads this file only when the file is downloaded. Tests run it with plain Node, so imports use ".ts".
import ExcelJS from "exceljs";
import type { FundLine, qlResult, qlWeekly } from "./ql-report.ts";

type Cell = string | number | null;
type TRow = { cells: Cell[]; kind?: "section" | "total" | "line" };
const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const NUMBER = "#,##0;[Red]-#,##0";
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** A ruled table: title, unit line, a dark header row, then the rows (sections are a banner across the table, totals are bold). */
function table(book: ExcelJS.Workbook, name: string, title: string, head: string[], rows: TRow[], firstWidth = 62) {
  const ws = book.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const n = head.length;
  ws.mergeCells(1, 1, 1, n);
  Object.assign(ws.getCell(1, 1), { value: title, font: { bold: true, size: 14, color: { argb: "FF1F3A5F" } } });
  Object.assign(ws.getCell(2, 1), { value: "Đơn vị tính: đồng", font: { italic: true, color: { argb: "FF6B7280" } } });
  const header = ws.getRow(3);
  header.height = 32;
  head.forEach((text, i) => Object.assign(header.getCell(i + 1), { value: text, fill: fill("1F3A5F"), font: { bold: true, color: { argb: "FFFFFFFF" } }, border: BORDER, alignment: { horizontal: i ? "center" : "left", vertical: "middle", wrapText: true } }));
  rows.forEach((r, k) => {
    const at = 4 + k, row = ws.getRow(at);
    r.cells.forEach((value, i) => {
      const c = row.getCell(i + 1);
      c.value = value;
      c.border = BORDER;
      c.alignment = typeof value === "number" ? { horizontal: "right", vertical: "middle" } : { vertical: "middle", wrapText: true, indent: r.kind === "line" && i === 0 ? 1 : 0 };
      if (typeof value === "number") c.numFmt = NUMBER;
      if (r.kind === "total") { c.font = { bold: true }; c.fill = fill("EEF2F8"); }
    });
    if (r.kind === "section") {
      for (let i = 1; i <= n; i++) Object.assign(row.getCell(i), { border: BORDER, fill: fill("D9E2F3"), font: { bold: true, color: { argb: "FF1F3A5F" } } });
      ws.mergeCells(at, 1, at, n);
    }
  });
  ws.columns = head.map((_, i) => ({ width: i ? 17 : firstWidth }));
  return ws;
}

/** title: e.g. "BÁO CÁO QL · SƠN TRÀ SEA · THÁNG 10/2026". debt: OTA still owing. notes: what could not be read, so the file says it too. */
export function qlWorkbook(title: string, weekly: ReturnType<typeof qlWeekly>, funds: FundLine[], result: ReturnType<typeof qlResult>, debt?: { bookings: number; balance: number }, notes: string[] = []) {
  const book = new ExcelJS.Workbook();
  const lines = (rows: { label: string; kind: "section" | "total" | "line"; values: number[] }[]): TRow[] => rows.map((r) => ({ kind: r.kind, cells: r.kind === "section" ? [r.label] : [r.label, ...r.values] }));
  table(book, "Theo tuần", title, ["Chỉ tiêu", ...weekly.columns.map((c, i) => (i < weekly.columns.length - 1 ? `${c.label}\n(${dm(c.from)}-${dm(c.to)})` : "Cả tháng"))], lines(weekly.rows));
  const fundRows: TRow[] = funds.map((l) => ({ kind: l.total ? "total" : "line", cells: [l.label, l.in, l.out, l.net] }));
  if (debt) fundRows.push({ cells: [] }, { kind: "total", cells: [`OTA chưa thanh toán đến hôm nay (${debt.bookings} đặt phòng đã trả phòng còn nợ)`, debt.balance] });
  table(book, "Dòng tiền", title, ["Quỹ", "Thu vào", "Chi ra", "Biến động"], fundRows);
  table(book, "KQ HĐKD", title, ["Chỉ tiêu", ...result.columns], lines(result.rows));
  if (notes.length) table(book, "Ghi chú", "Ghi chú khi lấy số liệu", ["Ghi chú"], notes.map((n) => ({ cells: [n] })), 120);
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
