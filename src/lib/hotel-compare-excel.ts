// The Excel file of "So sánh khách sạn": the accountant's weekly summary sheet, ruled with borders (exceljs), real numbers so Excel can sum and chart them. Tests run it with plain Node, so imports use ".ts".
import ExcelJS from "exceljs";
import type { CompareRow } from "./hotel-compare.ts";

const thin = { style: "thin" as const, color: { argb: "FF7F8FA6" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const MONEY = "#,##0;-#,##0", COUNT = "#,##0", PERCENT = "0.00%";
const HEAD = ["Tuần", "Thương hiệu", "Số phòng (đêm)", "Phòng bán (đêm)", "Công suất (OCC)"], REVENUE = ["Doanh thu phòng", "Doanh thu Minibar", "Doanh thu DV ngoài", "Doanh thu Giặt ủi", "Thu khác", "Giảm giá, giảm trừ doanh thu", "Tổng"];
const WIDTHS = [11, 22, 13, 13, 13, 17, 15, 15, 15, 13, 19, 17];

/** title: the sheet's title line; rows: compareRows(...). One block per week (the week cell merged down the block), the chain row of each block bold. */
export function compareWorkbook(title: string, rows: CompareRow[]) {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("So sánh khách sạn", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const n = HEAD.length + REVENUE.length;
  ws.mergeCells(1, 1, 1, n);
  Object.assign(ws.getCell(1, 1), { value: title, font: { bold: true, size: 14, color: { argb: "FF1F3A5F" } }, alignment: { horizontal: "center", vertical: "middle" } });
  ws.getRow(1).height = 26;
  const head = (r: number, c: number, text: string) => Object.assign(ws.getCell(r, c), { value: text, fill: fill("D9E2F3"), font: { bold: true, color: { argb: "FF1F3A5F" } }, border: BORDER, alignment: { horizontal: "center", vertical: "middle", wrapText: true } });
  HEAD.forEach((text, i) => { head(2, i + 1, text); head(3, i + 1, ""); ws.mergeCells(2, i + 1, 3, i + 1); });
  for (let c = HEAD.length + 1; c <= n; c++) head(2, c, c === HEAD.length + 1 ? "DOANH THU TUẦN" : "");
  ws.mergeCells(2, HEAD.length + 1, 2, n);
  REVENUE.forEach((text, i) => head(3, HEAD.length + 1 + i, text));
  ws.getRow(3).height = 48;

  let blockStart = 4;
  rows.forEach((r, k) => {
    const at = 4 + k, row = ws.getRow(at);
    const values = [r.week, r.hotel, r.rooms, r.available, r.occ, r.room, r.minibar, r.outside, r.laundry, r.other, r.deduction, r.total];
    values.forEach((value, i) => {
      const c = row.getCell(i + 1);
      c.value = value;
      c.border = BORDER;
      c.alignment = typeof value === "number" ? { horizontal: "right", vertical: "middle" } : { horizontal: i === 0 ? "center" : "left", vertical: "middle" };
      if (typeof value === "number") c.numFmt = i === 4 ? PERCENT : i < 4 ? COUNT : MONEY;
      if (r.chain) { c.font = { bold: true }; c.fill = fill("EEF2F8"); }
      else if (i === n - 1) c.font = { bold: true };
    });
    const last = k === rows.length - 1 || rows[k + 1].week !== r.week;
    if (last) { if (at > blockStart) ws.mergeCells(blockStart, 1, at, 1); Object.assign(ws.getCell(blockStart, 1), { font: { bold: true }, alignment: { horizontal: "center", vertical: "middle" } }); blockStart = at + 1; }
  });
  ws.columns = WIDTHS.map((width) => ({ width }));
  return book;
}
