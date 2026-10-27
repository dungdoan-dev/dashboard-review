import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { qlWorkbook } from "./ql-excel.ts";
import { qlResult, qlWeekly } from "./ql-report.ts";
import type { CheckoutDay } from "./bluejay-checkout.ts";

const day = (date: string, o: Partial<CheckoutDay> = {}): CheckoutDay => ({ date, rooms: 0, room: 0, service: 0, total: 0, excludedRooms: 0, excludedRoom: 0, excludedService: 0, ...o });
const days = [day("2026-10-20", { room: 2000, service: 300 })];
const build = () => qlWorkbook("BÁO CÁO QL", qlWeekly("2026-10", { days }), [{ label: "Khách sạn · tiền mặt", fund: "cash", open: 100, in: 10, out: 4, net: 6, close: 106 }, { label: "Tổng tiền mặt", fund: "cash", open: 100, in: 10, out: 4, net: 6, close: 106, total: true }], qlResult("2026-10", { days }), { bookings: 2, balance: 5000 }, ["Công nợ OTA: lỗi"]);

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
  assert.deepEqual((funds.getRow(3).values as unknown[]).slice(1), ["Quỹ", "Dư đầu kỳ", "Thu vào", "Chi ra", "Biến động", "Dư cuối kỳ"]);
  assert.deepEqual([funds.getCell(5, 1).value, funds.getCell(5, 2).value, funds.getCell(5, 5).value, funds.getCell(5, 6).value, funds.getCell(6, 1).value, funds.getCell(7, 6).value], ["Tổng tiền mặt", 100, 6, 106, null, 5000]);
  const kq = book.getWorksheet("KQ HĐKD")!; // the finance team's columns: STT, Chỉ tiêu, Mã số, the units, Ghi chú
  assert.deepEqual([kq.getCell(1, 1).value, (kq.getRow(3).values as unknown[]).slice(1)], ["BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH", ["STT", "Chỉ tiêu", "Mã số", "Khách sạn", "Tổng", "Ghi chú"]]);
  assert.deepEqual([kq.getCell(4, 2).value, kq.getCell(4, 4).value, kq.getCell(5, 1).value, kq.getCell(5, 3).value, kq.getCell(6, 2).value, kq.getCell(6, 6).value], ["I, TỔNG DOANH THU (I=1-2)", 2300, "1", "I", "Tiền phòng", "Theo ngày trả phòng, gồm M-Standard / Unassigned"]);
  assert.deepEqual([kq.getCell(6, 2).alignment?.indent, (kq.views[0] as { xSplit?: number }).xSplit, kq.getColumn(2).width], [1, 2, 52]);
  assert.equal(book.getWorksheet("Ghi chú")!.getCell(4, 1).value, "Công nợ OTA: lỗi");
  const buffer = await book.xlsx.writeBuffer();
  const back = await new ExcelJS.Workbook().xlsx.load(buffer as ArrayBuffer);
  assert.equal(back.getWorksheet("Theo tuần")!.getCell(1, 1).value, "BÁO CÁO QL");
  assert.deepEqual(qlWorkbook("x", qlWeekly("2026-10", {}), [], qlResult("2026-10", {})).worksheets.map((w) => w.name), ["Theo tuần", "Dòng tiền", "KQ HĐKD"]); // no notes: no notes sheet
});

test("the cash and bank books are sheets of their own: total row first, one row per day with a real date, the sheet's closing and the difference at the end", () => {
  const book = (opening: number) => ({ cols: [{ label: "Khách sạn · thu", side: "in" as const }, { label: "Mini mart · thu", side: "in" as const, memo: true }], opening, rows: [{ date: "2026-10-01", open: opening, values: [10, 3], close: opening + 10 }], total: { values: [10, 3], close: opening + 10 }, sheetClose: opening + 12 });
  const wb = qlWorkbook("BÁO CÁO QL · X", qlWeekly("2026-10", {}), [], qlResult("2026-10", {}), undefined, [], { books: { cash: book(100), bank: book(500) } });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Theo tuần", "Dòng tiền", "KQ HĐKD", "TK TM", "TK TG NH"]);
  const ws = wb.getWorksheet("TK TM")!;
  assert.equal(ws.getCell(1, 1).value, "SỔ QUỸ TIỀN MẶT (TK TM) · X");
  assert.deepEqual((ws.getRow(3).values as unknown[]).slice(1), ["STT", "Ngày tháng", "Số dư đầu kỳ", "Khách sạn · thu", "Mini mart · thu\n(tài khoản riêng, không vào số dư)", "Số dư cuối kỳ"]);
  assert.deepEqual([ws.getCell(4, 2).value, ws.getCell(4, 3).value, ws.getCell(4, 6).value], ["TỔNG", 100, 110]);
  assert.deepEqual([ws.getCell(5, 1).value, ws.getCell(5, 2).value instanceof Date, ws.getCell(5, 2).numFmt, ws.getCell(5, 4).value, ws.getCell(5, 6).value], [1, true, "dd/mm/yyyy", 10, 110]);
  assert.deepEqual([ws.getCell(6, 2).value, ws.getCell(6, 6).value, ws.getCell(7, 2).value, ws.getCell(7, 6).value], ["Số dư cuối kỳ ghi trong sheet", 112, "Chênh (sổ − sheet)", -2]);
});

test("the DV Ngoài sheet has the totals by service first, then every order; each kho is a sheet of its own, F&B ones marked, with the values of the totals first", () => {
  const outside = { byService: [{ name: "Xe máy", count: 2, cost: 100, price: 150, profit: 50, discount: 10 }], lines: [{ row: 5, date: "2026-10-02", room: "301", service: "Xe máy", note: "a", cost: 60, price: 90, profit: 30, discount: 6 }, { row: 6, date: "2026-10-03", room: "302", service: "Xe máy", note: "", cost: 40, price: 60, profit: 20, discount: 4 }] };
  const item = (name: string, kind: string) => ({ name, kind, unit: "Chai", openQty: 5, openValue: 50, fixedPrice: 0, bluejay: "" });
  const report = (names: string[]) => ({ from: "2026-10-01", to: "2026-10-31", unknown: [], lines: names.map((n) => ({ item: item(n, "Bán"), receiptQty: 2, receiptValue: 30, issueQty: 3, avgPrice: 10, issueValue: 30, closingQty: 4, closingValue: 50, count: null })), totals: { openValue: 50, receiptValue: 30, issueValue: 30, closingValue: 50, countDiffValue: 0 } });
  const wb = qlWorkbook("BÁO CÁO QL · X", qlWeekly("2026-10", {}), [], qlResult("2026-10", {}), undefined, [], { outside, stocks: [{ name: "MINIBAR 10/2026", fnb: false, report: report(["Snack", "Nước"]) }, { name: "VẬT TƯ", fnb: true, report: report(["Ly"]) }, { name: "TRỐNG", fnb: false, report: report([]) }] });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Theo tuần", "Dòng tiền", "KQ HĐKD", "DV Ngoài", "MINIBAR", "F&B VẬT TƯ"]); // an empty kho gets no sheet
  const dv = wb.getWorksheet("DV Ngoài")!;
  assert.deepEqual([dv.getCell(4, 1).value, dv.getCell(5, 3).value, dv.getCell(5, 4).value, dv.getCell(6, 3).value, dv.getCell(6, 5).value, dv.getCell(7, 1).value, dv.getCell(8, 1).value instanceof Date, dv.getCell(8, 6).value], ["TỔNG HỢP THEO DỊCH VỤ", "Xe máy", "2 đơn", "TỔNG", 100, "CHI TIẾT TỪNG ĐƠN", true, 90]);
  const kho = wb.getWorksheet("MINIBAR")!;
  assert.deepEqual([kho.getCell(1, 1).value, kho.getCell(4, 2).value, kho.getCell(4, 6).value, kho.getCell(4, 12).value, kho.getCell(5, 2).value, kho.getCell(5, 5).value, kho.getCell(6, 2).value], ["BẢNG KÊ HÀNG HÓA MINIBAR · X", "TỔNG", 50, 50, "Snack", 5, "Nước"]);
});

test("the OTA-OTP sheet: a row per week, BOOK and HỦY per OTA, a blank column, then the direct channels; zero left blank, the month as the total row", () => {
  const channels = { ota: ["Agoda", "Booking"], otp: ["Walking", "Zalo"], weeks: [{ label: "Tuần 40", from: "2026-10-01", to: "2026-10-04", counts: { Agoda: { book: 3, cancel: 0 }, Zalo: { book: 1, cancel: 2 } } }, { label: "Cả kỳ", from: "2026-10-01", to: "2026-10-31", counts: { Agoda: { book: 3, cancel: 0 }, Zalo: { book: 1, cancel: 2 } } }] };
  const wb = qlWorkbook("BÁO CÁO QL · X", qlWeekly("2026-10", {}), [], qlResult("2026-10", {}), undefined, [], { channels });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Theo tuần", "Dòng tiền", "KQ HĐKD", "OTA-OTP"]);
  const ws = wb.getWorksheet("OTA-OTP")!;
  assert.equal(ws.getCell(1, 1).value, "BẢNG TỔNG HỢP OTA, OTP · X");
  assert.deepEqual((ws.getRow(3).values as unknown[]).slice(1, 6), ["TUẦN", "AGODA\nBOOK", "AGODA\nHỦY", "BOOKING\nBOOK", "BOOKING\nHỦY"]);
  assert.deepEqual([ws.getCell(3, 6).value, ws.getCell(3, 7).value], ["", "WALKING\nBOOK"]); // the blank column between the groups
  assert.deepEqual([ws.getCell(4, 1).value, ws.getCell(4, 2).value, ws.getCell(4, 3).value, ws.getCell(4, 9).value, ws.getCell(4, 10).value, ws.getCell(5, 1).value, ws.getCell(5, 1).font?.bold], ["Tuần 40 (01/10-04/10)", 3, null, 1, 2, "CẢ THÁNG", true]);
});
