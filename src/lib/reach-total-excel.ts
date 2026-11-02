// The Excel file of the reach total, laid out like the other report files: a "Tổng hợp" sheet with one ruled table per channel (banner, header, rows, total row)
// and one sheet per channel with its days. exceljs, real numbers. The page loads this file only when the file is downloaded; tests run it with plain Node.
import ExcelJS from "exceljs";
import type { Block, ChannelTables } from "./reach-total.ts";

const thin = { style: "thin" as const, color: { argb: "FF7F8FA6" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const NAVY = "FF1F3A5F";
const numFmt = (label: string, v: number) => (/CTR|Tỷ lệ/i.test(label) ? "0.00%" : Number.isInteger(v) ? "#,##0" : "#,##0.00");

function header(ws: ExcelJS.Worksheet, head: string[]) {
  ws.addRow(head).eachCell((c) => Object.assign(c, { border: BORDER, font: { bold: true, color: { argb: NAVY } }, fill: fill("D9E2F3"), alignment: { horizontal: "center", vertical: "middle", wrapText: true } }));
}
function body(ws: ExcelJS.Worksheet, b: Block) {
  b.rows.forEach((r) => ws.addRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = BORDER;
    if (typeof cell.value === "number") cell.numFmt = numFmt(b.head[col - 1], cell.value);
  }));
}
const ERROR_WIDTH = 6; // a channel that could not be read has no table: its message gets six columns
const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

/** The "Tổng hợp" sheet: title, period line ("Kỳ: 01/10/2026 – 31/10/2026"), then a ruled table per channel table, in menu order; a channel that could not be read has `error` and no tables. */
export function addReachSummarySheet(book: ExcelJS.Workbook, title: string, period: string, channels: ChannelTables[], name = "Tổng hợp") {
  const ws = book.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 0, showGridLines: false }] });
  Object.assign(ws.addRow([title]), { font: { bold: true, size: 14, color: { argb: NAVY } } });
  Object.assign(ws.addRow([period]), { font: { italic: true, color: { argb: "FF6B7280" } } });
  const widest = Math.max(3, ...channels.flatMap((c) => c.summary.map((b) => b.head.length)));
  // the banner and the notes run over the columns of their own table only (width), not over the widest table of the sheet
  const banner = (text: string, color: string, width: number) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, width);
    Object.assign(row.getCell(1), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: fill(color), alignment: { vertical: "middle" } });
    for (let c = 1; c <= width; c++) row.getCell(c).border = BORDER;
  };
  const note = (text: string, width: number, red = false) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, width);
    Object.assign(row.getCell(1), { font: { italic: true, color: { argb: red ? "FFB42318" : "FF6B7280" } }, border: BORDER });
  };
  for (const channel of channels) {
    ws.addRow([]);
    if (channel.error) { banner(channel.name, "1F3A5F", ERROR_WIDTH); note(channel.error, ERROR_WIDTH, true); continue; }
    for (const b of channel.summary) {
      banner(b.title, "1F3A5F", b.head.length);
      header(ws, b.head);
      if (b.rows.length === 0) { note("Chưa có dữ liệu trong kỳ này.", b.head.length); continue; }
      body(ws, b);
      if (b.sum.some(Boolean)) {
        const sums = b.head.map((_, i) => (i === 0 ? "Tổng" : b.sum[i] ? b.rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) : null));
        ws.addRow(sums).eachCell({ includeEmpty: true }, (cell, col) => Object.assign(cell, { border: BORDER, font: { bold: true }, fill: fill("EEF2F8"), numFmt: typeof cell.value === "number" ? numFmt(b.head[col - 1], cell.value) : undefined }));
      }
    }
  }
  ws.columns = Array.from({ length: widest }, (_, i) => ({ width: i === 0 ? 34 : 17 }));
  return ws;
}

/** title: the first line of the Tổng hợp sheet; then one sheet of days per channel that has days. */
export function reachTotalWorkbook(title: string, period: string, channels: ChannelTables[]) {
  const book = new ExcelJS.Workbook();
  addReachSummarySheet(book, title, period, channels);
  for (const channel of channels) {
    if (!channel.daily || channel.daily.rows.length === 0) continue;
    const d = channel.daily, sheet = book.addWorksheet(sheetName(d.title), { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });
    Object.assign(sheet.addRow([`${d.title.toUpperCase()} · ${period.replace(/^Kỳ: /, "")}`]), { font: { bold: true, size: 13, color: { argb: NAVY } } });
    header(sheet, d.head);
    body(sheet, d);
    sheet.columns = d.head.map((_, i) => ({ width: i === 0 ? 14 : i === 1 ? 34 : 17 }));
  }
  return book;
}
