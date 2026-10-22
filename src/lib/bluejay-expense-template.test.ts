import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { EXPENSES, buildExpenseTemplate, expenseSheetName } from "./bluejay-expense-template.ts";

test("the expense template lists the finance team's expenses once and keeps what is typed", async () => {
  assert.equal(new Set(EXPENSES.map((e) => e[1])).size, EXPENSES.length);
  assert.equal(new Set(EXPENSES.map((e) => e[0])).size, EXPENSES.length);

  const EXPENSE_SHEET = expenseSheetName("08/2026");
  const book = buildExpenseTemplate("08/2026");
  assert.deepEqual(book.worksheets.map((w) => w.name), [EXPENSE_SHEET, "Hướng dẫn chi", "Danh mục chi"]);
  const ws = book.getWorksheet(EXPENSE_SHEET)!;
  ws.getCell("A4").value = new Date(Date.UTC(2026, 7, 5));
  ws.getCell("B4").value = "Chi sửa chữa – Bảo dưỡng";
  ws.getCell("D4").value = 450000;
  ws.getCell("B5").value = "Chi Marketing – OTA";
  ws.getCell("G5").value = 375870; // taken off the OTA payout: not a payment out of a fund

  const read = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[EXPENSE_SHEET], { header: 1, defval: "" });
  assert.equal(rows[3][1], "Chi sửa chữa – Bảo dưỡng");
  assert.equal(rows[4][6], 375870);
});
