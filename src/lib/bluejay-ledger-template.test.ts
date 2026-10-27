import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type ExcelJS from "exceljs";
import { TEMPLATE_SHEET, buildLedgerTemplate } from "./bluejay-ledger-template.ts";
import { parseLedgerWorkbook } from "./bluejay-reconcile.ts";

// Same path the page uses: the template is written as an .xlsx and read back with the parser's own reader.
const reopen = async (book: ExcelJS.Workbook) => {
  const read = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer" });
  return read.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[name], { header: 1, defval: "" }) }));
};

test("the blank template is the ledger sheet, but has no lines yet; the guide and list sheets are never mistaken for a ledger", async () => {
  await assert.rejects(async () => parseLedgerWorkbook(await reopen(buildLedgerTemplate())), /không có dòng giao dịch/);
});

test("a template filled in by hand is read: ids kept as text, money columns summed, the sheet's own total not counted twice", async () => {
  const book = buildLedgerTemplate();
  const ws = book.getWorksheet(TEMPLATE_SHEET)!;
  ws.getCell("A4").value = new Date(Date.UTC(2026, 8, 2));
  ws.getCell("B4").value = "009465";
  ws.getCell("C4").value = "Khách Lẻ";
  ws.getCell("E4").value = "Tiền phòng";
  ws.getCell("K4").value = 1300000;
  ws.getCell("A5").value = new Date(Date.UTC(2026, 8, 26));
  ws.getCell("E5").value = "Lãi tiền gửi";
  ws.getCell("M5").value = 19487;
  const parsed = parseLedgerWorkbook(await reopen(book));
  assert.equal(parsed.sheet, TEMPLATE_SHEET);
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].id, "009465");
  assert.equal(parsed.lines[0].isRoom, true);
  assert.equal(parsed.lines[0].collected, 1300000);
  assert.equal(parsed.noId.rows, 1);
  assert.equal(parsed.noId.collected, 19487);
  assert.deepEqual([parsed.from, parsed.to], ["2026-09-02", "2026-09-26"]);
});

test("the template has the formatting that makes it easy to fill: coloured headers, borders, drop-downs, frozen header, total formula", () => {
  const ws = buildLedgerTemplate().getWorksheet(TEMPLATE_SHEET)!;
  const header = ws.getCell("K3");
  assert.equal(header.fill.type, "pattern");
  assert.equal(header.alignment?.wrapText, true);                    // "Cọc tiền mặt\nĐã ở" wraps instead of running together
  assert.equal(ws.getCell("K10").border.top?.style, "thin");
  assert.equal((ws.getCell("R10").value as ExcelJS.CellFormulaValue).formula, "SUM(H10:P10)");
  assert.equal(ws.getCell("E10").dataValidation.type, "list");
  assert.equal(ws.views[0].state, "frozen");
});

test("the typed column Q (Tiền OTA chưa thanh toán) and is not counted as takings", async () => {
  const book = buildLedgerTemplate();
  const ws = book.getWorksheet(TEMPLATE_SHEET)!;
  assert.equal(ws.getCell("Q3").value, "Tiền OTA\nchưa thanh toán");
  assert.equal(ws.getCell("Q10").value, null);
  ws.getCell("A4").value = new Date(Date.UTC(2026, 8, 2));
  ws.getCell("B4").value = "5857018827";
  ws.getCell("D4").value = "TT OTA";
  ws.getCell("E4").value = "Tiền phòng";
  ws.getCell("M4").value = 800000;
  ws.getCell("Q4").value = 800000; // typed by the staff
  const parsed = parseLedgerWorkbook(await reopen(book));
  assert.equal(parsed.lines[0].collected, 800000);
});
