import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { scoreboardWorkbook, type ExcelScoreRow } from "./scoreboard-excel.ts";

const rows: ExcelScoreRow[] = [
  { name: "Sontra Sea Hotel", area: "Sơn Trà", avg: 4.7, cells: [{ score: 4.8, dScore: -0.1, count: 636, dCount: 2 }, { score: null, dScore: null, count: null, dCount: null }], total: 636, updated: "Hôm nay" },
  { name: "Vistara Gia Lai", area: "Gia Lai", avg: null, cells: [{ score: 4.9, dScore: null, count: 29, dCount: -1 }, { score: 4.5, dScore: 0.2, count: 1244, dCount: 0 }], total: 1273, updated: "2 ngày trước" },
];
const build = () => scoreboardWorkbook("BẢNG ĐIỂM · KHÁCH SẠN", "Điểm thang 5", ["Google Maps", "Booking.com"], rows, 5);
const text = (v: ExcelJS.CellValue) => (typeof v === "object" && v && "richText" in v ? v.richText.map((p) => p.text).join("") : v);

test("one sheet laid out like the page table: the place and its area, the score, one cell per platform with score, count and changes, the total", () => {
  const book = build();
  assert.deepEqual(book.worksheets.map((w) => w.name), ["Bảng điểm"]);
  const ws = book.getWorksheet("Bảng điểm")!;
  assert.deepEqual([ws.getCell(1, 1).value, ws.getCell(2, 1).value], ["BẢNG ĐIỂM · KHÁCH SẠN", "Điểm thang 5"]);
  assert.deepEqual((ws.getRow(3).values as unknown[]).slice(1), ["Cơ sở", "Điểm TB", "Google Maps", "Booking.com", "Tổng đánh giá", "Cập nhật"]);
  assert.equal((ws.getCell(3, 1).fill as ExcelJS.FillPattern).fgColor?.argb, "FFD9E2F3");
  assert.equal(text(ws.getCell(4, 1).value), "Sontra Sea Hotel\nSơn Trà");
  assert.deepEqual([ws.getCell(4, 2).value, ws.getCell(4, 2).numFmt, ws.getCell(5, 2).value], [4.7, "0.0", null]); // Điểm TB is a real number; no score stays empty
  assert.equal(text(ws.getCell(4, 3).value), "4,8\n636 đánh giá\n−0,1 điểm\n+2 đánh giá");
  assert.equal(ws.getCell(4, 4).value, null);
  assert.equal(text(ws.getCell(5, 3).value), "4,9\n29 đánh giá\n−1 đánh giá");
  assert.equal(text(ws.getCell(5, 4).value), "4,5\n1.244 đánh giá\n+0,2 điểm"); // a change of 0 is not written
  assert.deepEqual([ws.getCell(4, 5).value, ws.getCell(4, 5).numFmt, ws.getCell(4, 6).value], [636, "#,##0", "Hôm nay"]);
  assert.deepEqual([ws.getCell(6, 1).value, ws.getCell(6, 5).value, ws.getCell(6, 1).font?.bold], ["Tổng", 1909, true]);
  assert.ok((ws.getRow(5).height ?? 0) > (ws.getRow(3).height ?? 99)); // a row is tall enough for its stacked lines
});

test("every cell of the table has a border and the file can be written and read back", async () => {
  const book = build();
  const ws = book.getWorksheet("Bảng điểm")!;
  for (let r = 3; r <= 6; r++) for (let c = 1; c <= 6; c++) assert.equal(ws.getCell(r, c).border?.top?.style, "thin", `cell ${r},${c}`);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await book.xlsx.writeBuffer()) as unknown as ArrayBuffer);
  assert.equal(text(back.getWorksheet("Bảng điểm")!.getCell(5, 1).value), "Vistara Gia Lai\nGia Lai");
});
