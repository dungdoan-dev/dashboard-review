// The day-by-day check of the cash and the bank account, built into the two ledger tabs so it shows as the staff type:
//  - BK THU (columns V..AC, rows 1 to 34; AD..AG are hidden helper cells): one row per day entered so far with the expected balance (opening balance + money in - money out, money out read from "BK CHI <the same month>"),
//    the real one typed by the staff (cash counted, balance of the bank statement) and the difference. Row 1 also shows the latest difference of each.
//  - BK CHI (L1:O1): only those two latest differences, read from the BK THU panel, so whoever types the expenses sees them at once.
// The month comes from the "KỲ BÁO CÁO" cell the tab already has (J1 of BK THU, H1 of BK CHI). Cash in = Tiền mặt + Cọc tiền mặt chưa ở; bank in = Tiền TK + Cọc TK chưa ở (deposits of guests already
// staying were received earlier; the finance team's sổ quỹ and sổ tiền gửi count them this way). Built with exceljs; fund-panel.test.ts checks the layout and the formulas.
import ExcelJS from "exceljs";

const FIRST = 4, DAYS = 31, LAST = FIRST + DAYS - 1;  // rows of the days
const LEDGER_LAST = 503;                              // last row of the ledgers' data (500 rows from row 4)
const NAVY = "1F3A5F", GREEN = "15803D", BLUE = "1D4ED8";
const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const head = (cell: ExcelJS.Cell, color: string) => { cell.fill = fill(color); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.border = BORDER; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };
const input = (cell: ExcelJS.Cell) => { cell.fill = fill("FEF3C7"); cell.border = BORDER; };
const RED = { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: "FFFECACA" } }, font: { bold: true, color: { argb: "FFB91C1C" } } };
const MONEY = "#,##0;-#,##0;0";
const flag = (ws: ExcelJS.Worksheet, ref: string) => { const top = ref.split(":")[0]; ws.addConditionalFormatting({ ref, rules: [{ type: "expression", priority: 1, formulae: [`AND(${top}<>"",ABS(${top})>1)`], style: RED }] }); };
// The last number in the column. SUMPRODUCT makes the array work in Google Sheets as well as Excel (LOOKUP(2,1/(range<>""),range) shows nothing in Sheets without ARRAYFORMULA).
const lastOf = (col: string) => {
  const range = `${col}${FIRST}:${col}${LAST}`, n = `SUMPRODUCT(MAX((${range}<>"")*(ROW(${range})-${FIRST - 1})))`; // n: the position of the last filled cell
  return `IF(${n}=0,"",INDEX(${range},${n}))`;
};

/** BK THU: the check, in columns V..AC; AD and AE are helper cells (hidden). */
export function addIncomePanel(ws: ExcelJS.Worksheet) {
  const mine = (col: string) => `$${col}$${FIRST}:$${col}$${LEDGER_LAST}`;
  const chi = (col: string) => `INDIRECT("'BK CHI "&TEXT($AE$1,$AF$1)&"'!$${col}$${FIRST}:$${col}$${LEDGER_LAST}")`; // the expense tab of the same month, named "BK CHI 10/2026" or "BK CHI 10-2026"
  [13, 16, 14, 16, 13, 16, 16, 13].forEach((w, i) => { ws.getColumn(22 + i).width = w; }); // V..AC
  for (let c = 30; c <= 33; c++) ws.getColumn(c).hidden = true;                             // AD..AG: helper cells
  const set = (ref: string, value: ExcelJS.CellValue) => { ws.getCell(ref).value = value; };
  const label = (ref: string, text: string) => { set(ref, text); ws.getCell(ref).font = { bold: true, color: { argb: `FF${NAVY}` } }; ws.getCell(ref).alignment = { horizontal: "right", vertical: "middle", wrapText: true }; };
  ws.getRow(1).height = Math.max(ws.getRow(1).height || 0, 32);
  // row 1: the two opening balances (typed), the latest difference of each, and the two helper cells
  label("V1", "Đầu kỳ tiền mặt"); input(ws.getCell("W1")); ws.getCell("W1").numFmt = "#,##0";
  label("X1", "Đầu kỳ ngân hàng"); input(ws.getCell("Y1")); ws.getCell("Y1").numFmt = "#,##0";
  label("Z1", "Chênh TM gần nhất"); set("AA1", { formula: lastOf("Z"), result: 0 });
  label("AB1", "Chênh NH gần nhất"); set("AC1", { formula: lastOf("AC"), result: 0 });
  for (const ref of ["AA1", "AC1"]) { ws.getCell(ref).border = BORDER; ws.getCell(ref).font = { bold: true }; ws.getCell(ref).numFmt = MONEY; }
  set("AD1", { formula: `MAX(${mine("A")},IFERROR(MAX(${chi("A")}),0))`, result: 0 });                                                       // the latest date typed in either ledger
  set("AE1", { formula: 'IFERROR(DATE(YEAR($J$1),MONTH($J$1),1),DATE(VALUE(RIGHT($J$1,4)),VALUE(LEFT($J$1,2)),1))', result: 0 });            // J1 holds a date, or the text "10/2026"
  ws.getCell("AE1").numFmt = "mm/yyyy";
  set("AF1", { formula: 'IF(IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AE$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")', result: "mm/yyyy" }); // how the expense tab writes the month
  set("AG1", { formula: 'IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AE$1,$AF$1)&"\'!A1")),0)=0', result: false });                                 // TRUE when there is no expense tab of the month
  // headers, rows 2 and 3
  ws.mergeCells("V2:V3"); set("V2", "Ngày"); head(ws.getCell("V2"), NAVY); head(ws.getCell("V3"), NAVY);
  ws.mergeCells("W2:Z2"); set("W2", { formula: 'IF($AG$1,"⚠ Không thấy tab BK CHI "&TEXT($AE$1,"mm/yyyy")&": chi đang tính 0","TIỀN MẶT (TK TM)")', result: "TIỀN MẶT (TK TM)" }); ws.mergeCells("AA2:AC2"); set("AA2", "NGÂN HÀNG (TK TGNH)");
  const names = ["Theo bảng kê", "Minimart, thu − chi (nhập)", "Đếm thực tế (nhập)", "Chênh", "Theo bảng kê", "Số dư sao kê (nhập)", "Chênh"];
  for (let c = 23; c <= 29; c++) { const color = c <= 26 ? GREEN : BLUE; head(ws.getCell(2, c), color); head(ws.getCell(3, c), color); ws.getCell(3, c).value = names[c - 23]; }
  ws.getRow(3).height = Math.max(ws.getRow(3).height || 0, 48);

  for (let r = FIRST; r <= LAST; r++) {
    const f = (col: string, formula: string) => set(`${col}${r}`, { formula, result: 0 });
    const day = `$V${r}`, first = r === FIRST, n = r - FIRST;
    f("V", `IF($AE$1+${n}>$AD$1,"",$AE$1+${n})`); // only the days up to the latest one typed
    f("W", `IF(${day}="","",${first ? "$W$1" : `W${r - 1}`}+SUMIFS(${mine("K")},${mine("A")},${day})+SUMIFS(${mine("L")},${mine("A")},${day})-IFERROR(SUMIFS(${chi("D")},${chi("A")},${day}),0)+X${r})`);
    f("Z", `IF(OR(${day}="",Y${r}=""),"",Y${r}-W${r})`);
    f("AA", `IF(${day}="","",${first ? "$Y$1" : `AA${r - 1}`}+SUMIFS(${mine("M")},${mine("A")},${day})+SUMIFS(${mine("N")},${mine("A")},${day})-IFERROR(SUMIFS(${chi("E")},${chi("A")},${day}),0))`);
    f("AC", `IF(OR(${day}="",AB${r}=""),"",AB${r}-AA${r})`);
    for (let c = 22; c <= 29; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; cell.numFmt = c === 22 ? "dd/mm/yyyy" : MONEY; }
    for (const col of ["X", "Y", "AB"]) input(ws.getCell(`${col}${r}`));
  }
  flag(ws, `Z${FIRST}:Z${LAST}`); flag(ws, `AC${FIRST}:AC${LAST}`); flag(ws, "AA1"); flag(ws, "AC1");
  ws.addConditionalFormatting({ ref: "W2", rules: [{ type: "expression", priority: 1, formulae: ["$AG$1"], style: RED }] }); // no expense tab: the header says so
}

/** BK CHI: the two latest differences, read from the BK THU panel of the same month (L1:O1). */
export function addExpensePanel(ws: ExcelJS.Worksheet) {
  const mirror = (cell: string) => `IFERROR(INDIRECT("'BK THU "&TEXT($H$1,$P$1)&"'!${cell}"),"")`; // H1: the "KỲ BÁO CÁO" of this tab; P1: how the income tab writes the month
  [16, 13, 16, 13].forEach((w, i) => { ws.getColumn(12 + i).width = w; }); // L..O
  ws.getColumn(16).hidden = true; // P: helper cells
  ws.getRow(1).height = Math.max(ws.getRow(1).height || 0, 32);
  const label = (ref: string, text: string) => { ws.getCell(ref).value = text; ws.getCell(ref).font = { bold: true, color: { argb: `FF${NAVY}` } }; ws.getCell(ref).alignment = { horizontal: "right", vertical: "middle", wrapText: true }; };
  label("L1", "Chênh TM gần nhất"); label("N1", "Chênh NH gần nhất");
  for (const [ref, from] of [["M1", "AA1"], ["O1", "AC1"]]) { const c = ws.getCell(ref); c.value = { formula: mirror(from), result: 0 }; c.border = BORDER; c.font = { bold: true }; c.numFmt = MONEY; }
  ws.getCell("P1").value = { formula: 'IF(IFERROR(ROWS(INDIRECT("\'BK THU "&TEXT($H$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")', result: "mm/yyyy" };
  ws.getCell("P2").value = { formula: 'IFERROR(ROWS(INDIRECT("\'BK THU "&TEXT($H$1,$P$1)&"\'!A1")),0)=0', result: false }; // TRUE when there is no income tab of the month
  ws.getCell("L2").value = { formula: 'IF($P$2,"⚠ Không thấy tab BK THU "&TEXT($H$1,"mm/yyyy")&": chưa có chênh","Số đếm và sao kê nhập ở tab BK THU (cột V đến AC).")', result: "" };
  ws.getCell("L2").font = { italic: true, color: { argb: "FF586B84" } };
  flag(ws, "M1"); flag(ws, "O1");
  ws.addConditionalFormatting({ ref: "L2", rules: [{ type: "expression", priority: 1, formulae: ["$P$2"], style: RED }] });
}

/** Only the two panels, on two sheets: copy V1:AG34 of the first into the BK THU tab and L1:P2 of the second into the BK CHI tab of a hotel's Google Sheet (same cells), to add the check to tabs that already hold data. */
export function buildFundPanelBook(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.calcProperties.fullCalcOnLoad = true;
  addIncomePanel(book.addWorksheet("Dán vào BK THU (V1)"));
  addExpensePanel(book.addWorksheet("Dán vào BK CHI (L1)"));
  return book;
}
