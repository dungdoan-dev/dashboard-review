// The Excel file of the Tổng quan score table: ONE ruled sheet laid out like the table on the page (exceljs). A platform column shows what the page shows in its cell:
// the score, the review count and the changes, one under the other. Điểm TB and Tổng đánh giá stay real numbers (sortable, summable).
// The page loads this file only when the file is downloaded. Tests run it with plain Node, so imports use ".ts".
import ExcelJS from "exceljs";

export type ExcelScoreCell = { score: number | null; dScore: number | null; count: number | null; dCount: number | null };
/** cells: one per platform, in the order of the `platforms` labels. */
export type ExcelScoreRow = { name: string; area: string; avg: number | null; cells: ExcelScoreCell[]; total: number | null; updated: string };

const thin = { style: "thin" as const, color: { argb: "FF7F8FA6" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const GOOD = "FF1F7A5C", WARN = "FF9F5F0E", BAD = "FFB42318", INK = "FF3B3B42", MUTED = "FF6B7280", ACCENT = "FF5C3899";
const tone = (score: number, scale: number) => (score / scale >= 0.9 ? GOOD : score / scale >= 0.8 ? WARN : BAD);
const num1 = (x: number) => x.toFixed(1).replace(".", ",");
const signed = (x: number, digits: number) => `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(digits).replace(".", ",")}`;
const count = (x: number) => x.toLocaleString("vi-VN");

/** One platform cell: score (bold, coloured by how good it is), "636 đánh giá", then the changes (green up, red down), one per line. */
function platformCell(c: ExcelScoreCell, scale: number): { value: ExcelJS.CellRichTextValue | null; lines: number } {
  const parts: ExcelJS.RichText[] = [];
  if (c.score != null) parts.push({ text: num1(c.score), font: { bold: true, size: 12, color: { argb: tone(c.score, scale) } } });
  if (c.count != null) parts.push({ text: `${parts.length ? "\n" : ""}${count(c.count)}`, font: { bold: true, color: { argb: ACCENT } } }, { text: " đánh giá", font: { color: { argb: MUTED } } });
  if (c.dScore != null && c.dScore !== 0) parts.push({ text: `${parts.length ? "\n" : ""}${signed(c.dScore, 1)} điểm`, font: { size: 10, color: { argb: c.dScore > 0 ? GOOD : BAD } } });
  if (c.dCount != null && c.dCount !== 0) parts.push({ text: `${parts.length ? "\n" : ""}${signed(c.dCount, 0)} đánh giá`, font: { size: 10, color: { argb: c.dCount > 0 ? GOOD : BAD } } });
  return { value: parts.length ? { richText: parts } : null, lines: parts.reduce((n, p) => n + (p.text.match(/\n/g)?.length ?? 0), parts.length ? 1 : 0) };
}

export type ScoreTable = { heading?: string; platforms: string[]; rows: ExcelScoreRow[]; scale: number };

/**
 * One sheet with a ruled score table per entry of `tables` (a banner with the heading above each when there are several), under a title line and a note line.
 * Used for the Tổng quan file (one table) and the monthly report (a table per type of place).
 */
export function addScoreboardSheet(book: ExcelJS.Workbook, name: string, title: string, note: string, tables: ScoreTable[]) {
  const single = tables.length === 1 && !tables[0].heading;
  const ws = book.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: single ? 3 : 2, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  Object.assign(ws.addRow([title]), { font: { bold: true, size: 14, color: { argb: "FF1F3A5F" } } });
  Object.assign(ws.addRow([note]), { font: { italic: true, color: { argb: MUTED } } });
  const widest = Math.max(...tables.map((t) => t.platforms.length + 4));
  tables.forEach(({ heading, platforms, rows, scale }, k) => {
    const head = ["Cơ sở", "Điểm TB", ...platforms, "Tổng đánh giá", "Cập nhật"], n = head.length;
    if (k > 0) ws.addRow([]);
    if (heading) {
      const banner = ws.addRow([heading]);
      ws.mergeCells(banner.number, 1, banner.number, n);
      Object.assign(banner.getCell(1), { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: fill("1F3A5F"), alignment: { vertical: "middle" } });
    }
    const header = ws.addRow(head);
    header.height = 28;
    header.eachCell((c) => Object.assign(c, { border: BORDER, font: { bold: true, color: { argb: "FF1F3A5F" } }, fill: fill("D9E2F3"), alignment: { horizontal: "center", vertical: "middle", wrapText: true } }));

    rows.forEach((r) => {
      const cells = r.cells.map((c) => platformCell(c, scale));
      const row = ws.addRow([null, r.avg, ...cells.map((c) => c.value), r.total, r.updated]);
      row.height = Math.max(34, Math.max(2, ...cells.map((c) => c.lines)) * 15 + 6);
      for (let i = 1; i <= n; i++) {
        const c = row.getCell(i);
        c.border = BORDER;
        c.alignment = { horizontal: i === 1 || i === n ? "left" : "right", vertical: "middle", wrapText: true };
      }
      row.getCell(1).value = { richText: [{ text: r.name, font: { bold: true, color: { argb: INK } } }, { text: `
${r.area}`, font: { size: 10, color: { argb: MUTED } } }] };
      if (r.avg != null) Object.assign(row.getCell(2), { numFmt: "0.0", font: { bold: true, size: 12, color: { argb: tone(r.avg, scale) } } });
      row.getCell(n - 1).numFmt = "#,##0";
    });
    const total = ws.addRow(["Tổng", ...Array(n - 3).fill(null), rows.reduce((sum, r) => sum + (r.total ?? 0), 0), null]);
    total.eachCell({ includeEmpty: true }, (c, i) => Object.assign(c, { border: BORDER, font: { bold: true }, fill: fill("EEF2F8"), alignment: { horizontal: i === n - 1 ? "right" : "left", vertical: "middle" }, numFmt: i === n - 1 ? "#,##0" : undefined }));
  });
  ws.columns = Array.from({ length: widest }, (_, i) => ({ width: i === 0 ? 34 : i === 1 ? 10 : 15 }));
  return ws;
}

/** title: the sheet's title; note: the line under it (scale, compare date, base date); platforms: the platform labels; scale: 5 or 10, for the colour of a score. */
export function scoreboardWorkbook(title: string, note: string, platforms: string[], rows: ExcelScoreRow[], scale: number) {
  const book = new ExcelJS.Workbook();
  addScoreboardSheet(book, "Bảng điểm", title, note, [{ platforms, rows, scale }]);
  return book;
}
