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
const CHI_D = `INDIRECT("'BK CHI "&TEXT($AE$1,$AF$1)&"'!$D$4:$D$503")`, CHI_A = `INDIRECT("'BK CHI "&TEXT($AE$1,$AF$1)&"'!$A$4:$A$503")`;

test("the income tab holds the check: money in from the tab itself, money out from the expense tab of the same month, balances run on from the opening balance", () => {
  const ws = buildLedgerTemplate().getWorksheet(TEMPLATE_SHEET)!;
  assert.equal(formula(ws, "AE1"), 'IFERROR(DATE(YEAR($J$1),MONTH($J$1),1),DATE(VALUE(RIGHT($J$1,4)),VALUE(LEFT($J$1,2)),1))'); // J1: "KỲ BÁO CÁO" of the ledger, a date or the text "10/2026"
  // the expense tab of the month is named "BK CHI 10/2026" in Google Sheets and "BK CHI 10-2026" in an Excel file: AF1 finds which, AG1 is TRUE when there is none, and the header says so
  assert.equal(formula(ws, "AF1"), 'IF(IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AE$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")');
  assert.equal(formula(ws, "AG1"), 'IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AE$1,$AF$1)&"\'!A1")),0)=0');
  assert.match(formula(ws, "W2"), /^IF\(\$AG\$1,"⚠ Không thấy tab BK CHI "/);
  assert.equal(formula(ws, "AD1"), `MAX($A$4:$A$503,IFERROR(MAX(${CHI_A}),0))`); // the latest date typed in either ledger
  assert.equal(formula(ws, "V4"), 'IF($AE$1+0>$AD$1,"",$AE$1+0)'); // a day shows only up to the latest one typed
  assert.equal(formula(ws, "V34"), 'IF($AE$1+30>$AD$1,"",$AE$1+30)'); // 31 rows; a month with fewer days is cut by the latest date
  // cash: opening + Tiền mặt (K) + Cọc tiền mặt chưa ở (L) - chi tiền mặt (D of the expense tab) + minimart
  assert.equal(formula(ws, "W4"), `IF($V4="","",$W$1+SUMIFS($K$4:$K$503,$A$4:$A$503,$V4)+SUMIFS($L$4:$L$503,$A$4:$A$503,$V4)-IFERROR(SUMIFS(${CHI_D},${CHI_A},$V4),0)+X4)`);
  assert.match(formula(ws, "W5"), /^IF\(\$V5="","",W4\+SUMIFS/); // then from the day before
  assert.equal(formula(ws, "Z5"), 'IF(OR($V5="",Y5=""),"",Y5-W5)');
  // bank: opening + Tiền TK (M) + Cọc TK chưa ở (N) - chi tiền CK (E)
  assert.match(formula(ws, "AA4"), /^IF\(\$V4="","",\$Y\$1\+SUMIFS\(\$M\$4:\$M\$503,\$A\$4:\$A\$503,\$V4\)\+SUMIFS\(\$N\$4:\$N\$503.*\$E\$4:\$E\$503/);
  assert.match(formula(ws, "AA5"), /^IF\(\$V5="","",AA4\+SUMIFS/);
  assert.equal(formula(ws, "AC5"), 'IF(OR($V5="",AB5=""),"",AB5-AA5)');
  const lastOfZ = 'SUMPRODUCT(MAX((Z4:Z34<>"")*(ROW(Z4:Z34)-3)))'; // the position of the last difference typed; LOOKUP(2,1/(...)) shows nothing in Google Sheets
  assert.equal(formula(ws, "AA1"), `IF(${lastOfZ}=0,"",INDEX(Z4:Z34,${lastOfZ}))`); // the latest difference of the cash
  assert.match(formula(ws, "AC1"), /^IF\(SUMPRODUCT\(MAX\(\(AC4:AC34<>""\)\*\(ROW\(AC4:AC34\)-3\)\)\)=0,"",INDEX\(AC4:AC34,/);
  assert.deepEqual([30, 31, 32, 33].map((c) => ws.getColumn(c).hidden), [true, true, true, true]); // the helper cells AD..AG
});

test("the expense tab shows the two latest differences, read from the income tab of the same month", () => {
  const ws = buildExpenseTemplate("10/2026").getWorksheet(expenseSheetName("10/2026"))!;
  assert.equal(formula(ws, "M1"), 'IFERROR(INDIRECT("\'BK THU "&TEXT($H$1,$P$1)&"\'!AA1"),"")'); // H1: "KỲ BÁO CÁO" of the expense ledger
  assert.equal(formula(ws, "O1"), 'IFERROR(INDIRECT("\'BK THU "&TEXT($H$1,$P$1)&"\'!AC1"),"")');
  assert.equal(ws.getCell("L1").value, "Chênh TM gần nhất");
  assert.equal(formula(ws, "P1"), 'IF(IFERROR(ROWS(INDIRECT("\'BK THU "&TEXT($H$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")'); // how the income tab writes the month
  assert.equal(formula(ws, "P2"), 'IFERROR(ROWS(INDIRECT("\'BK THU "&TEXT($H$1,$P$1)&"\'!A1")),0)=0'); // TRUE when there is no income tab of the month
  assert.match(formula(ws, "L2"), /^IF\(\$P\$2,"⚠ Không thấy tab BK THU "/);
});

test("the ledgers are still read with the panel beside them, and the pasteable file has the two panels", async () => {
  const thu = buildLedgerTemplate(), thuWs = thu.getWorksheet(TEMPLATE_SHEET)!;
  thuWs.getCell("A4").value = new Date(Date.UTC(2026, 9, 2)); thuWs.getCell("B4").value = "009465"; thuWs.getCell("E4").value = "Tiền phòng"; thuWs.getCell("K4").value = 1300000;
  const led = parseLedger(await rows(thu, TEMPLATE_SHEET));
  assert.deepEqual([led.entries.length, led.entries[0].taken.cash], [1, 1300000]);

  const chi = buildExpenseTemplate("10/2026"), chiWs = chi.getWorksheet(expenseSheetName("10/2026"))!;
  chiWs.getCell("A4").value = new Date(Date.UTC(2026, 9, 2)); chiWs.getCell("B4").value = "Chi khác"; chiWs.getCell("C4").value = "x"; chiWs.getCell("D4").value = 5000;
  const lines = parseExpenses(await rows(chi, expenseSheetName("10/2026")));
  assert.deepEqual([lines.length, lines[0].cash], [1, 5000]);

  const panels = buildFundPanelBook();
  assert.deepEqual(panels.worksheets.map((w) => w.name), ["Dán vào BK THU (V1)", "Dán vào BK CHI (L1)"]);
  assert.match(formula(panels.getWorksheet("Dán vào BK THU (V1)")!, "AA5"), /^IF\(\$V5="","",AA4\+SUMIFS/);
});
