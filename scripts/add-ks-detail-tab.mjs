// One more tab in the monthly file of a café ("Ăn sáng, Cafe ..."): "DT ĂN SÁNG, CF thu KS", the finance team's detail of what hotel guests ate and drank (charged to the room) and of the counter combos,
// for the staff to enter line by line and to check against BK THU. The tab only reads BK THU (its day table compares); nothing reads the tab, so the tabs of the app (BK THU, BK CHI, kho) work as before.
//   node scripts/add-ks-detail-tab.mjs <in.xlsx> <out.xlsx> ["<finance file with the price list>"]
import fs from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const [src, out, financePath] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: node scripts/add-ks-detail-tab.mjs <in.xlsx> <out.xlsx> ["<finance file>"]');
const NAME = "DT ĂN SÁNG, CF thu KS";
const book = new ExcelJS.Workbook();
await book.xlsx.readFile(src);
if (book.getWorksheet(NAME)) throw new Error(`Đã có tab ${NAME}.`);
const thu = book.getWorksheet("BK THU");
if (!thu || !thu.getCell("Z1").value) throw new Error("Không thấy tab BK THU của mẫu hiện tại (ô Z1 là ngày đầu tháng).");

// the price list of the finance team: name, price, cost (Z, AB, AC of their tab)
let prices = [];
if (financePath) {
  const wb = XLSX.read(fs.readFileSync(financePath));
  if (!wb.Sheets[NAME]) throw new Error(`File kế toán không có tab ${NAME}.`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[NAME], { header: 1, defval: "" });
  for (let i = 4; i < rows.length; i++) { const n = String(rows[i][25]).trim(); if (n) prices.push([n, rows[i][27] === "" ? null : rows[i][27], rows[i][28] === "" ? null : rows[i][28]]); }
}

// ---------- styles of the house (as BK THU) ----------
const NAVY = "1F3A5F", GREEN = "15803D", GREY = "475569", ORANGE = "C2570C", BAND = "F4F7FB";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } }, BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const font = (o = {}) => ({ name: "Calibri", size: 11, color: { argb: "FF000000" }, ...o });
const MONEY = "#,##0;-#,##0;0";
const style = (cell, { f = font(), fl = null, al = { vertical: "middle" }, fmt = "General", bd = BORDER } = {}) => { cell.style = { font: f, fill: fl ?? { type: "pattern", pattern: "none" }, alignment: al, numFmt: fmt, border: bd }; };
const head = (cell, hex) => style(cell, { f: font({ bold: true, color: { argb: "FFFFFFFF" } }), fl: fill(hex), al: { horizontal: "center", vertical: "middle", wrapText: true } });
const FIRST = 5, LAST = 504;
const L = (n) => { let s = ""; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };

const ws = book.addWorksheet(NAME, { views: [{ state: "frozen", ySplit: 4 }] });
ws.getCell("A1").value = "Tab để nhân viên nhập chi tiết và đối soát: không tính vào BK THU, BK CHI hay báo cáo. Số thu qua khách sạn của tháng nhập ở BK THU, cột O (bảng đối soát bên phải so hai số này).";
ws.getCell("A1").font = font({ italic: true, color: { argb: "FF586B84" } });

// two tables side by side: A..J hotel guests, L..V counter
const tables = [
  { at: 1, title: "DOANH THU BÁN HÀNG ĂN SÁNG + CAFE khách sạn", counter: false },
  { at: 12, title: "DOANH THU BÁN HÀNG ĂN SÁNG + CAFE COMBO TẠI QUẦY", counter: true },
];
const PRICE = 34, SRC = 38, COMBO = 39; // columns of the price list (AH..AJ), the "Nguồn DT" list and the combo list
for (const t of tables) {
  const c = (k) => t.at + k;
  const cols = [["STT", NAVY, 6], ["Ngày tháng", NAVY, 12], ["Món Combo", NAVY, 14], ["Số phòng", NAVY, 10], ["Món", NAVY, 30], ["Nguồn DT", NAVY, 15], ["Số lượng", GREEN, 9], ["Đơn giá", GREEN, 11], ["Thành tiền", GREY, 13],
    ...(t.counter ? [["DT Combo", GREEN, 13], ["Tổng Combo", GREEN, 11]] : [["Tổng Combo", GREEN, 11]])];
  ws.mergeCells(2, c(0), 2, c(cols.length - 1)); ws.getCell(2, c(0)).value = t.title; head(ws.getCell(2, c(0)), NAVY);
  cols.forEach(([name, hex, width], k) => { head(ws.getCell(3, c(k)), hex); ws.getCell(3, c(k)).value = name; ws.getColumn(c(k)).width = width; });
  // the hotel table has the amount of a combo typed on its first row (Thành tiền) and the number of combos (Tổng Combo); the counter table has the line amount computed and the combo amount typed
  const amount = c(8), qty = c(6), unit = c(7), dish = c(4);
  for (let r = FIRST; r <= LAST; r++) {
    const band = r % 2 === 1 ? fill(BAND) : null;
    cols.forEach((_, k) => style(ws.getCell(r, c(k)), { fl: band, fmt: k === 1 ? "dd/mm/yyyy" : k >= 6 ? MONEY : "General", al: k === 1 ? { horizontal: "center", vertical: "middle" } : { vertical: "middle" } }));
    ws.getCell(r, unit).value = { formula: `IF(${L(dish)}${r}="","",IFERROR(VLOOKUP(${L(dish)}${r},$${L(PRICE)}$${FIRST}:$${L(PRICE + 1)}$300,2,0),""))` };
    if (t.counter) ws.getCell(r, amount).value = { formula: `IF(${L(dish)}${r}="","",${L(qty)}${r}*IF(${L(unit)}${r}="",0,${L(unit)}${r}))` };
    ws.getCell(r, dish).dataValidation = { type: "list", allowBlank: true, formulae: [`$${L(PRICE)}$${FIRST}:$${L(PRICE)}$300`], showErrorMessage: false };
    ws.getCell(r, c(5)).dataValidation = { type: "list", allowBlank: true, formulae: [`$${L(SRC)}$${FIRST}:$${L(SRC)}$8`], showErrorMessage: false };
    ws.getCell(r, c(2)).dataValidation = { type: "list", allowBlank: true, formulae: [`$${L(COMBO)}$${FIRST}:$${L(COMBO)}$7`], showErrorMessage: false };
  }
  ws.getCell(4, c(0)).value = "TỔNG CỘNG THÁNG";
  cols.forEach((_, k) => { const cell = ws.getCell(4, c(k)); style(cell, { f: font({ bold: true, color: { argb: `FF${NAVY}` } }), fl: fill("DCE6F1"), fmt: MONEY }); if (k >= 8) cell.value = { formula: `SUBTOTAL(9,${L(c(k))}${FIRST}:${L(c(k))}${LAST})` }; });
}
ws.getColumn(11).width = 3;

// day table: what is typed here against BK THU (read only)
const D = 24; // X
const dayHead = [["Ngày", NAVY, 12], ["Khách sạn: số combo", GREEN, 12], ["Khách sạn: thành tiền", GREEN, 15], ["BK THU cột O (thu qua khách sạn)", ORANGE, 17], ["Chênh", GREY, 12], ["Tại quầy: thành tiền", GREEN, 15], ["BK THU: khách trực tiếp (cột M)", ORANGE, 17], ["Chênh", GREY, 12]];
ws.getColumn(D - 1).width = 3;
ws.mergeCells(2, D, 2, D + dayHead.length - 1); ws.getCell(2, D).value = "ĐỐI SOÁT THEO NGÀY (chỉ để xem, chênh lệch không ảnh hưởng báo cáo)"; head(ws.getCell(2, D), NAVY);
dayHead.forEach(([name, hex, width], k) => { head(ws.getCell(3, D + k), hex); ws.getCell(3, D + k).value = name; ws.getColumn(D + k).width = width; });
ws.getRow(3).height = 48;
const rng = (col, from = FIRST, to = LAST) => `$${col}$${from}:$${col}$${to}`;
const hotelDate = rng("B"), counterDate = rng("M");
for (let i = 0; i < 31; i++) {
  const r = FIRST + i, d = `$${L(D)}${r}`;
  const f = [
    `IF('BK THU'!$Z$1+${i}>EOMONTH('BK THU'!$Z$1,0),"",'BK THU'!$Z$1+${i})`,
    `IF(${d}="","",SUMIFS(${rng("J")},${hotelDate},${d}))`,
    `IF(${d}="","",SUMIFS(${rng("I")},${hotelDate},${d}))`,
    `IF(${d}="","",SUMIFS('BK THU'!$O$5:$O$504,'BK THU'!$A$5:$A$504,${d}))`,
    `IF(${d}="","",${L(D + 2)}${r}-${L(D + 3)}${r})`,
    `IF(${d}="","",SUMIFS(${rng("T")},${counterDate},${d}))`,
    `IF(${d}="","",SUMIFS('BK THU'!$M$5:$M$504,'BK THU'!$A$5:$A$504,${d}))`,
    `IF(${d}="","",${L(D + 5)}${r}-${L(D + 6)}${r})`,
  ];
  f.forEach((formula, k) => { const cell = ws.getCell(r, D + k); cell.value = { formula }; style(cell, { fmt: k === 0 ? "dd/mm/yyyy" : MONEY, al: k === 0 ? { horizontal: "center", vertical: "middle" } : { vertical: "middle" }, f: font({ bold: k === 4 || k === 7 }) }); });
}
const T = FIRST + 31;
ws.getCell(T, D).value = "CỘNG THÁNG";
for (let k = 0; k < dayHead.length; k++) { const cell = ws.getCell(T, D + k); style(cell, { f: font({ bold: true, color: { argb: `FF${NAVY}` } }), fl: fill("DCE6F1"), fmt: MONEY }); if (k) cell.value = { formula: `SUM(${L(D + k)}${FIRST}:${L(D + k)}${T - 1})` }; }
ws.getCell(T + 2, D).value = "Chênh khác 0: số nhập ở đây chưa khớp BK THU (nhập thiếu, nhập nhầm ngày, hoặc BK THU chưa nhập). Bảng này không sửa BK THU.";
ws.getCell(T + 2, D).font = font({ italic: true, color: { argb: "FF586B84" } });
ws.addConditionalFormatting({ ref: `${L(D + 4)}${FIRST}:${L(D + 4)}${T}`, rules: [{ type: "cellIs", operator: "notEqual", priority: 1, formulae: ["0"], style: { font: { bold: true, color: { argb: "FFB91C1C" } } } }] });
ws.addConditionalFormatting({ ref: `${L(D + 7)}${FIRST}:${L(D + 7)}${T}`, rules: [{ type: "cellIs", operator: "notEqual", priority: 2, formulae: ["0"], style: { font: { bold: true, color: { argb: "FFB91C1C" } } } }] });

// lists: price list, Nguồn DT, combo
ws.getColumn(PRICE - 1).width = 3;
ws.mergeCells(2, PRICE, 2, PRICE + 2); ws.getCell(2, PRICE).value = "BẢNG GIÁ (sửa khi đổi giá)"; head(ws.getCell(2, PRICE), NAVY);
[["Món", 30], ["Giá bán", 11], ["Giá cost", 11]].forEach(([name, w], k) => { head(ws.getCell(3, PRICE + k), NAVY); ws.getCell(3, PRICE + k).value = name; ws.getColumn(PRICE + k).width = w; });
for (let r = FIRST; r <= 300; r++) for (let k = 0; k < 3; k++) style(ws.getCell(r, PRICE + k), { fl: fill("FEF3C7"), fmt: k ? "#,##0" : "General" });
prices.forEach(([n, p, c], k) => { const r = FIRST + k; ws.getCell(r, PRICE).value = n; if (p !== null) ws.getCell(r, PRICE + 1).value = p; if (c !== null) ws.getCell(r, PRICE + 2).value = c; });
ws.getColumn(SRC - 1).width = 3;
for (const [col, name, list] of [[SRC, "Nguồn DT", ["Ăn sáng", "Cafe", "Bánh", "Nước suối, ngọt"]], [COMBO, "Món Combo", ["Combo 100K", "Combo 88K", "Lẻ"]]]) {
  head(ws.getCell(3, col), NAVY); ws.getCell(3, col).value = name; ws.getColumn(col).width = 18;
  list.forEach((v, k) => { ws.getCell(FIRST + k, col).value = v; style(ws.getCell(FIRST + k, col), { fl: fill("FEF3C7") }); });
}
ws.getRow(1).height = 20; ws.getRow(3).height = 48;
book.calcProperties.fullCalcOnLoad = true;
await book.xlsx.writeFile(out);
const dup = prices.map((p) => p[0]).filter((n, i, a) => a.indexOf(n) !== i);
console.log(`Đã thêm tab “${NAME}”: ${prices.length} món trong bảng giá${dup.length ? `, trùng tên (VLOOKUP lấy dòng đầu): ${dup.join(", ")}` : ""}.`);
