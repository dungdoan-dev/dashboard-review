// The day-by-day lines of the cash and the bank account, built into the BK THU ledger tab so the staff can compare them by eye with the real cash and the bank statement:
//  - BK THU (columns V..AD, rows 1 to 34; AE..AH are hidden helper cells): one row per day entered so far with the money in (thu), the money out (chi, read from "BK CHI <the same month>"),
//    the minimart in/out typed by the staff and the balance by the ledger, for the cash and for the bank. There is no typed real balance and no difference column.
// The month comes from the "KỲ BÁO CÁO" cell the tab already has (J1 of BK THU). Cash in = Tiền mặt + Cọc tiền mặt chưa ở; bank in = Tiền TK + Cọc TK chưa ở (deposits of guests already
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

/** BK THU: the lines of the check, in columns V..AD; AE..AH are helper cells (hidden). */
export function addIncomePanel(ws: ExcelJS.Worksheet) {
  const mine = (col: string) => `$${col}$${FIRST}:$${col}$${LEDGER_LAST}`;
  const chi = (col: string) => `INDIRECT("'BK CHI "&TEXT($AF$1,$AG$1)&"'!$${col}$${FIRST}:$${col}$${LEDGER_LAST}")`; // the expense tab of the same month, named "BK CHI 10/2026" or "BK CHI 10-2026"
  [13, 14, 14, 14, 14, 16, 14, 14, 16].forEach((w, i) => { ws.getColumn(22 + i).width = w; }); // V..AD
  for (let c = 31; c <= 34; c++) ws.getColumn(c).hidden = true;                               // AE..AH: helper cells
  const set = (ref: string, value: ExcelJS.CellValue) => { ws.getCell(ref).value = value; };
  const label = (ref: string, text: string) => { set(ref, text); ws.getCell(ref).font = { bold: true, color: { argb: `FF${NAVY}` } }; ws.getCell(ref).alignment = { horizontal: "right", vertical: "middle", wrapText: true }; };
  ws.getRow(1).height = Math.max(ws.getRow(1).height || 0, 32);
  // row 1: the two opening balances (typed), the latest bank difference, and the four helper cells
  label("V1", "Đầu kỳ tiền mặt"); input(ws.getCell("W1")); ws.getCell("W1").numFmt = "#,##0";
  label("X1", "Đầu kỳ ngân hàng"); input(ws.getCell("Y1")); ws.getCell("Y1").numFmt = "#,##0";
  set("AE1", { formula: `MAX(${mine("A")},IFERROR(MAX(${chi("A")}),0))`, result: 0 });                                                       // the latest date typed in either ledger
  set("AF1", { formula: 'IFERROR(DATE(YEAR($J$1),MONTH($J$1),1),DATE(VALUE(RIGHT($J$1,4)),VALUE(LEFT($J$1,2)),1))', result: 0 });            // J1 holds a date, or the text "10/2026"
  ws.getCell("AF1").numFmt = "mm/yyyy";
  set("AG1", { formula: 'IF(IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AF$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")', result: "mm/yyyy" }); // how the expense tab writes the month
  set("AH1", { formula: 'IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($AF$1,$AG$1)&"\'!A1")),0)=0', result: false });                                 // TRUE when there is no expense tab of the month
  // headers, rows 2 and 3
  ws.mergeCells("V2:V3"); set("V2", "Ngày"); head(ws.getCell("V2"), NAVY); head(ws.getCell("V3"), NAVY);
  ws.mergeCells("W2:AA2"); set("W2", { formula: 'IF($AH$1,"⚠ Không thấy tab BK CHI "&TEXT($AF$1,"mm/yyyy")&": chi đang tính 0","TIỀN MẶT (TK TM)")', result: "TIỀN MẶT (TK TM)" }); ws.mergeCells("AB2:AD2"); set("AB2", "NGÂN HÀNG (TK TGNH)");
  const names = ["Thu tiền mặt", "Chi tiền mặt", "Thu minimart (nhập)", "Chi minimart (nhập)", "Theo bảng kê", "Thu ngân hàng", "Chi ngân hàng", "Số dư theo bảng kê"];
  for (let c = 23; c <= 30; c++) { const color = c <= 27 ? GREEN : BLUE; head(ws.getCell(2, c), color); head(ws.getCell(3, c), color); ws.getCell(3, c).value = names[c - 23]; }
  ws.getRow(3).height = Math.max(ws.getRow(3).height || 0, 48);

  for (let r = FIRST; r <= LAST; r++) {
    const f = (col: string, formula: string) => set(`${col}${r}`, { formula, result: 0 });
    const day = `$V${r}`, first = r === FIRST, n = r - FIRST;
    f("V", `IF($AF$1+${n}>$AE$1,"",$AF$1+${n})`); // only the days up to the latest one typed
    f("W", `IF(${day}="","",SUMIFS(${mine("K")},${mine("A")},${day})+SUMIFS(${mine("L")},${mine("A")},${day}))`);
    f("X", `IF(${day}="","",IFERROR(SUMIFS(${chi("D")},${chi("A")},${day}),0))`);
    f("AA", `IF(${day}="","",${first ? "$W$1" : `AA${r - 1}`}+W${r}-X${r}+Y${r}-Z${r})`);
    f("AB", `IF(${day}="","",SUMIFS(${mine("M")},${mine("A")},${day})+SUMIFS(${mine("N")},${mine("A")},${day}))`);
    f("AC", `IF(${day}="","",IFERROR(SUMIFS(${chi("E")},${chi("A")},${day}),0))`);
    f("AD", `IF(${day}="","",${first ? "$Y$1" : `AD${r - 1}`}+AB${r}-AC${r})`);
    for (let c = 22; c <= 30; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; cell.numFmt = c === 22 ? "dd/mm/yyyy" : MONEY; }
    for (const col of ["Y", "Z"]) input(ws.getCell(`${col}${r}`));
  }
  ws.addConditionalFormatting({ ref: "W2", rules: [{ type: "expression", priority: 1, formulae: ["$AH$1"], style: RED }] }); // no expense tab: the header says so
}

/** Only the panel, on one sheet: copy V1:AH34 into the BK THU tab of a hotel's Google Sheet (same cells), to add the lines to a tab that already holds data. */
export function buildFundPanelBook(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.calcProperties.fullCalcOnLoad = true;
  addIncomePanel(book.addWorksheet("Dán vào BK THU (V1)"));
  return book;
}
