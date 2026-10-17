import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type ExcelJS from "exceljs";
import { TEMPLATE_SHEET, buildLedgerTemplate } from "./bluejay-ledger-template.ts";
import { ledgerWarnings, monthOf, parseLedgerWorkbook, reconcile } from "./bluejay-reconcile.ts";
import type { RevenueBooking } from "./bluejay-revenue.ts";

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));
// Fills the real template (the page's file), saves it and reads it back the way the page does.
async function parsedTemplate(fill: (ws: ExcelJS.Worksheet) => void) {
  const book = buildLedgerTemplate();
  fill(book.getWorksheet(TEMPLATE_SHEET)!);
  const read = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer" });
  return parseLedgerWorkbook(read.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[name], { header: 1, defval: "" }) })));
}
const roomLine = (ws: ExcelJS.Worksheet, row: number, id: string, stay?: Date) => {
  ws.getCell(`A${row}`).value = utc(2026, 9, 6);
  ws.getCell(`B${row}`).value = id;
  ws.getCell(`C${row}`).value = "Agoda";
  ws.getCell(`E${row}`).value = "Tiền phòng";
  ws.getCell(`M${row}`).value = 520000;
  if (stay) ws.getCell(`T${row}`).value = stay;
};
const booking = (o: Partial<RevenueBooking> = {}): RevenueBooking => ({
  code: "009001", ref: "", source: "Walking", channel: "Khách lẻ", roomType: "Deluxe", room: "P - 101", status: "Đã trả phòng", bookDate: "2026-08-01", checkIn: "2026-09-10", checkOut: "2026-09-12",
  nights: 2, nightsInWeek: 2, roomPrice: 1000000, roomInWeek: 1000000, servicePrice: 0, totalPrice: 1000000, payment: 1000000, balance: 0, deposit: 0, stay: true, flags: [], ...o,
});

test("monthOf reads the ways people write a month, and nothing that has no year", () => {
  assert.equal(monthOf("09/2026"), "2026-09");
  assert.equal(monthOf("9-2026"), "2026-09");
  assert.equal(monthOf("2026-09"), "2026-09");
  assert.equal(monthOf("Tháng 9/2026"), "2026-09");
  assert.equal(monthOf(utc(2026, 9)), "2026-09");
  assert.equal(monthOf(46266), "2026-09");   // Excel date 01/09/2026
  assert.equal(monthOf("Tháng 7"), "");      // the real monthly sheet has this in row 1: no year, so no check
  assert.equal(monthOf(""), "");
});

test("the template's hotel cell, period cell and stay-month column are read", async () => {
  const parsed = await parsedTemplate((ws) => {
    ws.getCell("E1").value = "Yzistel Hoi An";
    ws.getCell("J1").value = utc(2026, 9);
    roomLine(ws, 4, "1734737918", utc(2026, 8));
    roomLine(ws, 5, "1734737919");
  });
  assert.equal(parsed.hotel, "Yzistel Hoi An");
  assert.equal(parsed.month, "2026-09");
  assert.deepEqual(parsed.lines.map((l) => l.stayMonth), ["2026-08", ""]);
});

test("an empty hotel cell is not filled with the next label, and files without the cells still parse", async () => {
  const parsed = await parsedTemplate((ws) => { ws.getCell("J1").value = utc(2026, 9); roomLine(ws, 4, "1"); });
  assert.equal(parsed.hotel, "");
  assert.equal(parsed.month, "2026-09");
  const bare = await parsedTemplate((ws) => { ws.getCell("E1").value = null; ws.getCell("J1").value = null; roomLine(ws, 4, "1"); });
  assert.deepEqual([bare.hotel, bare.month], ["", ""]);
});

test("warnings: another hotel, and dates outside the stated month; partial hotel names and silent files pass", async () => {
  const parsed = await parsedTemplate((ws) => { ws.getCell("E1").value = "Yzistel Hoi An"; ws.getCell("J1").value = utc(2026, 8); roomLine(ws, 4, "1"); });
  assert.match(ledgerWarnings(parsed, "Sontra Sea Hotel").join(" "), /Yzistel Hoi An.*Sontra Sea Hotel/);
  assert.equal(ledgerWarnings(parsed, "Yzistel Hoi An").length, 1);                  // only the date (6/9) outside August
  assert.match(ledgerWarnings(parsed, "Yzistel Hoi An")[0], /1 dòng.*08\/2026/);
  assert.equal(ledgerWarnings({ ...parsed, hotel: "Yzistel", month: "2026-09" }, "Yzistel Hoi An").length, 0);
  assert.equal(ledgerWarnings({ ...parsed, hotel: "", month: "" }, "Sontra Sea Hotel").length, 0);
});

test("an OTA room payment for an earlier stay month is a prior-period settlement even with no note; the same month is not", async () => {
  const parsed = await parsedTemplate((ws) => {
    ws.getCell("J1").value = utc(2026, 9);
    roomLine(ws, 4, "111", utc(2026, 8));   // paid in September for an August stay
    roomLine(ws, 5, "222", utc(2026, 9));   // for a September stay that Blue Jay does not know
    roomLine(ws, 6, "333");                 // unmarked: stays a real gap
  });
  const kinds = Object.fromEntries(reconcile(parsed, [booking()]).items.map((i) => [i.id, i.kind]));
  assert.deepEqual([kinds["111"], kinds["222"], kinds["333"]], ["prior", "ledger-only", "ledger-only"]);
  assert.match(reconcile(parsed, []).items.find((i) => i.id === "111")!.notes.join(" "), /kỳ lưu trú 08\/2026/);
});
