import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildLedgerTemplate, TEMPLATE_SHEET } from "./bluejay-ledger-template.ts";
import { buildExpenseTemplate, expenseSheetName } from "./bluejay-expense-template.ts";
import { buildFundPanelBook } from "./fund-panel.ts";
import { parseLedger } from "./bluejay-reconcile.ts";
import { parseExpenses } from "./finance-summary.ts";

type Sheet = { getCell: (a: string) => { value: unknown } };
const formula = (ws: Sheet, ref: string) => String((ws.getCell(ref).value as { formula: string }).formula);
const rows = async (book: { xlsx: { writeBuffer: () => Promise<ArrayBuffer | Buffer> } }, name: string) => {
  const read = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer" });
  return XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[name], { header: 1, defval: "" });
};
const CHI_D = `INDIRECT("'BK CHI "&TEXT($AG$1,$AH$1)&"'!$D$4:$D$503")`, CHI_A = `INDIRECT("'BK CHI "&TEXT($AG$1,$AH$1)&"'!$A$4:$A$503")`;

test("the income tab lists the day's money in and out for the cash and the bank, with the balance by the ledger last", () => {
  const ws = buildLedgerTemplate().getWorksheet(TEMPLATE_SHEET)!;
  assert.equal(formula(ws, "AG1"), 'IFERROR(DATE(YEAR($J$1),MONTH($J$1),1),DATE(VALUE(RIGHT($J$1,4)),VALUE(LEFT($J$1,2)),1))'); // J1: "KỲ BÁO CÁO" of the ledger, a date or the text "10/2026"
  // the expense tab of the month is named "BK CHI 10/2026" in Google Sheets and "BK CHI 10-2026" in an Excel file: AG1 finds which, AH1 is TRUE when there is none, and the header says so
  assert.equal(formula(ws, "AH1"), 'IF(IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AG$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")');
  assert.equal(formula(ws, "AI1"), 'IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AG$1,$AH$1)&"\'!A1")),0)=0');
  assert.match(formula(ws, "W2"), /^IF\(\$AI\$1,"⚠ Không thấy tab BK CHI "/);
  assert.equal(formula(ws, "AF1"), `MAX($A$4:$A$503,IFERROR(MAX(${CHI_A}),0))`); // the latest date typed in either ledger
  assert.equal(formula(ws, "V4"), 'IF($AG$1+0>$AF$1,"",$AG$1+0)'); // a day shows only up to the latest one typed
  assert.equal(formula(ws, "V34"), 'IF($AG$1+30>$AF$1,"",$AG$1+30)'); // 31 rows; a month with fewer days is cut by the latest date
  assert.deepEqual([23, 24, 25, 26, 27, 28, 29, 30, 31].map((c) => ws.getCell(3, c).value), ["Thu tiền mặt", "Tiền OTA chưa thanh toán", "Chi tiền mặt", "Thu minimart (nhập)", "Chi minimart (nhập)", "Theo bảng kê", "Thu ngân hàng", "Chi ngân hàng", "Số dư theo bảng kê"]);
  // cash: Thu = Tiền mặt (K) + Cọc tiền mặt chưa ở (L); Chi = D of the expense tab; the balance adds minimart thu and takes minimart chi (typed)
  assert.equal(formula(ws, "W4"), `IF($V4="","",SUMIFS($K$4:$K$503,$A$4:$A$503,$V4)+SUMIFS($L$4:$L$503,$A$4:$A$503,$V4))`);
  assert.equal(formula(ws, "X4"), 'IF($V4="","",SUMIFS($Q$4:$Q$503,$A$4:$A$503,$V4))'); // OTA not paid yet: the ledger's own column Q (typed), only to compare with Blue Jay
  assert.equal(formula(ws, "Y4"), `IF($V4="","",IFERROR(SUMIFS(${CHI_D},${CHI_A},$V4),0))`);
  assert.equal(formula(ws, "AB4"), 'IF($V4="","",$W$1+W4-Y4+Z4-AA4)');
  assert.equal(formula(ws, "AB5"), 'IF($V5="","",AB4+W5-Y5+Z5-AA5)'); // then from the day before
  assert.deepEqual(["Z", "AA"].map((col) => (ws.getCell(`${col}4`).fill as { fgColor?: { argb?: string } }).fgColor?.argb), ["FFFEF3C7", "FFFEF3C7"]); // the typed cells
  // bank: Thu = Tiền TK (M) + Cọc TK chưa ở (N); Chi = E of the expense tab; the balance runs on from the opening balance
  assert.match(formula(ws, "AC4"), /^IF\(\$V4="","",SUMIFS\(\$M\$4:\$M\$503,\$A\$4:\$A\$503,\$V4\)\+SUMIFS\(\$N\$4:\$N\$503/);
  assert.match(formula(ws, "AD4"), /\$E\$4:\$E\$503/);
  assert.equal(formula(ws, "AE4"), 'IF($V4="","",$Y$1+AC4-AD4)');
  assert.equal(formula(ws, "AE5"), 'IF($V5="","",AE4+AC5-AD5)');
  assert.equal(ws.getCell("AF3").value, null); // no typed statement balance and no difference column: the staff compare by eye
  assert.deepEqual([32, 33, 34, 35].map((c) => ws.getColumn(c).hidden), [true, true, true, true]); // the helper cells AF..AI
});

test("the expense tab no longer carries the check panel", () => {
  const ws = buildExpenseTemplate("10/2026").getWorksheet(expenseSheetName("10/2026"))!;
  assert.equal(ws.getCell("L1").value, null);
  assert.equal(ws.getCell("M1").value, null);
});

test("the ledgers are still read with the panel beside them, and the pasteable file has the panel", async () => {
  const thu = buildLedgerTemplate(), thuWs = thu.getWorksheet(TEMPLATE_SHEET)!;
  thuWs.getCell("A4").value = new Date(Date.UTC(2026, 9, 2)); thuWs.getCell("B4").value = "009465"; thuWs.getCell("E4").value = "Tiền phòng"; thuWs.getCell("K4").value = 1300000;
  const led = parseLedger(await rows(thu, TEMPLATE_SHEET));
  assert.deepEqual([led.entries.length, led.entries[0].taken.cash], [1, 1300000]);

  const chi = buildExpenseTemplate("10/2026"), chiWs = chi.getWorksheet(expenseSheetName("10/2026"))!;
  chiWs.getCell("A4").value = new Date(Date.UTC(2026, 9, 2)); chiWs.getCell("B4").value = "Chi khác"; chiWs.getCell("C4").value = "x"; chiWs.getCell("D4").value = 5000;
  const lines = parseExpenses(await rows(chi, expenseSheetName("10/2026")));
  assert.deepEqual([lines.length, lines[0].cash], [1, 5000]);

  const panels = buildFundPanelBook();
  assert.deepEqual(panels.worksheets.map((w) => w.name), ["Dán vào BK THU (V1)"]);
  assert.equal(formula(panels.getWorksheet("Dán vào BK THU (V1)")!, "AB5"), 'IF($V5="","",AB4+W5-Y5+Z5-AA5)');
});
