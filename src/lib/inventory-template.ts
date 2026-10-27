// The stock file of a hotel: ONE sheet for each kind of kho (MINIBAR, AMENITIES, VẬT TƯ, ĐỒ VẢI), each holding everything of that kho side by side:
//  A..E "NHẬP" (ngày, mặt hàng, số lượng, thành tiền, ghi chú), G..K "XUẤT" (ngày, phòng, mặt hàng, số lượng, ghi chú), M..P "KIỂM KÊ" (ngày kiểm, mặt hàng, số lượng đếm, ghi chú),
//  and from R "TỒN KHO": the item list with the opening stock of the month (typed) and, by formula, what came in, went out, the price, the closing stock and the difference with the last count.
// The lists run down the sheet for the whole year; the month in S2 says which month TỒN KHO shows. Same valuation as the finance team's "bảng kê hàng hóa" (see inventory.ts).
// Built with exceljs; inventory-template.test.ts checks the layout and the formulas.
import ExcelJS from "exceljs";

const FIRST = 5;                                       // first data row; row 4 holds the headers, row 3 the block titles
const NHAP_LAST = 1504, XUAT_LAST = 6004, KIEM_LAST = 2004; // rows the formulas read (1500 receipts, 6000 issues, 2000 counts a year)
const FORMAT_ROWS = { nhap: 400, xuat: 2000, kiem: 800 };    // rows prepared with borders and drop-downs; more can be typed below
const MIN_ITEM_ROWS = 40; // rows of the item list; a kho with more items gets 10 spare rows below the last one
const NAVY = "1F3A5F";
const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const head = (c: ExcelJS.Cell, color = NAVY) => { c.fill = fill(color); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = BORDER; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };
const input = (c: ExcelJS.Cell) => { c.fill = fill("FEF3C7"); c.border = BORDER; };
const RED = { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: "FFFECACA" } }, font: { bold: true, color: { argb: "FFB91C1C" } } };
const MONEY = "#,##0;-#,##0;0";

export type ItemSeed = { name: string; kind: string; unit: string; openQty?: number; openValue?: number; fixedPrice?: number; bluejay?: string }; // kind: "Bán" / "Miễn phí" (minibar), "Amenities" / "Vật tư", "Đồ vải"
export type KhoSeed = { sheet: string; title: string; items: ItemSeed[] };
export const KHO_SHEETS = ["MINIBAR", "AMENITIES", "VẬT TƯ", "ĐỒ VẢI"] as const;

const range = (col: string, last: number) => `$${col}$${FIRST}:$${col}$${last}`;

function addKho(book: ExcelJS.Workbook, kho: KhoSeed, month: string) {
  const itemRows = Math.max(MIN_ITEM_ROWS, kho.items.length + 10), ITEM_LAST = FIRST + itemRows - 1;
  const ws = book.addWorksheet(kho.sheet, { views: [{ state: "frozen", ySplit: 4 }] });
  ws.getCell("A1").value = `KHO ${kho.title}`; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  ws.getCell("A2").value = "Nhập liệu ở ba bảng bên trái (cột A đến P), thêm dòng ở cuối. Bảng TỒN KHO (từ cột R) tự tính cho tháng ở ô S2: nhập tay tồn đầu tháng ở ô vàng."; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } };

  const block = (col: number, title: string, headers: string[], widths: number[], dateOffset: number, itemOffset: number, money: number[], rows: number, color = NAVY) => {
    ws.mergeCells(3, col, 3, col + headers.length - 1); ws.getCell(3, col).value = title; head(ws.getCell(3, col), color);
    headers.forEach((h, i) => { const c = ws.getCell(4, col + i); c.value = h; head(c, color); ws.getColumn(col + i).width = widths[i]; });
    for (let r = FIRST; r < FIRST + rows; r++) {
      for (let i = 0; i < headers.length; i++) { const cell = ws.getCell(r, col + i); cell.border = BORDER; if (r % 2 === 0) cell.fill = fill("F4F7FB"); }
      ws.getCell(r, col + dateOffset).numFmt = "dd/mm/yyyy";
      for (const m of money) ws.getCell(r, col + m).numFmt = "#,##0";
      ws.getCell(r, col + itemOffset).dataValidation = { type: "list", allowBlank: true, formulae: [`$R$${FIRST}:$R$${ITEM_LAST}`], showErrorMessage: true, errorStyle: "warning", errorTitle: "Mặt hàng", error: "Mặt hàng không có trong danh sách ở bảng TỒN KHO (cột R); tồn kho sẽ không cộng dòng này." };
    }
  };
  block(1, "NHẬP KHO", ["Ngày", "Mặt hàng", "Số lượng", "Thành tiền", "Ghi chú"], [13, 28, 10, 14, 22], 0, 1, [3], FORMAT_ROWS.nhap, "15803D");
  block(7, "XUẤT KHO (theo ngày, phòng)", ["Ngày", "Phòng", "Mặt hàng", "Số lượng", "Ghi chú"], [13, 9, 28, 10, 22], 0, 2, [], FORMAT_ROWS.xuat, "B91C1C");
  block(13, "KIỂM KÊ", ["Ngày kiểm", "Mặt hàng", "Số lượng đếm", "Ghi chú"], [13, 28, 12, 20], 0, 1, [], FORMAT_ROWS.kiem, "1D4ED8");
  for (const c of [6, 12, 17]) ws.getColumn(c).width = 3;

  // TỒN KHO, from column R
  ws.getCell("R2").value = "Tháng"; ws.getCell("R2").font = { bold: true, color: { argb: `FF${NAVY}` } }; ws.getCell("R2").alignment = { horizontal: "right" };
  const [mm, yyyy] = month.split("/").map(Number);
  ws.getCell("S2").value = new Date(Date.UTC(yyyy, mm - 1, 1)); ws.getCell("S2").numFmt = "mm/yyyy"; input(ws.getCell("S2"));
  ws.mergeCells("R3:X3"); ws.getCell("R3").value = "TỒN KHO — NHẬP TAY (ô vàng)"; head(ws.getCell("R3"), "B45309");
  ws.mergeCells("Y3:AH3"); ws.getCell("Y3").value = "TỰ TÍNH TỪ BA BẢNG NHẬP, XUẤT, KIỂM KÊ"; head(ws.getCell("Y3"), "15803D");
  const cols: [string, number][] = [
    ["Mặt hàng", 30], ["Loại", 11], ["ĐVT", 8], ["Tồn đầu (SL)", 11], ["Tồn đầu (giá trị)", 14], ["Tên trong Blue Jay", 18], ["Đơn giá cố định", 12],
    ["Nhập (SL)", 10], ["Nhập (tiền)", 13], ["Xuất (SL)", 10], ["Giá áp dụng", 12], ["Giá trị xuất", 13], ["Tồn cuối (SL)", 11], ["Tồn cuối (giá trị)", 14],
    ["Kiểm kê gần nhất (SL)", 12], ["Chênh (SL)", 10], ["Chênh (giá trị)", 13],
  ];
  ws.getRow(4).height = 46;
  cols.forEach(([h, w], i) => { const c = ws.getCell(4, 18 + i); c.value = h; head(c, i < 7 ? "B45309" : "15803D"); ws.getColumn(18 + i).width = w; });
  for (let i = 0; i < itemRows; i++) {
    const r = FIRST + i, seed = kho.items[i], a = `$R${r}`;
    if (seed) {
      ws.getCell(`R${r}`).value = seed.name; ws.getCell(`S${r}`).value = seed.kind; ws.getCell(`T${r}`).value = seed.unit; ws.getCell(`U${r}`).value = seed.openQty ?? 0; ws.getCell(`V${r}`).value = seed.openValue ?? 0;
      if (seed.bluejay) ws.getCell(`W${r}`).value = seed.bluejay;
      if (seed.fixedPrice) ws.getCell(`X${r}`).value = seed.fixedPrice;
    }
    const f = (col: string, formula: string) => { ws.getCell(`${col}${r}`).value = { formula, result: 0 }; };
    const nhap = (sumCol: string) => `SUMIFS(${range(sumCol, NHAP_LAST)},${range("B", NHAP_LAST)},${a},${range("A", NHAP_LAST)},">="&$S$2,${range("A", NHAP_LAST)},"<="&EOMONTH($S$2,0))`;
    const xuat = () => `SUMIFS(${range("J", XUAT_LAST)},${range("I", XUAT_LAST)},${a},${range("G", XUAT_LAST)},">="&$S$2,${range("G", XUAT_LAST)},"<="&EOMONTH($S$2,0))`;
    f("Y", `IF(${a}="","",${nhap("C")})`);
    f("Z", `IF(${a}="","",${nhap("D")})`);
    f("AA", `IF(${a}="","",${xuat()})`);
    f("AB", `IF(${a}="","",IF($X${r}>0,$X${r},IF($U${r}+Y${r}>0,($V${r}+Z${r})/($U${r}+Y${r}),0)))`); // a fixed price when there is one, else the weighted average
    f("AC", `IF(${a}="","",AA${r}*AB${r})`);
    f("AD", `IF(${a}="","",$U${r}+Y${r}-AA${r})`);
    f("AE", `IF(${a}="","",$V${r}+Z${r}-AC${r})`);
    // the last count of the month typed in KIỂM KÊ (blank when none), against the closing stock, as the finance team does: difference = counted - closing
    const lastDay = `SUMPRODUCT(MAX((${range("N", KIEM_LAST)}=${a})*(${range("M", KIEM_LAST)}>=$S$2)*(${range("M", KIEM_LAST)}<=EOMONTH($S$2,0))*${range("M", KIEM_LAST)}))`; // the date of the last count of the month; SUMPRODUCT makes it an array formula in Excel and in Google Sheets
    f("AF", `IF(${a}="","",IF(${lastDay}=0,"",SUMIFS(${range("O", KIEM_LAST)},${range("N", KIEM_LAST)},${a},${range("M", KIEM_LAST)},${lastDay})))`);
    f("AG", `IF(OR(${a}="",AF${r}=""),"",AF${r}-AD${r})`);
    f("AH", `IF(OR(${a}="",AF${r}=""),"",AG${r}*AB${r})`);
    for (let c = 18; c <= 34; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c >= 21 && c !== 23) cell.numFmt = c === 28 ? "#,##0.##" : MONEY; }
    for (const col of ["R", "S", "T", "U", "V", "W", "X"]) input(ws.getCell(`${col}${r}`));
  }
  const t = ITEM_LAST + 1;
  ws.getCell(`R${t}`).value = "Cộng";
  for (const col of ["V", "Z", "AC", "AE", "AH"]) ws.getCell(`${col}${t}`).value = { formula: `SUM(${col}${FIRST}:${col}${ITEM_LAST})`, result: 0 };
  for (let c = 18; c <= 34; c++) { const cell = ws.getCell(t, c); cell.font = { bold: true }; cell.border = BORDER; if (c >= 21) cell.numFmt = MONEY; }
  ws.addConditionalFormatting({ ref: `AG${FIRST}:AH${ITEM_LAST}`, rules: [{ type: "expression", priority: 1, formulae: [`AND(AG${FIRST}<>"",ABS(AG${FIRST})>0)`], style: RED }] }); // a count that differs from the books
  ws.addConditionalFormatting({ ref: `AD${FIRST}:AD${ITEM_LAST}`, rules: [{ type: "expression", priority: 1, formulae: [`AND(AD${FIRST}<>"",AD${FIRST}<0)`], style: RED }] });     // more went out than was in
  return ws;
}

/** The stock file: one sheet per kho given. month: "mm/yyyy", the month TỒN KHO shows (S2 of each sheet). */
export function buildStockFile(khos: KhoSeed[], month: string, book = new ExcelJS.Workbook()): ExcelJS.Workbook {
  book.calcProperties.fullCalcOnLoad = true;
  for (const kho of khos) addKho(book, kho, month);
  return book;
}
