// One month of the café's books (Vintage Café, HCM) for a Google Sheet, from the finance team's file "KT THU CHI VTDC HCM Tmm_yyyy.xlsx":
//   node scripts/cafe-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>
// Tabs: BK THU, BK CHI, QUỸ (cash / bank / card day by day), NGUYÊN LIỆU and VẬT TƯ (kho, same template as the hotels), Danh mục chi, HƯỚNG DẪN.
// The numbers are checked against the finance file's own totals at the end; a difference stops the script.
import fs from "node:fs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { buildStockFile } from "../src/lib/inventory-template.ts";

const [src, mmArg, yyyyArg, out] = process.argv.slice(2);
if (!src || !mmArg || !yyyyArg || !out) throw new Error('usage: node scripts/cafe-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>');
const MM = Number(mmArg), YYYY = Number(yyyyArg), TAG = `${String(MM).padStart(2, "0")}-${YYYY}`;

const wb = XLSX.read(fs.readFileSync(src));
const rows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
const num = (v) => (typeof v === "number" ? v : 0);
const toDate = (serial) => new Date(Date.UTC(1899, 11, 30) + serial * 864e5);
const day = (d) => new Date(Date.UTC(YYYY, MM - 1, d));
const problems = []; // what the finance team should look at, printed at the end

// ---------- styles (same palette as the hotel templates) ----------
const NAVY = "1F3A5F";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const head = (c, color = NAVY) => { c.fill = fill(color); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = BORDER; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };
const input = (c) => { c.fill = fill("FEF3C7"); c.border = BORDER; };
const RED = { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFECACA" } }, font: { bold: true, color: { argb: "FFB91C1C" } } };
const title = (ws, text, note) => {
  ws.getCell("A1").value = text; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  if (note) { ws.getCell("A2").value = note; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } }; }
};

// ---------- THU: "Chi tiết thu", one line per date, from the first dated line ----------
const thuSrc = rows("Chi tiết thu");
const thu = [];
for (let i = 14; i < thuSrc.length; i++) {
  const r = thuSrc[i];
  const dated = typeof r[0] === "number";
  if (!dated && !r[1]) continue;
  if (r[1] === "Tồn đầu") continue;
  thu.push({ date: dated ? r[0] : null, text: r[1], v: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => num(r[c])), note: r[13] });
}
const THU_COLS = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
const thuTotals = THU_COLS.map((_, k) => thu.reduce((s, x) => s + x.v[k], 0));

// ---------- CHI: "Chi tiết Chi" ----------
const chiSrc = rows("Chi tiết Chi");
const chi = [];
let lastDate = null;
for (let i = 13; i < chiSrc.length; i++) {
  const r = chiSrc[i];
  const amounts = [num(r[4]), num(r[5]), num(r[6])];
  if (typeof r[0] === "number") lastDate = r[0];
  if (!r[3] && !r[1]) continue;                       // a total line or an empty one
  if (amounts.every((a) => a === 0)) continue;
  if (typeof r[0] !== "number") problems.push(`BK CHI dòng nguồn ${i + 1} "${r[3]}": không có ngày, tính cùng ngày với dòng trên (${lastDate ? toDate(lastDate).toISOString().slice(0, 10) : "?"}); bảng tuần của kế toán không cộng dòng này.`);
  chi.push({ date: typeof r[0] === "number" ? r[0] : lastDate, cat: String(r[1]).trim(), who: String(r[2]).trim(), note: String(r[3]).trim(), amounts, src: i + 1 });
}
const FIXES = { "Chi tiền điên nước": "Chi tiền điện nước" };               // typo in the finance team's list
for (const x of chi) x.cat = FIXES[x.cat] ?? x.cat;
// lines the finance team left without a category: the category of the same item earlier in the file, else a guess (marked orange)
const GUESS = { "bình kem": "Chi mua CC DC", "nước lâu kính": "Chi bao bì, vật tư", "bánh hạnh nhân": "Chi mua hàng hóa", "trà cozy olong và trà đào": "Chi mua NL CF" };
const seen = new Map();
for (const x of chi) if (x.cat) { const k = x.note.toLowerCase(); (seen.get(k) ?? seen.set(k, []).get(k)).push(x.cat); }
const mode = (list) => [...list.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0];
for (const x of chi) {
  if (x.cat) continue;
  const k = x.note.toLowerCase();
  x.cat = seen.has(k) ? mode(seen.get(k)) : GUESS[k] ?? "";
  x.guess = true;
  problems.push(`BK CHI dòng nguồn ${x.src} "${x.note}": kế toán để trống hạng mục, tạm điền "${x.cat}" (ô màu cam).`);
}
for (const x of chi) if (x.cat === "Chi mua TSCĐ" && /phí quẹt thẻ/i.test(x.note)) { x.cat = "Phí quẹt thẻ"; x.guess = true; problems.push(`BK CHI dòng nguồn ${x.src}: "Phí quẹt thẻ" đang ở hạng mục Chi mua TSCĐ, đã đổi sang Phí quẹt thẻ (ô màu cam).`); }
const chiTotals = [0, 1, 2].map((k) => chi.reduce((s, x) => s + x.amounts[k], 0));

const CATEGORIES = ["Chi mua TSCĐ", "Chi mua CC DC", "Chi sửa chữa", "Chi Bảo dưỡng", "Chi Sự kiện", "Chi bao bì, vật tư", "Chi khác", "Phí quẹt thẻ", "Chi mua NL CF", "Chi mua hàng hóa", "Chi lương NV", "Chi thưởng NV", "Chi ứng lương NV", "Chi quà tết", "Chi phúc lợi", "Chi nộp BHXH", "Chi du lịch", "Chi tiền điện nước", "Chi Maketing", "Luân chuyển tiền", "Chi quản lý, vận hành", "Chi dịch vụ ngoài"];
for (const x of chi) if (!CATEGORIES.includes(x.cat)) problems.push(`BK CHI dòng nguồn ${x.src}: hạng mục "${x.cat}" không có trong Danh mục chi.`);

// ---------- KHO ----------
const th = rows("BK hàng hóa TH"), vt = rows("BK vật tư"), mua = rows("BK hàng hóa mua vào"), xuat = rows("Bảng kê xuất kho");
const kkNL = rows("Bảng kiểm kê NL"), kkVT = rows("Bảng kiểm kê VT");
const byName = (list, first, nameCol) => new Map(list.slice(first).filter((r) => r[nameCol]).map((r) => [String(r[nameCol]).trim(), r]));
const muaBy = byName(mua.slice(0, 100), 5, 1), xuatBy = byName(xuat.slice(0, 100), 4, 1);
const kkDates = (hdr) => hdr.map((h, i) => { const m = /Tuần\s*(\d+)/.exec(String(h)); return m ? { i, week: Number(m[1]) } : null; }).filter(Boolean);

function khoOf(sheetName, bk, kk, firstRow, lastRow, kind) {
  const items = [], nhap = [], xuatRows = [], kiem = [];
  const kkHead = kk[2], kkCols = kkDates(kkHead), kkBy = byName(kk, 4, 1);
  // ISO week w: its Sunday is the Monday of week w + 6 days
  const sunday = (w) => { const jan4 = new Date(Date.UTC(YYYY, 0, 4)); const monday1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5); return new Date(monday1.getTime() + ((w - 1) * 7 + 6) * 864e5); };
  for (let i = firstRow; i <= lastRow; i++) {
    const r = bk[i]; const name = String(r[2]).trim();
    if (!name) continue;
    const m = muaBy.get(name), x = xuatBy.get(name);
    if (!m || !x) { problems.push(`${sheetName}: "${name}" không có trong bảng kê nhập hoặc xuất.`); continue; }
    items.push({ name, kind, unit: String(r[3]).trim(), openQty: num(r[4]), openValue: num(r[5]) });
    // receipts by day, then what the day columns miss against the item's own "Tổng"
    let dq = 0, dv = 0;
    for (let d = 1; d <= 31; d++) {
      const q = num(m[5 + 2 * (d - 1)]), v = num(m[6 + 2 * (d - 1)]);
      if (q || v) nhap.push([day(d), name, q, v, ""]);
      dq += q; dv += v;
    }
    const rq = num(m[3]) - dq, rv = num(m[4]) - dv;
    if (rq || rv) nhap.push([day(1), name, rq, rv, "Chưa có ngày trong bảng kê của kế toán"]);
    let xq = 0;
    for (let d = 1; d <= 31; d++) { const q = num(x[4 + (d - 1)]); if (q) xuatRows.push([day(d), "", name, q, ""]); xq += q; }
    const rx = num(x[3]) - xq;
    if (rx) { xuatRows.push([day(MM === 2 ? 28 : 30), "", name, rx, "Điều chỉnh theo bảng kê của kế toán"]); problems.push(`${sheetName}: "${name}" xuất ${num(x[3])} theo Tổng nhưng các ngày chỉ cộng ${xq}; đã thêm dòng điều chỉnh ${rx}.`); }
    const k = kkBy.get(name);
    if (k) for (const c of kkCols) if (typeof k[c.i] === "number") kiem.push([sunday(c.week), name, k[c.i], `Tuần ${c.week}`]);
  }
  return { items, nhap, xuat: xuatRows, kiem };
}
const NL = khoOf("NGUYÊN LIỆU", th, kkNL, 5, 56, "Nguyên liệu");
const VT = khoOf("VẬT TƯ", vt, kkVT, 5, 39, "Vật tư");

// closing stock of every item by the template's own rule, against the finance team's "bảng kê"
function checkKho(label, kho, bk, firstRow) {
  let diff = 0;
  for (const it of kho.items) {
    const r = bk.slice(firstRow).find((x) => String(x[2]).trim() === it.name);
    const inQ = kho.nhap.filter((n) => n[1] === it.name).reduce((s, n) => s + n[2], 0), inV = kho.nhap.filter((n) => n[1] === it.name).reduce((s, n) => s + n[3], 0);
    const outQ = kho.xuat.filter((n) => n[2] === it.name).reduce((s, n) => s + n[3], 0);
    const closeQ = it.openQty + inQ - outQ;
    if (Math.abs(closeQ - num(r[10])) > 1e-6) { diff++; problems.push(`${label}: "${it.name}" tồn cuối SL ${closeQ} khác bảng kê của kế toán ${num(r[10])}.`); }
  }
  return diff;
}
checkKho("NGUYÊN LIỆU", NL, th, 5); checkKho("VẬT TƯ", VT, vt, 5);

// ---------- the workbook ----------
const book = new ExcelJS.Workbook();
book.calcProperties.fullCalcOnLoad = true;

// HƯỚNG DẪN
{
  const ws = book.addWorksheet("HƯỚNG DẪN");
  title(ws, "VINTAGE CAFÉ HCM — SỔ THU CHI VÀ KHO", `Tháng ${String(MM).padStart(2, "0")}/${YYYY}. Ô vàng là ô nhập tay; các ô còn lại tự tính.`);
  const lines = [
    ["BK THU", "Mỗi ngày một dòng: tiền mặt, chuyển khoản, thẻ của khách (lấy từ sổ quỹ KiotViet). Tiền vốn góp hoặc luân chuyển vào quỹ ghi ở nhóm NGUỒN KHÁC, không phải doanh thu."],
    ["", "Đơn Shopee / Grab / Be: ghi doanh thu đơn vào cột 'Chưa nhận'; khi app chuyển tiền thì ghi vào cột 'Đã nhận (CK)'. Cuối dòng 'Cộng' cho thấy app còn nợ bao nhiêu."],
    ["BK CHI", "Mỗi khoản chi một dòng: ngày, hạng mục (chọn trong danh sách), người chi, ghi chú, rồi số tiền ở đúng cột Tiền mặt / Tài khoản / Thẻ. 'Luân chuyển tiền' không phải chi phí."],
    ["QUỸ", "Tự cộng thu và chi theo ngày cho ba quỹ: tiền mặt, tài khoản ngân hàng, thẻ. Nhập tồn đầu tháng (ô vàng dòng 6) và số thực tế đếm được; cột Chênh chuyển đỏ khi lệch."],
    ["NGUYÊN LIỆU, VẬT TƯ", "Ba bảng bên trái: NHẬP KHO, XUẤT KHO (cột Phòng để trống), KIỂM KÊ. Bảng TỒN KHO từ cột R tự tính cho tháng ở ô S2: tồn đầu nhập tay, đơn giá là bình quân gia quyền."],
    ["Sang tháng mới", "Sao chép các tab BK THU, BK CHI, QUỸ, NGUYÊN LIỆU, VẬT TƯ rồi đổi đuôi tên tab thành tháng mới (ví dụ 11-2026), xóa dữ liệu cũ và đổi ngày ở ô B2 của QUỸ, ô S2 của hai tab kho."],
  ];
  lines.forEach(([a, b], i) => { ws.getCell(4 + i, 1).value = a; ws.getCell(4 + i, 1).font = { bold: true }; ws.getCell(4 + i, 2).value = b; ws.getCell(4 + i, 2).alignment = { wrapText: true, vertical: "top" }; ws.getCell(4 + i, 1).alignment = { vertical: "top" }; });
  ws.getColumn(1).width = 24; ws.getColumn(2).width = 110;
}

// BK THU
const THU_FIRST = 5, THU_LAST = 304;
{
  const ws = book.addWorksheet(`BK THU ${TAG}`, { views: [{ state: "frozen", ySplit: 4, xSplit: 2 }] });
  title(ws, `BK THU THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`); ws.getCell("A2").value = "Ô vàng nhập tay; cột Doanh thu tự tính = khách trực tiếp + đơn app. Tổng cả tháng ở dòng này."; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } };
  const groups = [[3, 4, "NGUỒN KHÁC (không phải doanh thu)", "B45309"], [5, 7, "KHÁCH TRỰC TIẾP", "15803D"], [8, 9, "SHOPEE FOOD", "1D4ED8"], [10, 11, "GRAB FOOD", "1D4ED8"], [12, 13, "BE FOOD", "1D4ED8"]];
  for (const [a, b, t, col] of groups) { ws.mergeCells(3, a, 3, b); ws.getCell(3, a).value = t; head(ws.getCell(3, a), col); for (let c = a; c <= b; c++) head(ws.getCell(3, c), col); }
  const heads = ["Ngày", "Nội dung", "Tiền mặt", "Chuyển khoản", "Tiền mặt", "Chuyển khoản", "Thẻ", "Chưa nhận", "Đã nhận (CK)", "Chưa nhận", "Đã nhận (CK)", "Chưa nhận", "Đã nhận (CK)", "Doanh thu", "Ghi chú"];
  const widths = [13, 26, 14, 14, 14, 14, 13, 13, 14, 13, 14, 13, 14, 15, 28];
  heads.forEach((h, i) => { const c = ws.getCell(4, i + 1); c.value = h; head(c); ws.getColumn(i + 1).width = widths[i]; });
  ws.getRow(4).height = 30;
  const rowOf = (k) => THU_FIRST + k;
  for (let r = THU_FIRST; r <= THU_LAST; r++) {
    for (let c = 1; c <= 15; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c >= 3 && c <= 13) { cell.numFmt = "#,##0;-#,##0;"; } }
    for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]) input(ws.getCell(r, c));
    ws.getCell(r, 1).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 14).value = { formula: `IF(A${r}="","",E${r}+F${r}+G${r}+H${r}+J${r}+L${r})`, result: 0 };
    ws.getCell(r, 14).numFmt = "#,##0;-#,##0;0";
  }
  thu.forEach((x, k) => {
    const r = rowOf(k);
    if (x.date) ws.getCell(r, 1).value = toDate(x.date);
    if (x.text) ws.getCell(r, 2).value = x.text;
    x.v.forEach((v, j) => { if (v) ws.getCell(r, 3 + j).value = v; });
    if (x.note) ws.getCell(r, 15).value = x.note;
  });
  ws.mergeCells("A3:B3"); head(ws.getCell("A3")); head(ws.getCell("B3")); ws.getCell("A3").value = "NGÀY, NỘI DUNG";
  ws.getCell("B2").value = "Cộng cả tháng"; ws.getCell("B2").font = { bold: true }; ws.getCell("B2").alignment = { horizontal: "right" };
  for (let c = 3; c <= 14; c++) {
    const L = ws.getColumn(c).letter, cell = ws.getCell(2, c);
    cell.value = { formula: `SUM(${L}${THU_FIRST}:${L}${THU_LAST})`, result: 0 }; cell.font = { bold: true }; cell.numFmt = "#,##0;-#,##0;0"; cell.border = BORDER; cell.fill = fill("E8EEF6");
  }
}

// BK CHI
const CHI_FIRST = 5, CHI_LAST = 604;
{
  const ws = book.addWorksheet(`BK CHI ${TAG}`, { views: [{ state: "frozen", ySplit: 4 }] });
  title(ws, `BK CHI THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`);
  const heads = ["Ngày", "Hạng mục", "Người chi", "Ghi chú", "Tiền mặt", "Tài khoản", "Thẻ", "Tổng"];
  const widths = [13, 24, 12, 38, 14, 14, 14, 15];
  heads.forEach((h, i) => { const c = ws.getCell(4, i + 1); c.value = h; head(c, i >= 4 && i <= 6 ? "B91C1C" : NAVY); ws.getColumn(i + 1).width = widths[i]; });
  ws.getCell("D2").value = "Cộng cả tháng"; ws.getCell("D2").font = { bold: true }; ws.getCell("D2").alignment = { horizontal: "right" };
  for (const L of ["E", "F", "G", "H"]) { const cell = ws.getCell(`${L}2`); cell.value = { formula: `SUM(${L}${CHI_FIRST}:${L}${CHI_LAST})`, result: 0 }; cell.font = { bold: true }; cell.numFmt = "#,##0;-#,##0;0"; cell.border = BORDER; cell.fill = fill("E8EEF6"); }
  for (let r = CHI_FIRST; r <= CHI_LAST; r++) {
    for (let c = 1; c <= 8; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c <= 7) input(cell); if (c >= 5) cell.numFmt = "#,##0;-#,##0;"; }
    ws.getCell(r, 1).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 8).value = { formula: `IF(A${r}="","",E${r}+F${r}+G${r})`, result: 0 }; ws.getCell(r, 8).numFmt = "#,##0;-#,##0;0";
    ws.getCell(r, 2).dataValidation = { type: "list", allowBlank: true, formulae: [`'Danh mục chi'!$A$2:$A$40`], showErrorMessage: true, errorStyle: "warning", errorTitle: "Hạng mục", error: "Hạng mục không có trong tab Danh mục chi." };
    ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: ['"Trang,Giang"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "Người chi", error: "Người chi chưa có trong danh sách (Trang, Giang)." };
  }
  chi.forEach((x, k) => {
    const r = CHI_FIRST + k;
    if (x.date) ws.getCell(r, 1).value = toDate(x.date);
    ws.getCell(r, 2).value = x.cat; if (x.who) ws.getCell(r, 3).value = x.who; ws.getCell(r, 4).value = x.note;
    x.amounts.forEach((a, j) => { if (a) ws.getCell(r, 5 + j).value = a; });
    if (x.guess) ws.getCell(r, 2).fill = fill("FDBA74");
  });
}

// QUỸ: cash / bank / card by day, from the two tabs above
{
  const ws = book.addWorksheet(`QUỸ ${TAG}`, { views: [{ state: "frozen", ySplit: 5, xSplit: 1 }] });
  title(ws, `QUỸ THÁNG ${String(MM).padStart(2, "0")}/${YYYY} — TIỀN MẶT, TÀI KHOẢN, THẺ`, "Tự cộng từ BK THU và BK CHI cùng tháng. Nhập tồn đầu tháng ở dòng 6 và số thực tế (đếm tiền mặt, sao kê ngân hàng, sao kê thẻ) ở cột 'Thực tế'.");
  ws.getColumn(17).hidden = true; ws.getColumn(18).hidden = true;
  ws.getCell("A3").value = "Tháng"; ws.getCell("A3").font = { bold: true };
  ws.getCell("B3").value = day(1); ws.getCell("B3").numFmt = "mm/yyyy"; input(ws.getCell("B3"));
  // Q1, R1: the tab prefixes the day formulas read (hidden)
  ws.getCell("Q1").value = { formula: `"'BK THU "&RIGHT("0"&MONTH($B$3),2)&"-"&YEAR($B$3)&"'!"`, result: "" };
  ws.getCell("R1").value = { formula: `"'BK CHI "&RIGHT("0"&MONTH($B$3),2)&"-"&YEAR($B$3)&"'!"`, result: "" };
  const funds = [
    { name: "TIỀN MẶT", color: "15803D", c0: 2, thu: [["C"], ["E"]], chi: "E" },
    { name: "TÀI KHOẢN NGÂN HÀNG", color: "1D4ED8", c0: 7, thu: [["D"], ["F"], ["I"], ["K"], ["M"]], chi: "F" },
    { name: "TÀI KHOẢN THẺ", color: "B45309", c0: 12, thu: [["G"]], chi: "G" },
  ];
  const A = (sheet, col, first, last) => `INDIRECT(${sheet}&"$${col}$${first}:$${col}$${last}")`;
  head(ws.getCell("A4")); ws.getCell("A5").value = "Ngày"; head(ws.getCell("A5"));
  ws.getColumn(1).width = 13;
  const FIRST = 7, LAST = FIRST + 30; // row 6 holds the opening balances
  for (const f of funds) {
    ws.mergeCells(4, f.c0, 4, f.c0 + 4); ws.getCell(4, f.c0).value = f.name; for (let c = f.c0; c < f.c0 + 5; c++) head(ws.getCell(4, c), f.color);
    ["Thu", "Chi", "Số dư theo bảng kê", "Thực tế", "Chênh"].forEach((h, i) => { const c = ws.getCell(5, f.c0 + i); c.value = h; head(c, f.color); ws.getColumn(f.c0 + i).width = i === 2 ? 17 : 14; });
    const [thuC, chiC, balC, realC, difC] = [0, 1, 2, 3, 4].map((i) => ws.getColumn(f.c0 + i).letter);
    // opening balance: typed
    ws.getCell(`${balC}${FIRST - 1}`).value = 0; input(ws.getCell(`${balC}${FIRST - 1}`)); ws.getCell(`${balC}${FIRST - 1}`).numFmt = "#,##0;-#,##0;0";
    const dateRange = (sheet, col) => A(sheet, col, THU_FIRST, THU_LAST);
    for (let r = FIRST; r <= LAST; r++) {
      const thuSum = f.thu.map(([col]) => `SUMIFS(${A("$Q$1", col, THU_FIRST, THU_LAST)},${A("$Q$1", "A", THU_FIRST, THU_LAST)},$A${r})`).join("+");
      ws.getCell(`${thuC}${r}`).value = { formula: `IF($A${r}="","",IFERROR(${thuSum},0))`, result: 0 };
      ws.getCell(`${chiC}${r}`).value = { formula: `IF($A${r}="","",IFERROR(SUMIFS(${A("$R$1", f.chi, CHI_FIRST, CHI_LAST)},${A("$R$1", "A", CHI_FIRST, CHI_LAST)},$A${r}),0))`, result: 0 };
      ws.getCell(`${balC}${r}`).value = { formula: `IF($A${r}="","",${balC}${r - 1}+${thuC}${r}-${chiC}${r})`, result: 0 };
      ws.getCell(`${difC}${r}`).value = { formula: `IF(OR($A${r}="",${realC}${r}=""),"",${realC}${r}-${balC}${r})`, result: "" };
      for (let i = 0; i < 5; i++) { const cell = ws.getCell(r, f.c0 + i); cell.border = BORDER; cell.numFmt = "#,##0;-#,##0;0"; }
      input(ws.getCell(`${realC}${r}`));
    }
    const t = LAST + 1;
    ws.getCell(`${thuC}${t}`).value = { formula: `SUM(${thuC}${FIRST}:${thuC}${LAST})`, result: 0 };
    ws.getCell(`${chiC}${t}`).value = { formula: `SUM(${chiC}${FIRST}:${chiC}${LAST})`, result: 0 };
    ws.getCell(`${balC}${t}`).value = { formula: `${balC}${FIRST - 1}+${thuC}${t}-${chiC}${t}`, result: 0 };
    for (let i = 0; i < 5; i++) { const cell = ws.getCell(t, f.c0 + i); cell.font = { bold: true }; cell.border = BORDER; cell.numFmt = "#,##0;-#,##0;0"; }
    ws.addConditionalFormatting({ ref: `${difC}${FIRST}:${difC}${LAST}`, rules: [{ type: "expression", priority: 1, formulae: [`AND(${difC}${FIRST}<>"",ABS(${difC}${FIRST})>0)`], style: RED }] });
  }
  ws.getCell(`A${FIRST - 1}`).value = "Tồn đầu tháng"; ws.getCell(`A${FIRST - 1}`).font = { bold: true };
  for (let r = FIRST; r <= LAST; r++) {
    ws.getCell(`A${r}`).value = { formula: `IF(DAY($B$3+${r - FIRST})>=${r - FIRST + 1},IF(MONTH($B$3+${r - FIRST})=MONTH($B$3),$B$3+${r - FIRST},""),"")`, result: "" };
    ws.getCell(`A${r}`).numFmt = "dd/mm/yyyy"; ws.getCell(`A${r}`).border = BORDER;
  }
  ws.getCell(`A${LAST + 1}`).value = "Cộng tháng, số dư cuối"; ws.getCell(`A${LAST + 1}`).font = { bold: true };
  ws.getColumn(1).width = 22;
}

// kho tabs, same template as the hotels
const stock = buildStockFile([
  { sheet: `NGUYÊN LIỆU ${TAG}`, title: "NGUYÊN LIỆU", items: NL.items },
  { sheet: `VẬT TƯ ${TAG}`, title: "VẬT TƯ", items: VT.items },
], `${String(MM).padStart(2, "0")}/${YYYY}`, book);
const fillKho = (sheet, kho) => {
  const ws = stock.getWorksheet(sheet);
  const put = (col, list) => list.forEach((row, k) => row.forEach((v, j) => { if (v !== "" && v != null) ws.getCell(5 + k, col + j).value = v; }));
  put(1, kho.nhap); put(7, kho.xuat); put(13, kho.kiem);
};
fillKho(`NGUYÊN LIỆU ${TAG}`, NL); fillKho(`VẬT TƯ ${TAG}`, VT);

// Danh mục chi
{
  const ws = book.addWorksheet("Danh mục chi");
  ws.getCell("A1").value = "Hạng mục chi"; head(ws.getCell("A1")); ws.getColumn(1).width = 28;
  CATEGORIES.forEach((c, i) => { ws.getCell(2 + i, 1).value = c; ws.getCell(2 + i, 1).border = BORDER; });
}

// ---------- self-check against the finance file's totals ----------
const chiEq = [17459500 + 140000, 42520494, 43622734]; // her weekly table misses the one undated cash line (140,000)
const thuEq = [25000000, 35000000, 10326900, 22939910, 2686200, 0, 0, 0, 0, 0, 0];
thuEq.forEach((v, k) => { if (thuTotals[k] !== v) throw new Error(`THU cột ${THU_COLS[k]}: ${thuTotals[k]} khác tổng của kế toán ${v}`); });
chiEq.forEach((v, k) => { if (chiTotals[k] !== v) problems.push(`BK CHI cột ${["tiền mặt", "tài khoản", "thẻ"][k]}: cộng ${chiTotals[k]} khác tổng bảng tuần của kế toán ${v}.`); });
await book.xlsx.writeFile(out);
console.log("THU", thuTotals.slice(0, 5), "dòng", thu.length);
console.log("CHI", chiTotals, "dòng", chi.length);
console.log("NL", NL.items.length, "mặt hàng", NL.nhap.length, "nhập", NL.xuat.length, "xuất", NL.kiem.length, "kiểm kê");
console.log("VT", VT.items.length, "mặt hàng", VT.nhap.length, "nhập", VT.xuat.length, "xuất", VT.kiem.length, "kiểm kê");
console.log("VẤN ĐỀ:\n" + (problems.join("\n") || "không"));
