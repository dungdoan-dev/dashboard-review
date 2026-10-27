// One month of payroll for Sơn Trà, rebuilt from the finance team's file "LƯƠNG THÁNG mm_yyyy SƠN TRÀ.xlsx":
//   node scripts/payroll-sontra.mjs "<finance file>" <mm> <yyyy> <out.xlsx>
// Tabs: QUY TẮC (rates), CHẤM CÔNG (shift codes, totals by formula), THƯỞNG PHẠT (KPI from service profit, fines), BẢNG LƯƠNG (one row per person, all by formula).
// The roster and the typed amounts are read from the file's "BẢNG LƯƠNG" tab, the shift codes from "Chấm công", the profits and fines from "Thưởng + Phạt".
// The finance team's workbook sums to a total; this script prints the differences it knows about so they can be checked.
import fs from "node:fs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { addPayslip } from "./payslip.mjs";
import { addSummary, addCodeTable } from "./payroll-views.mjs";

const [src, mmArg, yyyyArg, out] = process.argv.slice(2);
if (!src || !mmArg || !yyyyArg || !out) throw new Error('usage: node scripts/payroll-sontra.mjs "<finance file>" <mm> <yyyy> <out.xlsx>');
const MM = Number(mmArg), YYYY = Number(yyyyArg), TAG = `${String(MM).padStart(2, "0")}-${YYYY}`;
const DAYS = new Date(Date.UTC(YYYY, MM, 0)).getUTCDate();

const wb = XLSX.read(fs.readFileSync(src));
const grid = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
const clean = (s) => String(s).trim().replace(/\s+/g, " ");
const key = (s) => clean(s).toUpperCase();
const raw = wb.Sheets["BẢNG LƯƠNG"];
const typed = (r, c) => { const cell = raw[XLSX.utils.encode_cell({ r, c })]; return cell && !cell.f && cell.v !== "" && cell.v !== undefined ? cell.v : undefined; }; // typed values only, not the file's own formulas
const formulaOf = (r, c) => raw[XLSX.utils.encode_cell({ r, c })]?.f ?? "";
const problems = [];

// ---------- shift codes ----------
const ccGrid = grid("Chấm công"), ccRaw = wb.Sheets["Chấm công"];
const shifts = new Map();
for (let i = 3; i < ccGrid.length; i++) { const r = ccGrid[i]; if (typeof r[0] === "number" && r[1]) shifts.set(key(r[1]), { name: clean(r[1]), role: clean(r[2]), codes: r.slice(3, 3 + DAYS).map((v) => String(v).trim()), holiday: ccRaw[XLSX.utils.encode_cell({ r: i, c: 37 })]?.v }); }

// ---------- the new codes: X, T, PT, P, OFF, N, X1-X3, N1-N3, TS, CT, L, DL ----------
const HOLIDAY_DAY = 2; // 2 September: the finance team typed one holiday day for everybody on the shift sheet
const lossy = new Map(); // old code -> new code when the hours change, with how many cells
for (const s of shifts.values()) {
  const pt = /partime/i.test(s.name);
  s.codes = s.codes.map((c, d) => {
    let m = c;
    if (/^[MAD]$/.test(c)) m = pt ? "PT" : "X";
    else if (/^[MAD](d)$/.test(c)) m = "X" + c[1];
    else if (/^[MAD]3,5$/.test(c)) m = "X4"; // rounded up to whole hours
    
    if (c === "M3,5" || c === "A3,5") lossy.set(`${c} -> ${m}`, (lossy.get(`${c} -> ${m}`) ?? 0) + 1);
    if (s.holiday === 1 && d + 1 === HOLIDAY_DAY && /^(X|N|PT)/.test(m)) m = "L";
    return m;
  });
}

// ---------- payroll rows ----------
const rows = [];
const pay = grid("BẢNG LƯƠNG");
for (let i = 2; i < pay.length; i++) {
  const r = pay[i];
  if (!r[1] || !(typeof r[0] === "number" || r[0] === "")) continue;
  if (String(r[1]).startsWith("Col") || !r[2]) continue;
  const m = /DATE\((\d+),(\d+),(\d+)\)/.exec(formulaOf(i, 4));
  rows.push({
    name: clean(r[1]), role: clean(r[2]), status: clean(r[3]), start: m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : undefined,
    basic: typed(i, 5), trial: typed(i, 6), hourRate: typed(i, 9), days: typed(i, 10), resp: typed(i, 23), child: typed(i, 26), birthday: typed(i, 27), kpi: typed(i, 29), review: typed(i, 30),
    semi: typed(i, 31), tet: typed(i, 32), m13: typed(i, 33), advance: typed(i, 36), note: typed(i, 38) ? clean(typed(i, 38)) : "", partTime: /partime/i.test(r[1]),
  });
  if (typed(i, 34) !== undefined && typed(i, 34) !== 0) problems.push(`"${clean(r[1])}" có trừ vi phạm ${typed(i, 34)} gõ tay trong bảng lương; trong file mới khoản này lấy từ bảng phạt ở tab THƯỞNG PHẠT.`);
}

// ---------- KPI / fines ----------
const tpGrid = grid("Thưởng + Phạt");
const kpi = [];
for (let i = 2; i < tpGrid.length; i++) { const r = tpGrid[i]; if (typeof r[0] === "number" && r[1] && r[2] && i < 15) kpi.push({ name: clean(r[1]), role: clean(r[2]), dvn: r[3], nhp: r[4], wash: r[5], mart: r[6] }); }
const fines = [];
for (let i = 17; i < tpGrid.length; i++) { const r = tpGrid[i]; if (typeof r[0] === "number" && r[1]) fines.push({ name: clean(r[1]), text: clean(r[2]), date: typeof r[5] === "number" ? new Date(Date.UTC(1899, 11, 30) + r[5] * 864e5) : undefined, amount: r[7] }); }
for (const k of kpi) if (!rows.some((p) => key(p.name) === key(k.name))) problems.push(`THƯỞNG PHẠT: "${k.name}" không có trong bảng lương (thưởng của người này không được cộng vào đâu).`);

// ---------- styles ----------
const NAVY = "1F3A5F";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const head = (c, color = NAVY) => { c.fill = fill(color); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = BORDER; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };
const input = (c) => { c.fill = fill("FEF3C7"); c.border = BORDER; };
const MONEY = "#,##0;-#,##0;0";
const titleOf = (ws, text, note) => { ws.getCell("A1").value = text; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } }; if (note) { ws.getCell("A2").value = note; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } }; } };
const L = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const book = new ExcelJS.Workbook(); book.calcProperties.fullCalcOnLoad = true;

// QUY TẮC
const RULE = {};
{
  const ws = book.addWorksheet("QUY TẮC");
  titleOf(ws, `QUY TẮC TÍNH LƯƠNG THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`, "Sửa số ở ô vàng, bảng lương tự tính lại. Giá trị ban đầu lấy từ công thức của file kế toán.");
  const rules = [
    ["month", "Tháng tính lương (ngày đầu tháng)", new Date(Date.UTC(YYYY, MM - 1, 1)), "Thâm niên tính đến cuối tháng này"],
    ["std", "Ngày công chuẩn", 26, "Đơn giá ngày = lương cơ bản / số này"],
    ["hours", "Số giờ một ngày công", 8.5, "Đơn giá giờ = đơn giá ngày / số này"],
    ["ot", "Tăng ca: % đơn giá giờ", 1.5, "Giờ tăng ca x đơn giá giờ x %. Part time dùng ô bên dưới"],
    ["otPT", "Tăng ca part time: % đơn giá giờ", 0.2, "Theo công thức của file kế toán"],
    ["k3", "Ca đêm: % đơn giá giờ mỗi ca", 0.2, "Số ca đêm x 8,5 giờ x đơn giá giờ x %"],
    ["hol", "Ngày lễ đi làm: hệ số của đơn giá ngày", 3, "Cộng thêm, ngày lễ không tính vào ngày công"],
    ["holPT", "Ngày lễ part time: hệ số", 2, ""],
    ["meal", "Tiền ăn mỗi ngày", 30000, "Nhân (ngày công + ngày lễ). Part time chỉ 30.000 khi có tăng ca"],
    ["travel", "Đi lại mỗi ngày", 10000, "Nhân (ngày công + ngày lễ)"],
    ["att", "Chuyên cần: số ngày tối thiểu", 26, "Ngày công + phép + lễ"],
    ["attPay", "Chuyên cần: số tiền", 500000, ""],
    ["attPT", "Chuyên cần part time: số tiền", 200000, ""],
    ["sen5", "Thâm niên từ 5 năm", 1000000, ""], ["sen4", "Thâm niên từ 4 năm", 800000, ""], ["sen3", "Thâm niên từ 3 năm", 600000, ""], ["sen2", "Thâm niên từ 2 năm", 400000, ""], ["sen1", "Thâm niên từ 1 năm", 200000, ""],
    ["kDvn", "KPI dịch vụ ngoài (DVN): % lợi nhuận", 0.2, ""], ["kNhp", "KPI nâng hạng phòng: % doanh thu", 0.05, ""], ["kWash", "KPI giặt ủi: % lợi nhuận doanh thu", 0.2, ""], ["kMart", "KPI Mart: % lợi nhuận doanh thu", 0.05, ""], ["kBf", "KPI Ăn sáng, Cafe: % lợi nhuận doanh thu", 0.05, ""],
  ];
  ws.getColumn(1).width = 46; ws.getColumn(2).width = 14; ws.getColumn(3).width = 70;
  rules.forEach(([k, label, v, note], i) => { const r = 4 + i; ws.getCell(r, 1).value = label; ws.getCell(r, 2).value = v; input(ws.getCell(r, 2)); ws.getCell(r, 3).value = note; ws.getCell(r, 2).numFmt = v instanceof Date ? "mm/yyyy" : typeof v === "number" && v < 2 && k !== "hours" ? "0%" : Number.isInteger(v) ? "#,##0" : "0.0#"; RULE[k] = `'QUY TẮC'!$B$${r}`; });
  addCodeTable(ws, 5 + rules.length, 4);
}

// CHẤM CÔNG
const CC = `'CHẤM CÔNG ${TAG}'`;
const D0 = 4, D1 = D0 + DAYS - 1;
const C = { off: D1 + 1, leave: D1 + 2, ts: D1 + 3, hol: D1 + 4, worked: D1 + 5, ot: D1 + 6, night: D1 + 7 };
const CC_FIRST = 4;
const ccRowOf = new Map();
{
  const ws = book.addWorksheet(`CHẤM CÔNG ${TAG}`, { views: [{ state: "frozen", ySplit: 3, xSplit: 3 }] });
  titleOf(ws, `CHẤM CÔNG THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`, "Nhập mã vào ô vàng. Các cột sau tự tính.");
  ["STT", "Họ và tên", "Chức vụ"].forEach((h, i) => { const c = ws.getCell(3, i + 1); c.value = h; head(c); });
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 26; ws.getColumn(3).width = 14;
  for (let d = 1; d <= DAYS; d++) { const c = ws.getCell(3, D0 + d - 1); c.value = d; head(c); ws.getColumn(D0 + d - 1).width = 5.5; }
  [[C.off, "Nghỉ không lương (OFF)"], [C.leave, "Nghỉ phép (P)"], [C.ts, "Thai sản (TS)"], [C.hol, "Ngày lễ đi làm (L)"], [C.worked, "Số ngày đi làm"], [C.ot, "Giờ tăng ca"], [C.night, "Số ca đêm"]].forEach(([c, h]) => { const cell = ws.getCell(3, c); cell.value = h; head(cell, "15803D"); ws.getColumn(c).width = 13; });
  ws.getRow(3).height = 44;
  let k = 0;
  for (const s of shifts.values()) {
    const r = CC_FIRST + k, rng = `$${L(D0)}${r}:$${L(D1)}${r}`;
    ccRowOf.set(key(s.name), r);
    ws.getCell(r, 1).value = k + 1; ws.getCell(r, 2).value = s.name; ws.getCell(r, 3).value = s.role;
    for (let c = 1; c <= 3; c++) ws.getCell(r, c).border = BORDER;
    s.codes.forEach((v, d) => { const cell = ws.getCell(r, D0 + d); if (v) cell.value = v; input(cell); cell.alignment = { horizontal: "center" }; });
    const n = (code) => `COUNTIF(${rng},"${code}")`;
    const f = (c, formula) => { ws.getCell(r, c).value = { formula, result: 0 }; ws.getCell(r, c).border = BORDER; };
    f(C.off, n("OFF")); f(C.leave, n("P")); f(C.ts, n("TS")); f(C.hol, n("L"));
    f(C.worked, `COUNT($${L(D0)}$3:$${L(D1)}$3)-${L(C.off)}${r}-${L(C.leave)}${r}-${L(C.ts)}${r}-${L(C.hol)}${r}`);
    f(C.ot, [1, 2, 3, 4].map((h) => `(${n("X" + h)}+${n("N" + h)})*${h}`).join("+"));
    f(C.night, ["N", "N1", "N2", "N3", "N4"].map(n).join("+"));
    k++;
  }
}

// THƯỞNG PHẠT
const TP = `'THƯỞNG PHẠT ${TAG}'`;
const KPI_FIRST = 5, FINE_FIRST = 20;
{
  const ws = book.addWorksheet(`THƯỞNG PHẠT ${TAG}`);
  titleOf(ws, `THƯỞNG KPI VÀ PHẠT THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`, "Nhập lợi nhuận từng mảng ở ô vàng; KPI tính theo tỷ lệ ở QUY TẮC. Bảng lương lấy theo TÊN.");
  const heads = ["STT", "Họ tên", "Chức vụ", "Lợi nhuận DVN", "Nâng hạng phòng", "Giặt ủi", "Lợi nhuận doanh thu Mart", "KPI DVN", "KPI NHP", "KPI giặt ủi", "KPI Mart", "Tổng KPI"];
  heads.forEach((h, i) => { const c = ws.getCell(4, i + 1); c.value = h; head(c, i >= 3 && i <= 6 ? "B45309" : NAVY); ws.getColumn(i + 1).width = [5, 26, 14, 15, 15, 13, 17, 12, 12, 12, 12, 13][i]; });
  ws.getRow(4).height = 32;
  kpi.forEach((p, k) => {
    const r = KPI_FIRST + k;
    ws.getCell(r, 1).value = k + 1; ws.getCell(r, 2).value = p.name; ws.getCell(r, 3).value = p.role;
    [p.dvn, p.nhp, p.wash, p.mart].forEach((v, j) => { if (typeof v === "number") ws.getCell(r, 4 + j).value = v; });
    ws.getCell(r, 8).value = { formula: `D${r}*${RULE.kDvn}`, result: 0 }; ws.getCell(r, 9).value = { formula: `E${r}*${RULE.kNhp}`, result: 0 };
    ws.getCell(r, 10).value = { formula: `F${r}*${RULE.kWash}`, result: 0 }; ws.getCell(r, 11).value = { formula: `G${r}*${RULE.kMart}`, result: 0 };
    ws.getCell(r, 12).value = { formula: `SUM(H${r}:K${r})`, result: 0 };
    for (let c = 1; c <= 12; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c >= 4) cell.numFmt = MONEY; if (c >= 4 && c <= 7) input(cell); }
  });
  const KPI_LAST = KPI_FIRST + Math.max(kpi.length, 12) - 1;
  for (let r = KPI_FIRST + kpi.length; r <= KPI_LAST; r++) for (let c = 1; c <= 12; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c >= 4 && c <= 7) input(cell); }
  ws.getCell(KPI_LAST + 1, 2).value = "Tổng"; ws.getCell(KPI_LAST + 1, 2).font = { bold: true };
  for (let c = 4; c <= 12; c++) { const cell = ws.getCell(KPI_LAST + 1, c); cell.value = { formula: `SUM(${L(c)}${KPI_FIRST}:${L(c)}${KPI_LAST})`, result: 0 }; cell.font = { bold: true }; cell.numFmt = MONEY; cell.border = BORDER; }
  ws.getCell(FINE_FIRST - 2, 1).value = "BẢNG PHẠT (nhân viên, nội dung lỗi, ngày, số tiền)"; ws.getCell(FINE_FIRST - 2, 1).font = { bold: true };
  ["STT", "Nhân viên", "Nội dung lỗi", "Ngày", "Số tiền phạt"].forEach((h, i) => { const c = ws.getCell(FINE_FIRST - 1, i + 1); c.value = h; head(c, "B91C1C"); });
  for (let k = 0; k < 40; k++) { const r = FINE_FIRST + k; ws.getCell(r, 1).value = k + 1; for (let c = 1; c <= 5; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c > 1) input(cell); } ws.getCell(r, 4).numFmt = "dd/mm/yyyy"; ws.getCell(r, 5).numFmt = MONEY; }
  fines.forEach((x, k) => { const r = FINE_FIRST + k; ws.getCell(r, 2).value = x.name; ws.getCell(r, 3).value = x.text; if (x.date) ws.getCell(r, 4).value = x.date; ws.getCell(r, 5).value = x.amount; });
  ws.getColumn(3).width = 36;
}

// BẢNG LƯƠNG
const COLS = [
  ["STT", 5], ["Họ tên", 25], ["Chức vụ", 13], ["Trạng thái", 12], ["Ngày vào làm", 12], ["Thâm niên (năm)", 9], ["Lương cơ bản", 13], ["Lương thử việc", 13], ["Đơn giá ngày", 12], ["Đơn giá giờ", 11],
  ["Ngày công thực tế", 10], ["Ngày phép", 8], ["Giờ tăng ca", 8], ["Số ca đêm", 8], ["Ngày lễ đi làm", 8],
  ["Lương tăng ca", 12], ["Lương ca đêm", 12], ["Lương ngày lễ", 12], ["Lương công", 14], ["Tiền ăn", 11], ["Đi lại", 10], ["Chuyên cần", 11], ["Trách nhiệm", 12], ["Thâm niên", 11], ["Phụ cấp con nhỏ", 11], ["Sinh nhật", 10],
  ["Thưởng doanh thu", 12], ["KPI", 12], ["Khoản cộng khác (xin review)", 13], ["Thưởng bán niên", 11], ["Thưởng lễ, Tết", 11], ["Lương tháng 13", 11], ["Trừ vi phạm", 11],
  ["Tổng thu nhập", 15], ["Ứng lương", 12], ["Thực lĩnh", 15], ["Ghi chú", 28],
];
const P = Object.fromEntries(COLS.map(([h], i) => [h, L(i + 1)]));
const TYPED = new Set(["Ngày vào làm", "Lương cơ bản", "Lương thử việc", "Ngày lễ đi làm", "Trách nhiệm", "Phụ cấp con nhỏ", "Sinh nhật", "KPI", "Khoản cộng khác (xin review)", "Thưởng bán niên", "Thưởng lễ, Tết", "Lương tháng 13", "Ứng lương", "Ghi chú"]);
const PAY_FIRST = 4;
{
  const ws = book.addWorksheet(`BẢNG LƯƠNG ${TAG}`, { views: [{ state: "frozen", ySplit: 3, xSplit: 2 }] });
  titleOf(ws, `BẢNG LƯƠNG THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`, "Ô vàng nhập tay, còn lại tự tính từ CHẤM CÔNG, THƯỞNG PHẠT và QUY TẮC. Thực lĩnh = tổng thu nhập - ứng lương.");
  COLS.forEach(([h, w], i) => { const c = ws.getCell(3, i + 1); c.value = h; head(c, TYPED.has(h) ? "B45309" : NAVY); ws.getColumn(i + 1).width = w; });
  ws.getRow(3).height = 58;
  const last = PAY_FIRST + rows.length - 1;
  rows.forEach((p, k) => {
    const r = PAY_FIRST + k;
    const c = (h) => `${P[h]}${r}`;
    const set = (h, v) => { ws.getCell(c(h)).value = v; };
    const f = (h, formula) => set(h, { formula, result: 0 });
    const cr = ccRowOf.get(key(p.name)); // attendance row, if any
    const ccCell = (col) => `${CC}!${L(col)}${cr}`;
    const trial = p.status.toUpperCase() === "THỬ VIỆC", pt = p.partTime;
    set("STT", k + 1); set("Họ tên", p.name); set("Chức vụ", p.role); set("Trạng thái", p.status);
    if (p.start) { set("Ngày vào làm", p.start); f("Thâm niên (năm)", `ROUND((EOMONTH(${RULE.month},0)-${c("Ngày vào làm")})/365,2)`); }
    if (p.basic !== undefined) set("Lương cơ bản", p.basic);
    if (p.trial !== undefined) set("Lương thử việc", p.trial);
    if (pt) { set("Đơn giá giờ", p.hourRate ?? 30000); f("Đơn giá ngày", `${c("Đơn giá giờ")}*5`); }
    else { f("Đơn giá ngày", `${trial ? c("Lương thử việc") : c("Lương cơ bản")}/${RULE.std}`); f("Đơn giá giờ", `${c("Đơn giá ngày")}/${RULE.hours}`); }
    if (cr) {
      f("Ngày công thực tế", ccCell(C.worked)); f("Ngày phép", ccCell(C.leave)); f("Giờ tăng ca", ccCell(C.ot)); f("Số ca đêm", ccCell(C.night)); f("Ngày lễ đi làm", ccCell(C.hol));
    } else { set("Ngày công thực tế", p.days ?? 0); input(ws.getCell(c("Ngày công thực tế"))); } // no shift row (manager): days typed
    f("Lương tăng ca", `${c("Giờ tăng ca")}*${c("Đơn giá giờ")}*${pt ? RULE.otPT : RULE.ot}`);
    f("Lương ca đêm", `${c("Số ca đêm")}*${RULE.hours}*${c("Đơn giá giờ")}*${RULE.k3}`);
    f("Lương ngày lễ", `${c("Đơn giá ngày")}*${c("Ngày lễ đi làm")}*${pt ? RULE.holPT : RULE.hol}`);
    f("Lương công", `${c("Đơn giá ngày")}*(${c("Ngày công thực tế")}+${c("Ngày phép")})`);
    // a person with no shift row (the manager) gets no meal, travel or attendance pay: the finance team typed 0 for them
    if (!cr) { for (const h of ["Tiền ăn", "Đi lại", "Chuyên cần"]) { set(h, 0); input(ws.getCell(c(h))); } } else {
    f("Tiền ăn", pt ? `IF(${c("Giờ tăng ca")}<>0,${RULE.meal},0)` : `${RULE.meal}*(${c("Ngày công thực tế")}+${c("Ngày lễ đi làm")})`);
    f("Đi lại", `${RULE.travel}*(${c("Ngày công thực tế")}+${c("Ngày lễ đi làm")})`);
    f("Chuyên cần", `IF(${c("Ngày công thực tế")}+${c("Ngày phép")}+${c("Ngày lễ đi làm")}>=${RULE.att},${pt ? RULE.attPT : RULE.attPay},0)`);
    }
    f("Thâm niên", `IF(${c("Thâm niên (năm)")}>=5,${RULE.sen5},IF(${c("Thâm niên (năm)")}>=4,${RULE.sen4},IF(${c("Thâm niên (năm)")}>=3,${RULE.sen3},IF(${c("Thâm niên (năm)")}>=2,${RULE.sen2},IF(${c("Thâm niên (năm)")}>=1,${RULE.sen1},0)))))`);
    for (const [h, v] of [["Trách nhiệm", p.resp], ["Phụ cấp con nhỏ", p.child], ["Sinh nhật", p.birthday], ["KPI", p.kpi], ["Khoản cộng khác (xin review)", p.review], ["Thưởng bán niên", p.semi], ["Thưởng lễ, Tết", p.tet], ["Lương tháng 13", p.m13], ["Ứng lương", p.advance]]) if (v) set(h, v);
    f("Thưởng doanh thu", `SUMIF(${TP}!$B$${KPI_FIRST}:$B$${KPI_FIRST + 11},${c("Họ tên")},${TP}!$L$${KPI_FIRST}:$L$${KPI_FIRST + 11})`);
    f("Trừ vi phạm", `SUMIF(${TP}!$B$${FINE_FIRST}:$B$${FINE_FIRST + 39},${c("Họ tên")},${TP}!$E$${FINE_FIRST}:$E$${FINE_FIRST + 39})`);
    f("Tổng thu nhập", `SUM(${c("Lương tăng ca")}:${c("Lương tháng 13")})-${c("Trừ vi phạm")}`);
    f("Thực lĩnh", `${c("Tổng thu nhập")}-${c("Ứng lương")}`);
    if (p.note) set("Ghi chú", p.note);
    const plain = new Set(["Ngày công thực tế", "Ngày phép", "Giờ tăng ca", "Số ca đêm", "Ngày lễ đi làm", "Thâm niên (năm)"]);
    COLS.forEach(([h], i) => { const cell = ws.getCell(r, i + 1); cell.border = BORDER; if (i >= 6 && !plain.has(h) && h !== "Ngày vào làm" && h !== "Ghi chú") cell.numFmt = MONEY; if (TYPED.has(h)) input(cell); });
    ws.getCell(c("Ngày vào làm")).numFmt = "dd/mm/yyyy"; ws.getCell(c("Ghi chú")).alignment = { wrapText: true };
  });
  const t = last + 1;
  ws.getCell(t, 2).value = "Tổng";
  for (const h of ["Lương tăng ca", "Lương ca đêm", "Lương ngày lễ", "Lương công", "Tiền ăn", "Đi lại", "Chuyên cần", "Trách nhiệm", "Thâm niên", "Phụ cấp con nhỏ", "Sinh nhật", "Thưởng doanh thu", "KPI", "Khoản cộng khác (xin review)", "Thưởng bán niên", "Thưởng lễ, Tết", "Lương tháng 13", "Trừ vi phạm", "Tổng thu nhập", "Ứng lương", "Thực lĩnh"]) ws.getCell(`${P[h]}${t}`).value = { formula: `SUM(${P[h]}${PAY_FIRST}:${P[h]}${last})`, result: 0 };
  for (let i = 1; i <= COLS.length; i++) { const cell = ws.getCell(t, i); cell.font = { bold: true }; cell.border = BORDER; cell.numFmt = MONEY; }
}
// THƯỞNG THEO GIỜ: the KPI pool (profit of each business x its KPI rate) shared by hours worked; a separate view, not added to BẢNG LƯƠNG
{
  const ws = book.addWorksheet(`KPI THEO GIỜ ${TAG}`, { views: [{ state: "frozen", ySplit: 15, xSplit: 2 }] });
  titleOf(ws, `KPI CHIA THEO SỐ GIỜ LÀM THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`, "Quỹ KPI = lợi nhuận từng mảng x tỷ lệ ở QUY TẮC, chia cho mọi người theo giờ làm. Giờ làm = (ngày công + ngày lễ) x giờ một ngày + giờ tăng ca. Không cộng vào BẢNG LƯƠNG.");
  const pay = `'BẢNG LƯƠNG ${TAG}'!`, KT = KPI_FIRST + 11 + 1, tp = (col) => `'THƯỞNG PHẠT ${TAG}'!${col}${KT}`;
  const F = 16, E = F + rows.length - 1;
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 40; ws.getColumn(3).width = 16;
  const lines = [
    ["KPI dịch vụ ngoài (DVN)", { formula: `${tp("D")}*${RULE.kDvn}`, result: 0 }, MONEY, false],
    ["KPI nâng hạng phòng", { formula: `${tp("E")}*${RULE.kNhp}`, result: 0 }, MONEY, false],
    ["KPI giặt ủi", { formula: `${tp("F")}*${RULE.kWash}`, result: 0 }, MONEY, false],
    ["KPI Mart", { formula: `${tp("G")}*${RULE.kMart}`, result: 0 }, MONEY, false],
    ["Lợi nhuận Ăn sáng, Cafe (nhập)", undefined, MONEY, true],
    ["KPI Ăn sáng, Cafe", { formula: `C8*${RULE.kBf}`, result: 0 }, MONEY, false],
    ["Quỹ KPI đem chia", { formula: "SUM(C4:C7)+C9", result: 0 }, MONEY, false],
    ["Giờ một ngày part time", 5, "0.0", true],
    ["Tổng giờ tính KPI", { formula: `SUM(H${F}:H${E})`, result: 0 }, "#,##0.0", false],
    ["KPI cho mỗi giờ", { formula: "IF(C12=0,0,C10/C12)", result: 0 }, MONEY, false],
  ];
  lines.forEach(([label, v, fmt, isInput], i) => { const r = 4 + i; ws.getCell(r, 2).value = label; const c = ws.getCell(r, 3); if (v !== undefined) c.value = v; c.numFmt = fmt; c.border = BORDER; if (isInput) input(c); });
  ["C10", "C13"].forEach((a) => { ws.getCell(a).font = { bold: true }; });
  ["STT", "Họ tên", "Chức vụ", "Ngày công", "Ngày lễ đi làm", "Giờ tăng ca", "Tính KPI (1 = có, 0 = không)", "Giờ làm", "Tỷ lệ", "KPI"].forEach((h, i) => { const c = ws.getCell(15, i + 1); c.value = h; head(c, i === 6 ? "B45309" : i >= 7 ? "15803D" : NAVY); if (i > 2) ws.getColumn(i + 1).width = i === 6 ? 16 : 13; });
  ws.getRow(15).height = 44;
  rows.forEach((p, k) => {
    const r = F + k, src = (h) => `${pay}${P[h]}${PAY_FIRST + k}`;
    ws.getCell(r, 1).value = k + 1;
    [["Họ tên", 2], ["Chức vụ", 3]].forEach(([h, col]) => { ws.getCell(r, col).value = { formula: src(h), result: "" }; });
    [["Ngày công thực tế", 4], ["Ngày lễ đi làm", 5], ["Giờ tăng ca", 6]].forEach(([h, col]) => { ws.getCell(r, col).value = { formula: src(h), result: 0 }; });
    ws.getCell(r, 7).value = 1; input(ws.getCell(r, 7)); ws.getCell(r, 7).alignment = { horizontal: "center" };
    ws.getCell(r, 8).value = { formula: `G${r}*((D${r}+E${r})*${p.partTime ? "$C$11" : RULE.hours}+F${r})`, result: 0 };
    ws.getCell(r, 9).value = { formula: `IF($C$12=0,0,H${r}/$C$12)`, result: 0 };
    ws.getCell(r, 10).value = { formula: `I${r}*$C$10`, result: 0 };
    for (let c = 1; c <= 10; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (c >= 4 && c <= 6) cell.numFmt = "#,##0;-#,##0;\"-\""; }
    ws.getCell(r, 8).numFmt = "#,##0.0"; ws.getCell(r, 9).numFmt = "0.0%"; ws.getCell(r, 10).numFmt = MONEY; ws.getCell(r, 10).font = { bold: true };
  });
  const t = E + 1;
  ws.getCell(t, 2).value = "Tổng";
  [[8, "#,##0.0"], [9, "0.0%"], [10, MONEY]].forEach(([c, fmt]) => { ws.getCell(t, c).value = { formula: `SUM(${L(c)}${F}:${L(c)}${E})`, result: 0 }; ws.getCell(t, c).numFmt = fmt; });
  for (let c = 1; c <= 10; c++) { const cell = ws.getCell(t, c); cell.font = { bold: true }; cell.fill = fill("E8EEF6"); cell.border = BORDER; }
}
addSummary(book, {
  month: MM, year: YYYY, tag: TAG, payTab: "BẢNG LƯƠNG " + TAG, first: PAY_FIRST, last: PAY_FIRST + rows.length - 1, letters: P, roles: [...new Set(rows.map((p) => p.role))],
  info: [["Ngày công", "Ngày công thực tế"], ["Giờ tăng ca", "Giờ tăng ca"]],
  groups: [["Lương", ["Lương công", "Lương tăng ca", "Lương ca đêm", "Lương ngày lễ"]], ["Phụ cấp", ["Tiền ăn", "Đi lại", "Chuyên cần", "Trách nhiệm", "Thâm niên", "Phụ cấp con nhỏ", "Sinh nhật"]], ["Thưởng", ["Thưởng doanh thu", "KPI", "Khoản cộng khác (xin review)", "Thưởng bán niên", "Thưởng lễ, Tết", "Lương tháng 13"]]],
});
addPayslip(book, {
  month: MM, year: YYYY, tag: TAG, payTab: "BẢNG LƯƠNG " + TAG, first: PAY_FIRST, last: PAY_FIRST + rows.length - 1, letters: P,
  items: [
    ["Lương cơ bản", "Lương cơ bản", "money"], ["Số ngày công", "Ngày công thực tế", "plain"], ["Ngày nghỉ phép", "Ngày phép", "plain"], ["Giờ tăng ca", "Giờ tăng ca", "plain"], ["Số ca đêm", "Số ca đêm", "plain"], ["Số ngày lễ đi làm", "Ngày lễ đi làm", "plain"],
    ["Lương công", "Lương công", "money"], ["Lương tăng ca", "Lương tăng ca", "money"], ["Lương ca đêm", "Lương ca đêm", "money"], ["Lương ngày lễ", "Lương ngày lễ", "money"],
    ["Phụ cấp tiền ăn", "Tiền ăn", "money"], ["Phụ cấp đi lại", "Đi lại", "money"], ["Chuyên cần", "Chuyên cần", "money"], ["Trách nhiệm", "Trách nhiệm", "money"], ["Thâm niên", "Thâm niên", "money"], ["Phụ cấp con nhỏ", "Phụ cấp con nhỏ", "money"], ["Sinh nhật", "Sinh nhật", "money"],
    ["Thưởng doanh thu", "Thưởng doanh thu", "money"], ["KPI", "KPI", "money"], ["Khoản cộng khác", "Khoản cộng khác (xin review)", "money"], ["Thưởng bán niên", "Thưởng bán niên", "money"], ["Thưởng lễ, Tết", "Thưởng lễ, Tết", "money"], ["Lương tháng 13", "Lương tháng 13", "money"],
    ["Trừ vi phạm", "Trừ vi phạm", "money"], ["Tổng thu nhập", "Tổng thu nhập", "total"], ["Ứng lương", "Ứng lương", "money"], ["Thực lĩnh", "Thực lĩnh", "total"],
  ],
});
await book.xlsx.writeFile(out);
console.log("đổi mã làm giờ lệch:", [...lossy].map(([k, n]) => k + " x" + n).join("; "));
console.log("dòng lương:", rows.length, "chấm công:", shifts.size, "KPI:", kpi.length, "phạt:", fines.length);
console.log("VẤN ĐỀ:\n" + (problems.join("\n") || "không"));
