// One month of the books of "Ăn sáng, Cafe YZT" in the Sơn Trà layout (BK THU, BK CHI, kho tabs, one Hướng dẫn, one Danh mục), from the finance team's file "KT thu chi Ăn sáng, Cafe YZT Tmm_yyyy.xlsx":
//   node scripts/cafe-yzt-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>
// Figures are copied as the finance team typed them; every total is checked against the file and what differs is printed at the end (the file has a few formula slips).
import fs from "node:fs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { buildStockFile } from "../src/lib/inventory-template.ts";

const [src, mmArg, yyyyArg, out] = process.argv.slice(2);
if (!src || !mmArg || !yyyyArg || !out) throw new Error('usage: node scripts/cafe-yzt-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>');
const MM = Number(mmArg), YYYY = Number(yyyyArg), TAG = `${String(MM).padStart(2, "0")}-${YYYY}`;
const UNIT = "Ăn sáng, Cafe YZT";

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
const thuSrc = rows("BK THU VTCF"), chiSrc = rows("BK CHI VTCF");

// BK THU: from row 9; A date, B seller, C text, D E other sources (cash, bank), F G H direct guests (cash, bank, POS), I J Shopee (id, balance), K L Grab (id, balance)
const thu = [];
for (let i = 8; i < Math.min(thuSrc.length, 200); i++) {
  const r = thuSrc[i];
  if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some((c) => r[c] !== "")) continue;
  thu.push({ src: i + 1, date: typeof r[0] === "number" ? r[0] : null, who: text(r[1]), note: text(r[2]), v: [3, 4, 5, 6, 7].map((c) => num(r[c])), shopeeId: text(r[8]), shopee: num(r[9]), grabId: text(r[10]), grab: num(r[11]) });
}
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
for (const x of thu) {
  if (x.date && !inMonth(x.date)) problems.push(`BK THU dòng nguồn ${x.src}: ngày ${toDate(x.date).toISOString().slice(0, 10)} nằm ngoài tháng ${MM}/${YYYY}.`);
  if (!x.date && (x.v.some(Boolean) || x.shopee || x.grab) && !/tồn/i.test(x.note)) problems.push(`BK THU dòng nguồn ${x.src}: có tiền nhưng không có ngày (ô ngày để trống).`);
}
// the finance file's own totals (row 8) and the slip in its "Tổng" column
const own = { other: [num(thuSrc[7][3]), num(thuSrc[7][4])], direct: [num(thuSrc[7][5]), num(thuSrc[7][6]), num(thuSrc[7][7])], shopee: num(thuSrc[7][9]), grab: num(thuSrc[7][11]), total: num(thuSrc[7][12]) };
const mine = { other: [sum(thu, (x) => x.v[0]), sum(thu, (x) => x.v[1])], direct: [sum(thu, (x) => x.v[2]), sum(thu, (x) => x.v[3]), sum(thu, (x) => x.v[4])], shopee: sum(thu, (x) => x.shopee), grab: sum(thu, (x) => x.grab) };
mine.total = mine.direct[0] + mine.direct[1] + mine.direct[2];
own.other.forEach((v, k) => { if (v !== mine.other[k]) problems.push(`BK THU nguồn khác cột ${["tiền mặt", "banking"][k]}: cộng ${mine.other[k]} khác tổng của kế toán ${v}.`); });
own.direct.forEach((v, k) => { if (v !== mine.direct[k]) problems.push(`BK THU khách trực tiếp cột ${["tiền mặt", "banking", "POS"][k]}: cộng ${mine.direct[k]} khác tổng của kế toán ${v}.`); });
if (own.shopee !== mine.shopee) problems.push(`BK THU công nợ Shopee: cộng ${mine.shopee} khác tổng của kế toán ${own.shopee}.`);
if (own.grab !== mine.grab) problems.push(`BK THU công nợ Grab: cộng ${mine.grab} khác tổng của kế toán ${own.grab}.`);
if (own.total !== mine.total) {
  const slips = thuSrc.slice(8, 200).map((r, i) => ({ row: i + 9, r })).filter(({ r }) => typeof r[12] === "number" && r[12] !== num(r[5]) + num(r[6]) + num(r[7]));
  problems.push(`Cột "Tổng tiền" (M) của kế toán cộng ${own.total}, bảng này cộng ${mine.total} (= tiền mặt + banking + POS của khách trực tiếp): chênh ${mine.total - own.total}. Dòng nguồn lệch: ${slips.map(({ row, r }) => `${row} (M=${r[12]}, F+G+H=${num(r[5]) + num(r[6]) + num(r[7])})`).join("; ") || "không tìm thấy"} (công thức M47 của kế toán là =H47+G48+F47, đúng phải là G47).`);
}

// BK CHI: from row 6; A date, B hạng mục, C nội dung, D cash, E bank
const chi = [];
let lastDate = null;
for (let i = 5; i < Math.min(chiSrc.length, 400); i++) {
  const r = chiSrc[i], cash = num(r[3]), bank = num(r[4]);
  if (!text(r[1]) && !text(r[2]) && !cash && !bank) continue;
  if (typeof r[0] === "number") lastDate = r[0];
  else problems.push(`BK CHI dòng nguồn ${i + 1} "${text(r[2])}": không có ngày, tính cùng ngày với dòng trên.`);
  chi.push({ src: i + 1, date: typeof r[0] === "number" ? r[0] : lastDate, cat: text(r[1]), note: text(r[2]), cash, bank });
}
const chiOwn = { cash: num(chiSrc[3][3]), bank: num(chiSrc[3][4]), d2: num(chiSrc[1][3]), e2: num(chiSrc[1][4]) };
const chiMine = { cash: sum(chi, (x) => x.cash), bank: sum(chi, (x) => x.bank) };
if (chiOwn.cash !== chiMine.cash) problems.push(`BK CHI tiền mặt: cộng ${chiMine.cash} khác ô tổng D4 của kế toán ${chiOwn.cash}.`);
if (chiOwn.bank !== chiMine.bank) problems.push(`BK CHI tiền tài khoản: cộng ${chiMine.bank} khác ô tổng E4 của kế toán ${chiOwn.bank}.`);
if (chiOwn.d2 !== chiMine.cash || chiOwn.e2 !== chiMine.bank) problems.push(`Ô tổng chi ở dòng 2 của kế toán (D2 = ${chiOwn.d2}, E2 = ${chiOwn.e2}) lấy =SUM(D4:D108): cộng luôn ô tổng D4 và dừng ở dòng 108 nên sai; tổng đúng ${chiMine.cash} tiền mặt, ${chiMine.bank} tài khoản. Ô "TỔNG CHI" ở đầu BK THU của kế toán lấy từ E2 nên cũng sai.`);
for (const x of chi) if (x.date && !inMonth(x.date)) problems.push(`BK CHI dòng nguồn ${x.src}: ngày ${toDate(x.date).toISOString().slice(0, 10)} nằm ngoài tháng ${MM}/${YYYY}.`);

// danh mục chi: the list (column G) and the description lines of the guide (column F: "1. Chi mua TSCĐ" then its description)
const cats = chiSrc.slice(4, 40).map((r) => text(r[6])).filter(Boolean);
const guide = [];
for (const r of chiSrc.slice(4, 60)) { const f = text(r[5]); if (!f) continue; if (/^\d+\.?\s/.test(f)) guide.push({ name: f.replace(/^\d+\.?\s*/, ""), desc: "" }); else if (guide.length && !guide[guide.length - 1].desc) guide[guide.length - 1].desc = f; }
const desc = (k) => guide[k]?.desc ?? "";
for (const x of chi) if (!cats.includes(x.cat)) problems.push(`BK CHI dòng nguồn ${x.src}: hạng mục "${x.cat}" không có trong danh mục chi.`);

// ---------- kho: three lists in one tab of the finance file ----------
const bk = rows("BK  NL CAFE, AS"), mua = rows("BK NL Cafe, AS mua vào"), xuat = rows("BK NL Cafe, AS xuất ra"), kkCafe = rows("BẢNG KIỂM KÊ"), kkAs = rows("Kiểm kê AS");
const GROUPS = [
  { sheet: `NGUYÊN LIỆU CAFE ${TAG}`, title: "NGUYÊN LIỆU CAFE", kind: "Nguyên liệu cafe", from: 5, to: 63 },
  { sheet: `NGUYÊN LIỆU ĂN SÁNG ${TAG}`, title: "NGUYÊN LIỆU ĂN SÁNG", kind: "Nguyên liệu ăn sáng", from: 88, to: 120 },
  { sheet: `VẬT TƯ ${TAG}`, title: "VẬT TƯ", kind: "Vật tư", from: 64, to: 87 },
]; // rows of "BK  NL CAFE, AS" (1-based)
const byName = (list, first, col) => { const m = new Map(); list.slice(first).forEach((r, i) => { const n = text(r[col]); if (!n) return; if (m.has(n)) problems.push(`Tên "${n}" xuất hiện hai lần trong cùng một bảng kê kho (dòng ${first + i + 1}), lấy dòng đầu.`); else m.set(n, r); }); return m; };
const kk = (list) => { const head = list[1]; const weeks = head.map((h, i) => { const m = /Tuần\s*(\d+)/.exec(String(h)); return m ? { i, week: Number(m[1]) } : null; }).filter(Boolean); return { weeks, by: byName(list, 2, 1) }; };
const kkSources = [kk(kkCafe), kk(kkAs)];
// ISO week w: its Sunday
const sunday = (w) => { const jan4 = new Date(Date.UTC(YYYY, 0, 4)); const monday1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5); return new Date(monday1.getTime() + ((w - 1) * 7 + 6) * 864e5); };

// The finance file's own "BK  NL CAFE, AS" tab decides every figure: its formulas say which row of the "mua vào" / "xuất ra" tabs each item reads (and some add hand-typed numbers), so the day lines come from those rows and the rest is an adjustment line.
// Where a formula reads the row of ANOTHER item (the lists drift by one row from the 103rd line), the row with the item's own name is used instead and the difference is reported.
const ex = new ExcelJS.Workbook(); await ex.xlsx.readFile(src);
const bkWs = ex.getWorksheet("BK  NL CAFE, AS");
const refRow = (n, col) => { const m = /!\$?D\$?(\d+)/.exec(String(bkWs.getCell(n, col).formula ?? "")); return m ? Number(m[1]) : null; };
const USED_UP = /\+F\d+$/; // the formula adds the receipt to the issue: bought and used up at once
const plain = (s) => text(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ");
const same = (a, b) => plain(a).slice(0, 5) === plain(b).slice(0, 5);
const rowByName = (list, name, from, to) => { for (let i = from; i < to; i++) if (plain(list[i][1]) === plain(name)) return i + 1; for (let i = from; i < to; i++) if (text(list[i][1]) && same(list[i][1], name)) return i + 1; return null; };
const used = { mua: new Set(), xuat: new Set() };
const khos = GROUPS.map((g) => {
  const items = [], nhap = [], xuatRows = [], kiem = [];
  for (let n = g.from; n <= Math.min(g.to, bk.length); n++) {
    const r = bk[n - 1], name = text(r[1]);
    if (!name) continue;
    items.push({ name, kind: g.kind, unit: text(r[2]), openQty: num(r[3]), openValue: num(r[4]) });
    // receipts: the row the finance formula reads, else the row with the item's name
    let k = refRow(n, 6), targetQ = num(r[5]), targetV = num(r[6]);
    if (k && !same(name, mua[k - 1][1])) {
      const k2 = rowByName(mua, name, 5, 200), q2 = k2 ? num(mua[k2 - 1][3]) : 0, v2 = k2 ? num(mua[k2 - 1][4]) : 0;
      if (q2 !== targetQ || v2 !== targetV) problems.push(`${g.title}: dòng ${n} "${name}" của bảng kê kho lấy số nhập từ dòng ${k} của tab "mua vào" là "${text(mua[k - 1][1])}" (công thức lệch dòng): kế toán ghi nhập ${targetQ} (tiền ${targetV}), dòng đúng của "${name}" là dòng ${k2 ?? "?"} với ${q2} (tiền ${v2}); đã lấy số của dòng đúng.`);
      k = k2; targetQ = q2; targetV = v2;
    }
    const days = []; let dq = 0, dv = 0;
    if (k) {
      used.mua.add(k);
      for (let d = 1; d <= 31; d++) { const q = num(mua[k - 1][5 + 2 * (d - 1)]), v = num(mua[k - 1][6 + 2 * (d - 1)]); if (q || v) { nhap.push([day(d), name, q, v, ""]); days.push({ d, q }); } dq += q; dv += v; }
    }
    const rq = targetQ - dq, rv = targetV - dv;
    if (Math.abs(rq) > 1e-9 || Math.abs(rv) > 1e-9) { nhap.push([day(1), name, rq, rv, "Chưa có ngày trong bảng kê của kế toán"]); problems.push(`${g.title}: "${name}" nhập ${targetQ} (tiền ${targetV}) nhưng các ngày chỉ cộng ${dq} (${dv}); thêm dòng điều chỉnh ngày 01.`); }
    // issues
    let j = refRow(n, 8), targetX = num(r[7]);
    const hFormula = String(bkWs.getCell(n, 8).formula ?? "");
    if (j && !same(name, xuat[j - 1][1])) {
      const j2 = rowByName(xuat, name, 5, 200), x2 = j2 ? num(xuat[j2 - 1][3]) : 0;
      if (x2 !== targetX && !USED_UP.test(hFormula)) problems.push(`${g.title}: dòng ${n} "${name}" lấy số xuất từ dòng ${j} của tab "xuất ra" là "${text(xuat[j - 1][1])}" (công thức lệch dòng): kế toán ghi xuất ${targetX}, dòng đúng của "${name}" là dòng ${j2 ?? "?"} với ${x2}; đã lấy số của dòng đúng.`);
      j = j2; targetX = x2 + (USED_UP.test(hFormula) ? targetQ : 0);
    }
    let xq = 0;
    if (j) {
      used.xuat.add(j);
      for (let d = 1; d <= 31; d++) { const q = num(xuat[j - 1][4 + (d - 1)]); if (q) xuatRows.push([day(d), "", name, q, ""]); xq += q; }
    } else if (hFormula === `F${n}`) { for (const x of days) { xuatRows.push([day(x.d), "", name, x.q, "Dùng hết trong ngày nhập"]); xq += x.q; } }
    if (USED_UP.test(hFormula)) { for (const x of days) { xuatRows.push([day(x.d), "", name, x.q, "Dùng hết trong ngày nhập"]); xq += x.q; } if (!j) targetX = targetQ; }
    const rx = targetX - xq;
    if (Math.abs(rx) > 1e-9) {
      xuatRows.push([day(new Date(Date.UTC(YYYY, MM, 0)).getUTCDate()), "", name, rx, "Điều chỉnh theo bảng kê của kế toán"]);
      problems.push(`${g.title}: "${name}" xuất ${targetX} (công thức H${n}: ${hFormula || "gõ tay"}) nhưng các ngày chỉ cộng ${xq}; thêm dòng điều chỉnh cuối tháng${/[+-]\s*\d/.test(hFormula) ? " (số gõ tay trong công thức, không có ngày)" : ""}.`);
    }
    for (const s of kkSources) {
      const kr = s.by.get(name); if (!kr) continue;
      const byWeek = new Map(); for (const c of s.weeks) if (typeof kr[c.i] === "number") byWeek.set(c.week, kr[c.i]);
      for (const [w, q] of byWeek) { const d = sunday(w); if (d.getUTCMonth() === MM - 1 && d.getUTCFullYear() === YYYY) kiem.push([d, name, q, `Tuần ${w}`]); }
    }
  }
  return { ...g, items, nhap, xuat: xuatRows, kiem };
});
// rows of the "mua vào" and "xuất ra" tabs that no item of the stock book reads, with money or quantity in them
const orphan = (list, usedSet, qtyCol, moneyCol, label) => list.slice(5, 200).forEach((r, i) => { const row = i + 6; if (usedSet.has(row) || !text(r[1])) return; if (num(r[qtyCol]) || (moneyCol && num(r[moneyCol]))) problems.push(`Tab "${label}" dòng ${row} "${text(r[1])}" (${num(r[qtyCol])}${moneyCol ? `, tiền ${num(r[moneyCol])}` : ""}) không có trong bảng kê kho của kế toán nên chưa vào kho.`); });
orphan(mua, used.mua, 3, 4, "mua vào"); orphan(xuat, used.xuat, 3, null, "xuất ra");
// closing stock by the template's rule against the finance file's own figures
for (const g of khos) {
  let diff = 0;
  for (const it of g.items) {
    const r = bk.slice(g.from - 1, g.to).find((x) => text(x[1]) === it.name);
    const inQ = sum(g.nhap.filter((n) => n[1] === it.name), (n) => n[2]), inV = sum(g.nhap.filter((n) => n[1] === it.name), (n) => n[3]), outQ = sum(g.xuat.filter((n) => n[2] === it.name), (n) => n[3]);
    const base = it.openQty + inQ, avg = base > 0 ? (it.openValue + inV) / base : 0, closeQ = base - outQ, closeV = it.openValue + inV - outQ * avg;
    if (Math.abs(closeQ - num(r[9])) > 1e-6) { diff++; problems.push(`${g.title}: "${it.name}" tồn cuối SL ${closeQ} khác bảng kê của kế toán ${num(r[9])}.`); }
    else if (Math.abs(closeV - num(r[10])) > 1) problems.push(`${g.title}: "${it.name}" tồn cuối giá trị ${Math.round(closeV)} khác bảng kê của kế toán ${Math.round(num(r[10]))}.`);
  }
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
    ["Shopee Food (cột I, J), Grab Food (cột K, L)", "Mã đơn và số công nợ với ứng dụng: dương là đơn phát sinh, âm là ứng dụng đã chuyển tiền. Dòng “tồn shopee tháng trước” là công nợ đầu tháng, không phải doanh thu. Tổng của hai cột này là công nợ còn lại (xem “Tổng hợp tháng” bên phải)."],
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
  const people = [...new Set(thu.map((x) => x.who).filter(Boolean))];
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
  label(ws.getCell("P1"), true); ws.getCell("P1").value = "Đầu kỳ tiền mặt"; input(ws.getCell("Q1"), "#,##0");
  label(ws.getCell("T1"), true); ws.getCell("T1").value = "Đầu kỳ ngân hàng"; input(ws.getCell("U1"), "#,##0");
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
    ["Doanh thu\nkhách trực tiếp", "DOANH THU", GREY, 15], ["Ghi chú", "GHI CHÚ", NAVY, 22],
  ];
  cols.forEach(([name, group, color, width], i) => { head(ws.getCell(2, i + 1), color); head(ws.getCell(3, i + 1), color); ws.getCell(2, i + 1).value = group || null; ws.getCell(3, i + 1).value = name; ws.getColumn(i + 1).width = width; });
  for (const c of [1, 2, 3, 13, 14]) ws.mergeCells(2, c, 3, c);
  ws.getCell(2, 1).value = "NGÀY"; ws.getCell(2, 2).value = "NGƯỜI BÁN"; ws.getCell(2, 3).value = "NỘI DUNG"; ws.getCell(2, 13).value = "Doanh thu\nkhách trực tiếp"; ws.getCell(2, 14).value = "GHI CHÚ";
  ws.mergeCells("D2:E2"); ws.mergeCells("F2:H2"); ws.mergeCells("I2:J2"); ws.mergeCells("K2:L2");
  ws.getRow(1).height = 32; ws.getRow(2).height = 22; ws.getRow(3).height = 48;
  for (let r = FIRST; r <= LAST; r++) {
    const band = r % 2 === 1 ? fill(BAND) : null;
    for (let c = 1; c <= 14; c++) {
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
    if (!x.date && /tồn/i.test(x.note)) ws.getCell(r, 14).value = "Công nợ đầu tháng, không phải doanh thu";
  });

  // panel by day: cash and bank, spending from the BK CHI tab of the same month
  const pw = [12, 14, 14, 16, 14, 14, 16, 14];
  pw.forEach((w, i) => { ws.getColumn(16 + i).width = w; });
  ws.getColumn(15).width = 3;
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
    ["Doanh thu khách trực tiếp", "M"], ["Công nợ Shopee còn lại", "J"], ["Công nợ Grab còn lại", "L"],
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
    ws.getCell(r, 2).value = x.cat; ws.getCell(r, 3).value = x.note;
    if (x.cash) ws.getCell(r, 4).value = x.cash;
    if (x.bank) ws.getCell(r, 5).value = x.bank;
  });
}

// kho tabs, same template as the hotels
const stock = buildStockFile(khos.map((g) => ({ sheet: g.sheet, title: g.title, items: g.items })), `${String(MM).padStart(2, "0")}/${YYYY}`, book);
for (const g of khos) {
  const ws = stock.getWorksheet(g.sheet);
  const putRows = (col, list) => list.forEach((row, k) => row.forEach((v, j) => { if (v !== "" && v != null) ws.getCell(5 + k, col + j).value = v; }));
  putRows(1, g.nhap); putRows(7, g.xuat); putRows(13, g.kiem);
}

await book.xlsx.writeFile(out);
console.log("BK THU:", thu.length, "dòng | doanh thu khách trực tiếp", mine.total, "| tiền mặt", mine.direct[0], "banking", mine.direct[1], "POS", mine.direct[2], "| Shopee", mine.shopee, "Grab", mine.grab);
console.log("BK CHI:", chi.length, "dòng | tiền mặt", chiMine.cash, "tài khoản", chiMine.bank);
for (const g of khos) console.log(g.title + ":", g.items.length, "mặt hàng,", g.nhap.length, "dòng nhập,", g.xuat.length, "dòng xuất,", g.kiem.length, "dòng kiểm kê");
console.log("VẤN ĐỀ CẦN KẾ TOÁN XEM:\n" + (problems.length ? problems.map((p) => "- " + p).join("\n") : "không"));
