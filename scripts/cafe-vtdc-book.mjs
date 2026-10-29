// One month of the books of VTDC HCM (a cafe with no hotel) in the Sơn Trà layout (BK THU, BK CHI, kho tabs, one Hướng dẫn, one Danh mục), from the finance team's file "KT THU CHI VTDC HCM T10_2026.xlsx" (tabs Chi tiết thu, Chi tiết Chi, BK hàng hóa TH, BK vật tư, mua vào, xuất kho, kiểm kê).
//   node scripts/cafe-vtdc-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>
// Figures are copied as the finance team typed them; every total is checked against the file and what differs is printed at the end.
import fs from "node:fs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { buildStockFile } from "../src/lib/inventory-template.ts";
import { FNB_EXPENSES } from "../src/lib/expense-kinds.ts";

const [src, mmArg, yyyyArg, out, qlPath] = process.argv.slice(2);
if (!src || !mmArg || !yyyyArg || !out) throw new Error('usage: node scripts/cafe-vtdc-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx> ["<management file>"]');
const MM = Number(mmArg), YYYY = Number(yyyyArg), TAG = `${String(MM).padStart(2, "0")}-${YYYY}`;
const UNIT = "VTDC HCM";

const wb = XLSX.read(fs.readFileSync(src));
const rows = (name) => { if (!wb.Sheets[name]) throw new Error(`Không thấy tab “${name}” trong file nguồn.`); return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }); };
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v) => String(v ?? "").trim();
const toDate = (serial) => new Date(Date.UTC(1899, 11, 30) + serial * 864e5);
const day = (d) => new Date(Date.UTC(YYYY, MM - 1, d));
const inMonth = (serial) => { const d = toDate(serial); return d.getUTCFullYear() === YYYY && d.getUTCMonth() === MM - 1; };
const problems = [];

// ---------- styles: the Sơn Trà house style ----------
const NAVY = "1F3A5F", GREEN = "15803D", ORANGE = "C2570C", RED = "B91C1C", GREY = "475569", BLUE = "1D4ED8", INPUT = "FEF3C7", BAND = "F4F7FB";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } }, BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const font = (o = {}) => ({ name: "Calibri", size: 11, color: { argb: "FF000000" }, ...o });
const NOFILL = { type: "pattern", pattern: "none" };
// whole style at once: setting the parts one by one writes into a style object shared by cells of the same column
const put = (cell, { f = font(), fl = null, al = { vertical: "middle" }, fmt = null, bd = null } = {}) => { cell.style = { font: f, fill: fl ?? NOFILL, alignment: al, numFmt: fmt ?? "General", border: bd ?? {} }; };
const title = (cell) => put(cell, { f: font({ bold: true, size: 14, color: { argb: `FF${NAVY}` } }), al: { horizontal: "left", vertical: "middle" } });
const label = (cell, wrap = false) => put(cell, { f: font({ bold: true, color: { argb: `FF${NAVY}` } }), al: { horizontal: "right", vertical: "middle", wrapText: wrap } });
const input = (cell, fmt = null) => put(cell, { f: font({ bold: true }), fl: fill(INPUT), al: { horizontal: "left", vertical: "middle" }, fmt, bd: BORDER });
const head = (cell, color) => put(cell, { f: font({ bold: true, color: { argb: "FFFFFFFF" } }), fl: fill(color), al: { horizontal: "center", vertical: "middle", wrapText: true }, bd: BORDER });
const warn = (formula, what) => ({ type: "list", allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: "warning", errorTitle: what, error: `Giá trị ngoài danh sách ${what}. Vẫn có thể giữ.` });
const MONEY = "#,##0;-#,##0;0";
const FIRST = 4, LAST = 503; // BK THU and BK CHI: data rows, like the hotels' tabs


// ---------- the finance team's tabs ----------
// "Chi tiết thu": from row 15; A date, B text, C D other sources (cash, bank), E F G direct guests (cash, bank, card), H I Shopee (chưa TT, banking), J K Grab (chưa TT, banking), L M Be Food (ID, banking), N note.
// Chưa TT is what the app still owes (+), Banking what it paid (−): the same as the + / − of the Công nợ columns of BK THU. Be Food (banking only, no Chưa TT column) has its own column O in this branch's BK THU.
const thuSrc = rows("Chi tiết thu"), chiSrc = rows("Chi tiết Chi");
const thu = [];
for (let i = 14; i < Math.min(thuSrc.length, 400); i++) {
  const r = thuSrc[i];
  if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].some((c) => r[c] !== "")) continue;
  const shopee = num(r[7]) - num(r[8]), be = -num(r[12]), grab = num(r[9]) - num(r[10]);
  const notes = [text(r[13])];
  thu.push({ src: i + 1, date: typeof r[0] === "number" ? r[0] : null, who: "", note: text(r[1]), v: [2, 3, 4, 5, 6].map((c) => num(r[c])), shopeeId: "", shopee, grabId: "", grab, be, remark: notes.filter(Boolean).join("; ") });
}
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
for (const x of thu) {
  if (x.date && !inMonth(x.date)) problems.push(`Chi tiết thu dòng nguồn ${x.src}: ngày ${toDate(x.date).toISOString().slice(0, 10)} nằm ngoài tháng ${MM}/${YYYY}.`);
  if (!x.date && (x.v.some(Boolean) || x.shopee || x.grab)) problems.push(`Chi tiết thu dòng nguồn ${x.src}: có tiền nhưng không có ngày (ô ngày để trống).`);
}
// the finance file's own totals (row 13) against what the lines add up to
const own = { other: [num(thuSrc[12][2]), num(thuSrc[12][3])], direct: [num(thuSrc[12][4]), num(thuSrc[12][5]), num(thuSrc[12][6])], shopee: num(thuSrc[12][7]) - num(thuSrc[12][8]), grab: num(thuSrc[12][9]) - num(thuSrc[12][10]), be: -num(thuSrc[12][12]) };
const mine = { other: [sum(thu, (x) => x.v[0]), sum(thu, (x) => x.v[1])], direct: [sum(thu, (x) => x.v[2]), sum(thu, (x) => x.v[3]), sum(thu, (x) => x.v[4])], shopee: sum(thu, (x) => x.shopee), grab: sum(thu, (x) => x.grab), be: sum(thu, (x) => x.be) };
mine.total = mine.direct[0] + mine.direct[1] + mine.direct[2];
own.other.forEach((v, k) => { if (v !== mine.other[k]) problems.push(`Chi tiết thu nguồn khác cột ${["tiền mặt", "banking"][k]}: cộng ${mine.other[k]} khác tổng của kế toán ${v}.`); });
own.direct.forEach((v, k) => { if (v !== mine.direct[k]) problems.push(`Chi tiết thu khách trực tiếp cột ${["tiền mặt", "banking", "thẻ"][k]}: cộng ${mine.direct[k]} khác tổng của kế toán ${v}.`); });
if (own.shopee !== mine.shopee) problems.push(`Chi tiết thu công nợ Shopee: cộng ${mine.shopee} khác tổng của kế toán ${own.shopee}.`);
if (own.grab !== mine.grab) problems.push(`Chi tiết thu công nợ Grab: cộng ${mine.grab} khác tổng của kế toán ${own.grab}.`);
if (own.be !== mine.be) problems.push(`Chi tiết thu công nợ Be Food: cộng ${mine.be} khác tổng của kế toán ${own.be}.`);
if (!sum(thu, (x) => (x.shopee > 0 ? x.shopee : 0)) && !sum(thu, (x) => (x.grab > 0 ? x.grab : 0))) problems.push(`Cột “Chưa TT” của Shopee, Grab trống cả tháng: file chỉ ghi tiền ứng dụng đã chuyển khoản (Shopee ${-mine.shopee}, Grab ${-mine.grab}, Be Food ${-mine.be}), không ghi đơn phát sinh. Nên công nợ ra số âm bằng đúng số tiền đã nhận, không phải ứng dụng nợ âm. Muốn công nợ đúng, kế toán ghi thêm đơn phát sinh (số dương) ở cột Công nợ.`);

let open = { cash: 0, bank: 0 };
if (qlPath) {
  const flow = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(qlPath)).Sheets["Dòng tiền BC"], { header: 1, defval: "" })[0];
  open = { cash: num(flow[7]), bank: num(flow[11]) + num(flow[15]) };
  problems.push(`Đầu kỳ lấy từ tab “Dòng tiền BC” dòng 1 của file quản lý: tiền mặt ${open.cash} (ô H1), ngân hàng ${open.bank} (VIB + TCB ô L1 = ${num(flow[11])}, TP Bank ô P1 = ${num(flow[15])}; BK THU chỉ có một quỹ ngân hàng nên cộng hai tài khoản).`);
} else problems.push("Đầu kỳ tiền mặt và ngân hàng (ô Q1, U1 của BK THU) để trống vì dòng “Tồn đầu” của file kế toán không có số; quỹ tiền mặt, ngân hàng theo ngày tính từ 0. Kế toán điền số dư đầu tháng vào hai ô vàng đó.");
// "Chi tiết Chi": from row 14; A date, B hạng mục, C người chi, D nội dung, E cash, F bank, G card. Lines with a hạng mục typed down the page and nothing else are not lines.
const chi = [];
for (let i = 13; i < Math.min(chiSrc.length, 400); i++) {
  const r = chiSrc[i], cash = num(r[4]), bank = num(r[5]), card = num(r[6]);
  if (!text(r[3]) && !cash && !bank && !card) continue;
  chi.push({ src: i + 1, date: typeof r[0] === "number" ? r[0] : null, cat: text(r[1]), who: text(r[2]), note: text(r[3]), cash, bank, card });
}
const chiOwn = { cash: num(chiSrc[11][4]), bank: num(chiSrc[11][5]), card: num(chiSrc[11][6]) };
const chiMine = { cash: sum(chi, (x) => x.cash), bank: sum(chi, (x) => x.bank), card: sum(chi, (x) => x.card) };
for (const [k, label] of [["cash", "tiền mặt"], ["bank", "tài khoản"], ["card", "thẻ"]]) if (chiOwn[k] !== chiMine[k]) problems.push(`Chi tiết Chi ${label}: cộng ${chiMine[k]} khác tổng của kế toán ${chiOwn[k]}.`);
for (const x of chi) {
  if (!x.date) problems.push(`Chi tiết Chi dòng nguồn ${x.src} "${x.note}": không có ngày.`);
  else if (!inMonth(x.date)) problems.push(`Chi tiết Chi dòng nguồn ${x.src}: ngày ${toDate(x.date).toISOString().slice(0, 10)} nằm ngoài tháng ${MM}/${YYYY}.`);
}
// the finance team's kinds of chi, as the F&B list of the dashboard names them
const KIND = {
  "Chi mua TSCĐ": "Chi đầu tư TSCĐ", "Chi mua CC DC": "Chi mua đồ dùng CCDC", "Chi sửa chữa": "Chi sửa chữa – Bảo dưỡng", "Chi Bảo dưỡng": "Chi sửa chữa – Bảo dưỡng", "Chi Sự kiện": "Chi Sự kiện - cây xanh",
  "Chi bao bì, vật tư": "Chi bao bì – Vật tư", "Chi khác": "Chi khác", "Phí quẹt thẻ": "Chi điện nước – Viễn thông, phí dv", "Chi mua NL CF": "Chi nguyên liệu pha chế", "Chi mua hàng hóa": "Chi mua hàng hóa",
  "Chi lương NV": "Chi nhân sự – BHXH – Phúc lợi", "Chi thưởng NV": "Chi nhân sự – BHXH – Phúc lợi", "Chi ứng lương NV": "Chi nhân sự – BHXH – Phúc lợi", "Chi quà tết": "Chi nhân sự – BHXH – Phúc lợi", "Chi phúc lợi": "Chi nhân sự – BHXH – Phúc lợi",
  "Chi nộp BHXH": "Chi nhân sự – BHXH – Phúc lợi", "Chi du lịch": "Chi nhân sự – BHXH – Phúc lợi", "Chi tiền điên nước": "Chi điện nước – Viễn thông, phí dv", "Chi Maketing": "Chi Marketing", "Luân chuyển tiền": "Chi rút tiền – Điều chuyển tiền",
  "Chi quản lý, vận hành": "Chi quản lý, Vận hành",
};
for (const x of chi) { const kind = KIND[x.cat]; if (!kind) problems.push(`Chi tiết Chi dòng nguồn ${x.src}: hạng mục "${x.cat}" chưa có tương ứng, để nguyên tên.`); x.kind = kind ?? x.cat; }
const cats = FNB_EXPENSES.map((e) => e[1]);
const guide = FNB_EXPENSES.map((e) => ({ name: e[1], desc: e[2] }));
const desc = (k) => guide[k]?.desc ?? "";

// ---------- kho: two summary tabs, receipts and issues by day in the tabs they read ----------
const mua = rows("BK hàng hóa mua vào"), xuat = rows("Bảng kê xuất kho");
const GROUPS = [
  { sheet: `NGUYÊN LIỆU CAFE ${TAG}`, title: "NGUYÊN LIỆU CAFE", kind: "Nguyên liệu cafe", tab: "BK hàng hóa TH", count: "Bảng kiểm kê NL" },
  { sheet: `VẬT TƯ ${TAG}`, title: "VẬT TƯ", kind: "Vật tư", tab: "BK vật tư", count: "Bảng kiểm kê VT" },
];
const plain = (s) => text(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ");
const same = (a, b) => plain(a).slice(0, 5) === plain(b).slice(0, 5);
const rowByName = (list, name, from, to) => { for (let i = from; i < to; i++) if (plain(list[i][1]) === plain(name)) return i + 1; for (let i = from; i < to; i++) if (text(list[i][1]) && same(list[i][1], name)) return i + 1; return null; };
// the count tab: weeks in the header (row 3), one row per item; a week typed twice in a row is the next week
const countOf = (list) => {
  let prev = 0;
  const weeks = list[2].map((h, i) => { const m = /Tuần\s*(\d+)/.exec(String(h)); if (!m) return null; const typed = Number(m[1]); let week = typed; if (typed === prev) { problems.push(`${text(h)} xuất hiện hai lần cạnh nhau ở đầu cột trong tab kiểm kê: cột thứ hai tính là tuần ${typed + 1}.`); week = typed + 1; } prev = typed; return { i, week }; }).filter(Boolean);
  const by = new Map(); list.slice(4).forEach((r) => { const n = text(r[1]); if (n) by.set(n, r); });
  return { weeks, by };
};
const sunday = (w) => { const jan4 = new Date(Date.UTC(YYYY, 0, 4)); const monday1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5); return new Date(monday1.getTime() + ((w - 1) * 7 + 6) * 864e5); };

const ex = new ExcelJS.Workbook(); await ex.xlsx.readFile(src);
const refRow = (ws, n, col) => { const m = /!\$?D\$?(\d+)/.exec(String(ws.getCell(n, col).formula ?? "")); return m ? Number(m[1]) : null; };
const used = { mua: new Set(), xuat: new Set() };
const khos = GROUPS.map((g) => {
  const bk = rows(g.tab), ws = ex.getWorksheet(g.tab), kk = countOf(rows(g.count));
  const items = [], nhap = [], xuatRows = [], kiem = [];
  for (let n = 6; n <= bk.length; n++) {
    const r = bk[n - 1], name = text(r[2]);
    if (!name) continue;
    items.push({ name, kind: g.kind, unit: text(r[3]), openQty: num(r[4]), openValue: num(r[5]) });
    // receipts: the row the finance formula reads (G), else the row with the item's name; the finance file's figure is the target
    let k = refRow(ws, n, 7), targetQ = num(r[6]), targetV = num(r[7]);
    if (k && !same(name, mua[k - 1][1])) {
      const k2 = rowByName(mua, name, 5, 250), q2 = k2 ? num(mua[k2 - 1][3]) : 0, v2 = k2 ? num(mua[k2 - 1][4]) : 0;
      problems.push(`${g.title}: dòng ${n} "${name}" lấy số nhập từ dòng ${k} của tab "mua vào" là "${text(mua[k - 1][1])}" (công thức lệch dòng): kế toán ghi nhập ${targetQ} (tiền ${targetV}), dòng đúng của "${name}" là dòng ${k2 ?? "?"} với ${q2} (tiền ${v2}); đã lấy số của dòng đúng.`);
      k = k2; targetQ = q2; targetV = v2;
    }
    let dq = 0, dv = 0;
    if (k) {
      used.mua.add(k);
      for (let d = 1; d <= 31; d++) { const q = num(mua[k - 1][5 + 2 * (d - 1)]), v = num(mua[k - 1][6 + 2 * (d - 1)]); if (q || v) nhap.push([day(d), name, q, v, ""]); dq += q; dv += v; }
    }
    const rq = targetQ - dq, rv = targetV - dv;
    if (Math.abs(rq) > 1e-9 || Math.abs(rv) > 1e-9) { nhap.push([day(1), name, rq, rv, "Chưa có ngày trong bảng kê của kế toán"]); problems.push(`${g.title}: "${name}" nhập ${targetQ} (tiền ${targetV}) nhưng các ngày chỉ cộng ${dq} (${dv}); thêm dòng điều chỉnh ngày 01.`); }
    // issues
    let j = refRow(ws, n, 9), targetX = num(r[8]);
    if (j && !same(name, xuat[j - 1][1])) {
      const j2 = rowByName(xuat, name, 4, 250), x2 = j2 ? num(xuat[j2 - 1][3]) : 0;
      problems.push(`${g.title}: dòng ${n} "${name}" lấy số xuất từ dòng ${j} của tab "xuất kho" là "${text(xuat[j - 1][1])}" (công thức lệch dòng): kế toán ghi xuất ${targetX}, dòng đúng của "${name}" là dòng ${j2 ?? "?"} với ${x2}; đã lấy số của dòng đúng.`);
      j = j2; targetX = x2;
    }
    let xq = 0;
    if (j) { used.xuat.add(j); for (let d = 1; d <= 31; d++) { const q = num(xuat[j - 1][4 + (d - 1)]); if (q) xuatRows.push([day(d), "", name, q, ""]); xq += q; } }
    const rx = targetX - xq;
    if (Math.abs(rx) > 1e-9) { xuatRows.push([day(new Date(Date.UTC(YYYY, MM, 0)).getUTCDate()), "", name, rx, "Điều chỉnh theo bảng kê của kế toán"]); problems.push(`${g.title}: "${name}" xuất ${targetX} nhưng các ngày chỉ cộng ${xq}; thêm dòng điều chỉnh cuối tháng.`); }
    const kr = kk.by.get(name);
    if (kr) for (const c of kk.weeks) if (typeof kr[c.i] === "number") { const d = sunday(c.week); if (d.getUTCMonth() === MM - 1 && d.getUTCFullYear() === YYYY) kiem.push([d, name, kr[c.i], `Tuần ${c.week}`]); }
  }
  const dup = items.map((i) => i.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dup.length) problems.push(`${g.title}: tên trùng trong bảng kê kho: ${[...new Set(dup)].join(", ")}.`);
  return { ...g, items, nhap, xuat: xuatRows, kiem, bk };
});
// (errored is filled by the closing check below and reported after it)
// rows of the receipts and issues tabs that no item reads, with a quantity in them
mua.slice(5, 250).forEach((r, i) => { const row = i + 6; if (!used.mua.has(row) && text(r[1]) && (num(r[3]) || num(r[4]))) problems.push(`Tab "mua vào" dòng ${row} "${text(r[1])}" (${num(r[3])}, tiền ${num(r[4])}) không có mặt hàng nào của bảng kê kho đọc: không đưa vào.`); });
xuat.slice(4, 250).forEach((r, i) => { const row = i + 5; if (!used.xuat.has(row) && text(r[1]) && num(r[3])) problems.push(`Tab "xuất kho" dòng ${row} "${text(r[1])}" (${num(r[3])}) không có mặt hàng nào của bảng kê kho đọc: không đưa vào.`); });
// closing stock by the template's rule (weighted average) against the finance file's own figures
const errored = {};
for (const g of khos) for (const it of g.items) {
  const r = g.bk.find((x) => text(x[2]) === it.name);
  const inQ = sum(g.nhap.filter((n) => n[1] === it.name), (n) => n[2]), inV = sum(g.nhap.filter((n) => n[1] === it.name), (n) => n[3]), outQ = sum(g.xuat.filter((n) => n[2] === it.name), (n) => n[3]);
  const base = it.openQty + inQ, avg = base > 0 ? (it.openValue + inV) / base : 0, closeQ = base - outQ, closeV = it.openValue + inV - outQ * avg;
  if (Math.abs(closeQ - num(r[10])) > 1e-6) problems.push(`${g.title}: "${it.name}" tồn cuối SL ${closeQ} khác bảng kê của kế toán ${num(r[10])}.`);
  else if (typeof r[11] === "number" && Math.abs(closeV - r[11]) > 1) problems.push(`${g.title}: "${it.name}" tồn cuối giá trị ${Math.round(closeV)} khác bảng kê của kế toán ${Math.round(r[11])}.`);
  else if (typeof r[11] !== "number") (errored[g.title] ??= []).push(it.name);
}

// ---------- the workbook: Hướng dẫn, Danh mục, BK THU, BK CHI, then the kho tabs ----------
const book = new ExcelJS.Workbook();
book.calcProperties.fullCalcOnLoad = true;

// Hướng dẫn
{
  const ws = book.addWorksheet("Hướng dẫn");
  ws.getColumn(1).width = 30; ws.getColumn(2).width = 120;
  title(ws.getCell("A1")); ws.getCell("A1").value = `HƯỚNG DẪN NHẬP SỔ THU CHI VÀ KHO — ${UNIT.toUpperCase()}`;
  ws.getCell("A2").value = "Mỗi tháng một bộ tab: BK THU mm-yyyy, BK CHI mm-yyyy và các tab kho. Ô vàng nhập tay, các ô còn lại tự tính. Danh sách chọn nằm ở sheet “Danh mục”.";
  put(ws.getCell("A2"), { f: font({ italic: true, color: { argb: "FF586B84" } }) });
  const section = (r, t) => { ws.mergeCells(r, 1, r, 2); ws.getCell(r, 1).value = t; head(ws.getCell(r, 1), NAVY); ws.getCell(r, 1).alignment = { horizontal: "left", vertical: "middle" }; ws.getRow(r).height = 20; };
  const line = (r, a, b) => { ws.getCell(r, 1).value = a; ws.getCell(r, 2).value = b; put(ws.getCell(r, 1), { f: font({ bold: true }), al: { vertical: "top", wrapText: true }, bd: BORDER }); put(ws.getCell(r, 2), { al: { vertical: "top", wrapText: true }, bd: BORDER }); ws.getRow(r).height = Math.max(20, Math.ceil(b.length / 125) * 15 + 5); };
  let r = 4;
  const block = (t, lines) => { section(r++, t); for (const [a, b] of lines) line(r++, a, b); r++; };
  block("1. BK THU (tab BK THU mm-yyyy)", [
    ["Cách nhập", "Mỗi dòng là một ca bán của một người bán trong một ngày. Nhập ngày (dạng ngày của Excel), chọn người bán, ghi nội dung nếu cần, rồi tiền vào đúng cột."],
    ["Ô vàng hàng 1", "Đơn vị và kỳ báo cáo (mm/yyyy). Kỳ báo cáo quyết định bảng theo ngày bên phải và tab BK CHI cùng tháng."],
    ["Nguồn khác (cột D, E)", "Tiền mặt, chuyển khoản không phải doanh thu bán hàng (ví dụ vốn góp, luân chuyển vào quỹ)."],
    ["Khách trực tiếp (cột F, G, H)", "Tiền mặt, chuyển khoản (banking), thẻ POS của khách mua tại quầy."],
    ["Shopee Food (cột I, J), Grab Food (cột K, L), Be Food (cột O)", "Mã đơn và số công nợ với ứng dụng (Be Food chỉ có cột công nợ): dương là đơn phát sinh, âm là ứng dụng đã chuyển tiền. Dòng “tồn shopee tháng trước” là công nợ đầu tháng, không phải doanh thu. Tổng của từng cột là công nợ còn lại (xem “Tổng hợp tháng” bên phải)."],
    ["Doanh thu (cột M)", "Tự cộng tiền mặt, chuyển khoản và POS của khách trực tiếp (F + G + H). Không cộng nguồn khác và công nợ ứng dụng."],
    ["Bảng theo ngày (cột P đến W)", "Tự cộng thu chi tiền mặt và ngân hàng theo ngày, chi lấy từ tab BK CHI cùng tháng. Nhập số dư đầu kỳ tiền mặt và ngân hàng ở ô vàng hàng 1. Thẻ POS không vào hai quỹ này (tiền về sau); cột W chỉ để xem."],
    ["Thưởng theo người bán", "Bảng dưới bảng theo ngày: tiền mặt, chuyển khoản, POS của từng người bán, thưởng 5% và phần còn lại cho khách sạn, theo cách tính của kế toán."],
  ]);
  block("2. BK CHI (tab BK CHI mm-yyyy)", [
    ["Cách nhập", "Mỗi khoản chi một dòng: ngày chi thực tế, hạng mục (chọn trong danh sách), nội dung chi, rồi tiền vào đúng một cột theo quỹ đã chi."],
    ["Chi tiền mặt, chi tiền CK, chi tiền CK thẻ visa", "Tiền thực chi từ quỹ tiền mặt, tài khoản ngân hàng, thẻ visa. Cột Tổng chi tự cộng ba cột này."],
    ["Nội dung chi", "Ghi chi cho việc gì và tháng nào. Chi cho tháng khác thì ghi “tháng N” (ví dụ “Phí QL vận hành cafe tháng 9”): trang Kết quả HĐKD của dashboard tính chi phí vào tháng ghi trong nội dung."],
    ["Hạng mục", "Chọn đúng tên trong sheet “Danh mục” (có mô tả từng mục). Gõ sai tên thì khoản chi không được xếp đúng nhóm."],
  ]);
  block("3. Kho (tab NGUYÊN LIỆU CAFE, NGUYÊN LIỆU ĂN SÁNG, VẬT TƯ mm-yyyy)", [
    ["Ba bảng bên trái (cột A đến P)", "NHẬP KHO (ngày, mặt hàng, số lượng, thành tiền), XUẤT KHO (ngày, mặt hàng, số lượng; cột Phòng để trống) và KIỂM KÊ (ngày kiểm, mặt hàng, số lượng đếm). Thêm dòng ở cuối bảng."],
    ["Bảng TỒN KHO (từ cột R)", "Danh sách mặt hàng cho tháng ở ô S2. Nhập tay tồn đầu tháng (số lượng và giá trị) ở ô vàng; nhập, xuất, đơn giá bình quân, tồn cuối và chênh kiểm kê tự tính. Mặt hàng mới thì thêm vào cuối danh sách."],
    ["Kiểm kê hằng tuần", "Mỗi lần đếm kho nhập một dòng ở bảng KIỂM KÊ, ghi ngày đếm và số lượng thực tế."],
  ]);
  block("4. Sang tháng mới", [
    ["Các bước", "Sao chép các tab BK THU, BK CHI và ba tab kho, đổi đuôi tên tab thành tháng mới (ví dụ 11-2026), xóa dữ liệu cũ, đổi kỳ báo cáo ở ô I1 của BK THU và tháng ở ô S2 của từng tab kho. Tồn đầu tháng mới lấy từ tồn cuối của tháng trước."],
  ]);
  block("5. Lỗi thường gặp", [
    ["Ngày gõ dạng chữ", "Dòng không vào bảng theo ngày. Ô ngày phải căn phải."],
    ["Tên tab BK CHI không đúng", "Bảng theo ngày báo đỏ “Không thấy tab BK CHI” và chi tính 0. Tên đúng là BK CHI mm-yyyy hoặc BK CHI mm/yyyy cùng tháng với ô I1."],
    ["Tên mặt hàng không có trong danh sách TỒN KHO", "Dòng nhập, xuất, kiểm kê đó không được tính vào tồn kho."],
  ]);
}

// Danh mục
{
  const ws = book.addWorksheet("Danh mục");
  const heads = [[1, "NGƯỜI BÁN", 14], [2, "ĐƠN VỊ", 22], [4, "Hạng mục chi", 28], [5, "Gồm những khoản", 90]];
  heads.forEach(([c, h, w]) => { const cell = ws.getCell(1, c); cell.value = h; head(cell, NAVY); ws.getColumn(c).width = w; });
  ws.getColumn(3).width = 3; ws.getRow(1).height = 22;
  const people = [UNIT]; // the sheets name no seller: one entry so the list is not empty, the rows keep the seller blank
  people.forEach((p, i) => { ws.getCell(2 + i, 1).value = p; put(ws.getCell(2 + i, 1), { bd: BORDER }); });
  ws.getCell(2, 2).value = UNIT; put(ws.getCell(2, 2), { bd: BORDER });
  cats.forEach((c, i) => { ws.getCell(2 + i, 4).value = c; put(ws.getCell(2 + i, 4), { bd: BORDER }); ws.getCell(2 + i, 5).value = desc(i); put(ws.getCell(2 + i, 5), { bd: BORDER, al: { vertical: "middle", wrapText: true } }); });
  var PEOPLE = people.length, CATS = cats.length;
}

// BK THU
{
  const ws = book.addWorksheet(`BK THU ${TAG}`, { views: [{ state: "frozen", xSplit: 3, ySplit: 3 }] });
  title(ws.getCell("A1")); ws.getCell("A1").value = "BẢNG KÊ THU ĂN SÁNG, CAFE";
  label(ws.getCell("D1")); ws.getCell("D1").value = "ĐƠN VỊ"; ws.mergeCells("E1:F1"); input(ws.getCell("E1")); input(ws.getCell("F1")); ws.getCell("E1").value = UNIT;
  label(ws.getCell("H1"), true); ws.getCell("H1").value = "KỲ BÁO CÁO (tháng/năm)"; input(ws.getCell("I1"), "mm/yyyy"); ws.getCell("I1").value = day(1);
  label(ws.getCell("P1"), true); ws.getCell("P1").value = "Đầu kỳ tiền mặt"; input(ws.getCell("Q1"), "#,##0"); if (open.cash) ws.getCell("Q1").value = open.cash;
  label(ws.getCell("T1"), true); ws.getCell("T1").value = "Đầu kỳ ngân hàng"; input(ws.getCell("U1"), "#,##0"); if (open.bank) ws.getCell("U1").value = open.bank;
  // hidden helper cells: month start, the tab-name format of BK CHI, and whether that tab is missing (the hotels' tabs work the same way)
  ws.getCell("Z1").value = { formula: 'IFERROR(DATE(YEAR($I$1),MONTH($I$1),1),DATE(VALUE(RIGHT($I$1,4)),VALUE(LEFT($I$1,2)),1))' }; ws.getCell("Z1").numFmt = "dd/mm/yyyy";
  ws.getCell("AA1").value = { formula: 'IF(IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($Z$1,"mm/yyyy")&"\'!A1")),0)>0,"mm/yyyy","mm-yyyy")' };
  ws.getCell("AB1").value = { formula: 'IFERROR(ROWS(INDIRECT("\'BK CHI "&TEXT($Z$1,$AA$1)&"\'!A1")),0)=0' };
  for (const c of [26, 27, 28]) { ws.getColumn(c).hidden = true; }

  const cols = [
    ["Ngày", "NGÀY", NAVY, 12], ["Người bán", "NGƯỜI BÁN", NAVY, 11], ["Nội dung", "NỘI DUNG", NAVY, 26],
    ["Tiền mặt", "NGUỒN KHÁC", ORANGE, 13], ["Chuyển khoản", "", ORANGE, 13],
    ["Tiền mặt", "KHÁCH TRỰC TIẾP", GREEN, 13], ["Chuyển khoản", "", GREEN, 13], ["Thẻ POS", "", GREEN, 13],
    ["Mã đơn", "SHOPEE FOOD", BLUE, 11], ["Công nợ\n(+ phát sinh, − đã nhận)", "", BLUE, 15],
    ["Mã đơn", "GRAB FOOD", BLUE, 11], ["Công nợ\n(+ phát sinh, − đã nhận)", "", BLUE, 15],
    ["Doanh thu\nkhách trực tiếp", "DOANH THU", GREY, 15], ["Ghi chú", "GHI CHÚ", NAVY, 22], ["Công nợ\n(− đã nhận)", "BE FOOD", BLUE, 15],
  ];
  cols.forEach(([name, group, color, width], i) => { head(ws.getCell(2, i + 1), color); head(ws.getCell(3, i + 1), color); ws.getCell(2, i + 1).value = group || null; ws.getCell(3, i + 1).value = name; ws.getColumn(i + 1).width = width; });
  for (const c of [1, 2, 3, 13, 14]) ws.mergeCells(2, c, 3, c);
  ws.getCell(2, 1).value = "NGÀY"; ws.getCell(2, 2).value = "NGƯỜI BÁN"; ws.getCell(2, 3).value = "NỘI DUNG"; ws.getCell(2, 13).value = "Doanh thu\nkhách trực tiếp"; ws.getCell(2, 14).value = "GHI CHÚ"; 
  ws.mergeCells("D2:E2"); ws.mergeCells("F2:H2"); ws.mergeCells("I2:J2"); ws.mergeCells("K2:L2");
  ws.getRow(1).height = 32; ws.getRow(2).height = 22; ws.getRow(3).height = 48;
  for (let r = FIRST; r <= LAST; r++) {
    const band = r % 2 === 1 ? fill(BAND) : null;
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getCell(r, c);
      if (c === 1) put(cell, { fl: band, al: { horizontal: "center", vertical: "middle" }, fmt: "dd/mm/yyyy", bd: BORDER });
      else if (c === 9 || c === 11) put(cell, { fl: band, fmt: "@", bd: BORDER });
      else if (c === 2 || c === 3 || c === 14) put(cell, { fl: band, bd: BORDER });
      else if (c === 13) put(cell, { f: font({ bold: true }), fl: band, fmt: MONEY, bd: BORDER });
      else put(cell, { fl: band, fmt: "#,##0", bd: BORDER });
    }
    ws.getCell(r, 13).value = { formula: `IF(A${r}="","",F${r}+G${r}+H${r})` };
    ws.getCell(r, 2).dataValidation = warn(`'Danh mục'!$A$2:$A$${1 + PEOPLE}`, "người bán");
  }
  thu.forEach((x, k) => {
    const r = FIRST + k;
    if (x.date) ws.getCell(r, 1).value = toDate(x.date);
    if (x.who) ws.getCell(r, 2).value = x.who;
    if (x.note) ws.getCell(r, 3).value = x.note;
    x.v.forEach((v, j) => { if (v) ws.getCell(r, 4 + j).value = v; });
    if (x.shopeeId) ws.getCell(r, 9).value = x.shopeeId;
    if (x.shopee) ws.getCell(r, 10).value = x.shopee;
    if (x.grabId) ws.getCell(r, 11).value = x.grabId;
    if (x.grab) ws.getCell(r, 12).value = x.grab;
    if (x.be) ws.getCell(r, 15).value = x.be;
    if (x.remark) ws.getCell(r, 14).value = x.remark;
  });

  // panel by day: cash and bank, spending from the BK CHI tab of the same month
  const pw = [12, 14, 14, 16, 14, 14, 16, 14];
  pw.forEach((w, i) => { ws.getColumn(16 + i).width = w; });
  const chiRef = (col) => `INDIRECT("'BK CHI "&TEXT($Z$1,$AA$1)&"'!$${col}$4:$${col}$503")`;
  const gh = [["NGÀY", NAVY], ["TIỀN MẶT", GREEN], ["", GREEN], ["", GREEN], ["NGÂN HÀNG", BLUE], ["", BLUE], ["", BLUE], ["THẺ POS", GREY]];
  gh.forEach(([t, color], i) => { head(ws.getCell(2, 16 + i), color); head(ws.getCell(3, 16 + i), color); ws.getCell(2, 16 + i).value = t || null; });
  ["Ngày", "Thu tiền mặt", "Chi tiền mặt", "Dư theo ngày", "Thu ngân hàng", "Chi ngân hàng", "Số dư theo ngày", "Thu thẻ POS"].forEach((t, i) => { ws.getCell(3, 16 + i).value = t; });
  ws.mergeCells("P2:P3"); ws.mergeCells("Q2:S2"); ws.mergeCells("T2:V2"); ws.mergeCells("W2:W3");
  ws.getCell("Q2").value = { formula: 'IF($AB$1,"⚠ Không thấy tab BK CHI "&TEXT($Z$1,"mm/yyyy")&": chi đang tính 0","TIỀN MẶT")' };
  ws.addConditionalFormatting({ ref: "Q2", rules: [{ type: "expression", priority: 1, formulae: ["$AB$1"], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFECACA" } }, font: { bold: true, color: { argb: `FF${RED}` } } } }] });
  const DAYS = 31, P_LAST = FIRST + DAYS - 1;
  for (let i = 0; i < DAYS; i++) {
    const r = FIRST + i;
    ws.getCell(r, 16).value = { formula: `IF($Z$1+${i}>EOMONTH($Z$1,0),"",$Z$1+${i})` };
    ws.getCell(r, 17).value = { formula: `IF($P${r}="","",SUMIFS($D$4:$D$503,$A$4:$A$503,$P${r})+SUMIFS($F$4:$F$503,$A$4:$A$503,$P${r}))` };
    ws.getCell(r, 18).value = { formula: `IF($P${r}="","",IFERROR(SUMIFS(${chiRef("D")},${chiRef("A")},$P${r}),0))` };
    ws.getCell(r, 19).value = { formula: i === 0 ? `IF($P${r}="","",$Q$1+Q${r}-R${r})` : `IF($P${r}="","",S${r - 1}+Q${r}-R${r})` };
    ws.getCell(r, 20).value = { formula: `IF($P${r}="","",SUMIFS($E$4:$E$503,$A$4:$A$503,$P${r})+SUMIFS($G$4:$G$503,$A$4:$A$503,$P${r}))` };
    ws.getCell(r, 21).value = { formula: `IF($P${r}="","",IFERROR(SUMIFS(${chiRef("E")},${chiRef("A")},$P${r}),0))` };
    ws.getCell(r, 22).value = { formula: i === 0 ? `IF($P${r}="","",$U$1+T${r}-U${r})` : `IF($P${r}="","",V${r - 1}+T${r}-U${r})` };
    ws.getCell(r, 23).value = { formula: `IF($P${r}="","",SUMIFS($H$4:$H$503,$A$4:$A$503,$P${r}))` };
    for (let c = 16; c <= 23; c++) put(ws.getCell(r, c), c === 16 ? { al: { horizontal: "center", vertical: "middle" }, fmt: "dd/mm/yyyy", bd: BORDER } : { f: font({ bold: c === 19 || c === 22 }), fmt: MONEY, bd: BORDER });
  }
  const T = P_LAST + 1; // totals of the month
  ws.getCell(T, 16).value = "CỘNG THÁNG";
  for (const [c, L] of [[17, "Q"], [18, "R"], [20, "T"], [21, "U"], [23, "W"]]) ws.getCell(T, c).value = { formula: `SUM(${L}${FIRST}:${L}${P_LAST})` };
  ws.getCell(T, 19).value = { formula: `$Q$1+Q${T}-R${T}` }; ws.getCell(T, 22).value = { formula: `$U$1+T${T}-U${T}` };
  for (let c = 16; c <= 23; c++) put(ws.getCell(T, c), { f: font({ bold: true }), fl: fill("E8EEF6"), fmt: c === 16 ? null : MONEY, bd: BORDER, al: c === 16 ? { horizontal: "center", vertical: "middle" } : { vertical: "middle" } });

  // by seller: the 5% bonus
  const S0 = T + 3;
  ["Người bán", "Tiền mặt", "Chuyển khoản", "Thẻ POS", "Tổng", "Thưởng 5%", "Còn lại cho đơn vị"].forEach((t, i) => { const c = ws.getCell(S0, 16 + i); c.value = t; head(c, i === 0 ? NAVY : GREEN); });
  ws.getRow(S0).height = 32;
  for (let k = 0; k < PEOPLE; k++) {
    const r = S0 + 1 + k;
    ws.getCell(r, 16).value = { formula: `'Danh mục'!A${2 + k}` };
    ws.getCell(r, 17).value = { formula: `SUMIF($B$4:$B$503,$P${r},$F$4:$F$503)` };
    ws.getCell(r, 18).value = { formula: `SUMIF($B$4:$B$503,$P${r},$G$4:$G$503)` };
    ws.getCell(r, 19).value = { formula: `SUMIF($B$4:$B$503,$P${r},$H$4:$H$503)` };
    ws.getCell(r, 20).value = { formula: `Q${r}+R${r}+S${r}` };
    ws.getCell(r, 21).value = { formula: `T${r}*0.05` };
    ws.getCell(r, 22).value = { formula: `T${r}-U${r}` };
    for (let c = 16; c <= 22; c++) put(ws.getCell(r, c), { f: font({ bold: c === 16 || c === 20 }), fmt: c === 16 ? null : MONEY, bd: BORDER });
  }
  const ST = S0 + 1 + PEOPLE;
  ws.getCell(ST, 16).value = "Cộng";
  for (let c = 17; c <= 22; c++) { const L = ws.getColumn(c).letter; ws.getCell(ST, c).value = { formula: `SUM(${L}${S0 + 1}:${L}${ST - 1})` }; }
  for (let c = 16; c <= 22; c++) put(ws.getCell(ST, c), { f: font({ bold: true }), fl: fill("E8EEF6"), fmt: c === 16 ? null : MONEY, bd: BORDER });

  // summary of the month
  const M0 = ST + 3;
  ws.mergeCells(M0, 16, M0, 19); ws.getCell(M0, 16).value = "TỔNG HỢP THÁNG"; for (let c = 16; c <= 19; c++) head(ws.getCell(M0, c), NAVY);
  const lines = [
    ["Nguồn khác: tiền mặt", "D"], ["Nguồn khác: chuyển khoản", "E"], ["Khách trực tiếp: tiền mặt", "F"], ["Khách trực tiếp: chuyển khoản", "G"], ["Khách trực tiếp: thẻ POS", "H"],
    ["Doanh thu khách trực tiếp", "M"], ["Công nợ Shopee còn lại", "J"], ["Công nợ Grab còn lại", "L"], ["Công nợ Be Food còn lại", "O"],
  ];
  lines.forEach(([t, L], k) => {
    const r = M0 + 1 + k; ws.mergeCells(r, 16, r, 18); ws.getCell(r, 16).value = t; ws.getCell(r, 19).value = { formula: `SUM($${L}$4:$${L}$503)` };
    for (let c = 16; c <= 19; c++) put(ws.getCell(r, c), { f: font({ bold: L === "M" }), fmt: c === 19 ? MONEY : null, bd: BORDER });
  });
}

// BK CHI
{
  const ws = book.addWorksheet(`BK CHI ${TAG}`, { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  title(ws.getCell("A1")); ws.getCell("A1").value = "BẢNG KÊ CHI ĂN SÁNG, CAFE";
  label(ws.getCell("C1")); ws.getCell("C1").value = "ĐƠN VỊ"; ws.mergeCells("D1:E1"); input(ws.getCell("D1")); input(ws.getCell("E1")); ws.getCell("D1").value = UNIT;
  label(ws.getCell("F1"), true); ws.getCell("F1").value = "KỲ BÁO CÁO (tháng/năm)"; input(ws.getCell("G1"), "mm/yyyy"); ws.getCell("G1").value = day(1);
  const cols = [["Ngày", "KHOẢN CHI", NAVY, 13], ["Hạng mục", "", NAVY, 30], ["Nội dung chi", "", NAVY, 52], ["Chi tiền mặt", "CHI TIỀN RA KHỎI QUỸ", RED, 14], ["Chi tiền CK", "", RED, 14], ["Chi tiền CK\nthẻ visa", "", RED, 14], ["GHI CHÚ", "GHI CHÚ", NAVY, 26], ["Tổng chi", "Tổng chi", GREY, 15]];
  cols.forEach(([name, group, color, width], i) => { head(ws.getCell(2, i + 1), color); head(ws.getCell(3, i + 1), color); ws.getCell(2, i + 1).value = group || null; ws.getCell(3, i + 1).value = name; ws.getColumn(i + 1).width = width; });
  ws.mergeCells("A2:C2"); ws.mergeCells("D2:F2"); ws.mergeCells("G2:G3"); ws.mergeCells("H2:H3");
  ws.getRow(1).height = 32; ws.getRow(2).height = 22; ws.getRow(3).height = 34;
  for (let r = FIRST; r <= LAST; r++) {
    const band = r % 2 === 1 ? fill(BAND) : null;
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(r, c);
      if (c === 1) put(cell, { fl: band, al: { horizontal: "center", vertical: "middle" }, fmt: "dd/mm/yyyy", bd: BORDER });
      else if (c <= 3 || c === 7) put(cell, { fl: band, bd: BORDER });
      else put(cell, { f: font({ bold: c === 8 }), fl: band, fmt: "#,##0", bd: BORDER });
    }
    ws.getCell(r, 8).value = { formula: `SUM(D${r}:F${r})` };
    ws.getCell(r, 2).dataValidation = warn(`'Danh mục'!$D$2:$D$${1 + CATS}`, "hạng mục");
  }
  chi.forEach((x, k) => {
    const r = FIRST + k;
    if (x.date) ws.getCell(r, 1).value = toDate(x.date);
    ws.getCell(r, 2).value = x.kind; ws.getCell(r, 3).value = x.note;
    if (x.cash) ws.getCell(r, 4).value = x.cash;
    if (x.bank) ws.getCell(r, 5).value = x.bank;
    if (x.card) ws.getCell(r, 6).value = x.card;
    if (x.who) ws.getCell(r, 7).value = `${x.who} chi`;
  });
}

// kho tabs, same template as the hotels
const stock = buildStockFile(khos.map((g) => ({ sheet: g.sheet, title: g.title, items: g.items })), `${String(MM).padStart(2, "0")}/${YYYY}`, book);
for (const g of khos) {
  const ws = stock.getWorksheet(g.sheet);
  const putRows = (col, list) => list.forEach((row, k) => row.forEach((v, j) => { if (v !== "" && v != null) ws.getCell(5 + k, col + j).value = v; }));
  putRows(1, g.nhap); putRows(7, g.xuat); putRows(13, g.kiem);
}

for (const [title, names] of Object.entries(errored)) problems.push(`${title}: ${names.length} mặt hàng mà bảng kê của kế toán báo lỗi (#REF!, #DIV/0!) ở ô tồn cuối giá trị: ${names.join(", ")}. Bảng mới tính lại từ số nhập, xuất.`);
await book.xlsx.writeFile(out);
console.log("BK THU:", thu.length, "dòng | doanh thu khách trực tiếp", mine.total, "| tiền mặt", mine.direct[0], "banking", mine.direct[1], "POS", mine.direct[2], "| Shopee", mine.shopee, "Grab", mine.grab);
console.log("BK CHI:", chi.length, "dòng | tiền mặt", chiMine.cash, "tài khoản", chiMine.bank, "thẻ", chiMine.card);
for (const g of khos) console.log(g.title + ":", g.items.length, "mặt hàng,", g.nhap.length, "dòng nhập,", g.xuat.length, "dòng xuất,", g.kiem.length, "dòng kiểm kê");
const unique = [...new Set(problems)];
console.log("VẤN ĐỀ CẦN KẾ TOÁN XEM:\n" + (unique.length ? unique.map((p) => "- " + p).join("\n") : "không"));
