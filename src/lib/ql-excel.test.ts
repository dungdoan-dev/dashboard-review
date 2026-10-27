import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { qlWorkbook } from "./ql-excel.ts";
import { qlResult, qlWeekly } from "./ql-report.ts";
import type { CheckoutDay } from "./bluejay-checkout.ts";

const day = (date: string, o: Partial<CheckoutDay> = {}): CheckoutDay => ({ date, rooms: 0, room: 0, service: 0, total: 0, excludedRooms: 0, excludedRoom: 0, excludedService: 0, ...o });
const days = [day("2026-10-20", { room: 2000, service: 300 })];
const build = () => qlWorkbook("BÁO CÁO QL", qlWeekly("2026-10", { days }), [{ label: "Khách sạn · tiền mặt", fund: "cash", in: 10, out: 4, net: 6 }, { label: "Tổng tiền mặt", fund: "cash", in: 10, out: 4, net: 6, total: true }], qlResult("2026-10", { days }), { bookings: 2, balance: 5000 }, ["Công nợ OTA: lỗi"]);

test("one ruled sheet per table: title, header row, a banner for each section, bold totals, real numbers", () => {
  const book = build();
  assert.deepEqual(book.worksheets.map((w) => w.name), ["Theo tuần", "Dòng tiền", "KQ HĐKD", "Ghi chú"]);
  const ws = book.getWorksheet("Theo tuần")!;
  assert.deepEqual([ws.getCell(1, 1).value, ws.getCell(3, 1).value, ws.getCell(3, 2).value], ["BÁO CÁO QL", "Chỉ tiêu", "Tuần 40\n(01/10-04/10)"]);
  assert.equal((ws.getCell(3, 2).fill as ExcelJS.FillPattern).fgColor?.argb, "FF1F3A5F");
  assert.equal(ws.getCell(4, 1).value, "KHÁCH SẠN · DOANH THU THEO NGÀY TRẢ PHÒNG (Blue Jay)");
  assert.equal(ws.getCell(4, 7).isMerged, true); // the banner runs across the table
  const room = ws.getRows(4, ws.rowCount - 3)!.find((r) => r.getCell(1).value === "Tiền phòng")!;
  assert.deepEqual([room.getCell(5).value, room.getCell(7).value, room.getCell(5).numFmt, room.getCell(5).border?.top?.style, room.getCell(1).alignment?.indent], [2000, 2000, "#,##0;[Red]-#,##0", "thin", 1]);
  const total = ws.getRows(4, ws.rowCount - 3)!.find((r) => String(r.getCell(1).value).startsWith("Tổng doanh thu có"))!;
  assert.equal(total.getCell(1).font?.bold, true);
  assert.deepEqual([ws.views[0].state, ws.getColumn(1).width, ws.getColumn(2).width], ["frozen", 62, 17]);
});

test("the funds sheet ends with the OTA debt, the result sheet has a column per unit, the notes sheet lists the notes, and the file can be written", async () => {
  const book = build();
  const funds = book.getWorksheet("Dòng tiền")!;
  assert.deepEqual([funds.getCell(5, 1).value, funds.getCell(5, 4).value, funds.getCell(6, 1).value, funds.getCell(7, 2).value], ["Tổng tiền mặt", 6, null, 5000]);
  assert.deepEqual([book.getWorksheet("KQ HĐKD")!.getCell(3, 2).value, book.getWorksheet("KQ HĐKD")!.getCell(4, 3).value], ["Khách sạn", 2300]);
  assert.equal(book.getWorksheet("Ghi chú")!.getCell(4, 1).value, "Công nợ OTA: lỗi");
  const buffer = await book.xlsx.writeBuffer();
  const back = await new ExcelJS.Workbook().xlsx.load(buffer as ArrayBuffer);
  assert.equal(back.getWorksheet("Theo tuần")!.getCell(1, 1).value, "BÁO CÁO QL");
  assert.deepEqual(qlWorkbook("x", qlWeekly("2026-10", {}), [], qlResult("2026-10", {})).worksheets.map((w) => w.name), ["Theo tuần", "Dòng tiền", "KQ HĐKD"]); // no notes: no notes sheet
});
