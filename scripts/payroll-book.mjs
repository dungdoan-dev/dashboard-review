// One month of payroll for a hotel (QNSH), rebuilt from the finance team's file "Chấm công, lương Tm_yyyy.xlsx":
//   node scripts/payroll-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>
// Tabs: QUY TẮC (the rates, one cell each), CHẤM CÔNG (day codes, totals by formula), BẢNG LƯƠNG (one row per person, all by formula).
// Who is paid and the typed amounts (basic salary, allowances, KPI) are read from the file's "BẢNG LƯƠNG" tab; the day codes from "Chấm công".
// A person who was on probation part of the month has two rows (probation days, then regular days), as in the finance team's sheet.
import fs from "node:fs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { addPayslip } from "./payslip.mjs";
import { addSummary, addCodeTable } from "./payroll-views.mjs";

const [src, mmArg, yyyyArg, out] = process.argv.slice(2);
if (!src || !mmArg || !yyyyArg || !out) throw new Error('usage: node scripts/payroll-book.mjs "<finance file>" <mm> <yyyy> <out.xlsx>');
const MM = Number(mmArg), YYYY = Number(yyyyArg), TAG = `${String(MM).padStart(2, "0")}-${YYYY}`;
const DAYS = new Date(Date.UTC(YYYY, MM, 0)).getUTCDate();

const wb = XLSX.read(fs.readFileSync(src));
const grid = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
const cc = grid("Chấm công"), pay = grid("BẢNG LƯƠNG");
const raw = wb.Sheets["BẢNG LƯƠNG"];
const typed = (r, c) => { const cell = raw[XLSX.utils.encode_cell({ r, c })]; return cell && !cell.f && cell.v !== "" ? cell.v : undefined; }; // typed numbers only, not the file's own formulas
const clean = (s) => String(s).trim().replace(/\s+/g, " ");

// ---------- attendance rows ----------
const people = [];
for (let i = 2; i < cc.length; i++) { const r = cc[i]; if (typeof r[0] === "number" && r[1]) people.push({ name: clean(r[1]), role: clean(r[2]), codes: r.slice(3, 3 + DAYS).map((v) => String(v).trim()), srcExtra: r[3 + DAYS] }); }
const ccRowOf = new Map(people.map((p, k) => [p.name.toUpperCase(), k]));
const ccKey = (n) => clean(n).toUpperCase();

// ---------- payroll rows ----------
const problems = [];
const rowsOut = [];
for (let i = 2; i < pay.length; i++) {
  const r = pay[i];
  if (typeof r[0] !== "number" || !r[1]) continue;
  const name = clean(r[1]), status = clean(r[3]);
  const k = ccRowOf.get(ccKey(name));
  if (k === undefined) { problems.push(`BẢNG LƯƠNG dòng ${i + 1} "${name}": không có trong Chấm công, bỏ qua.`); continue; }
  rowsOut.push({ name, role: clean(r[2]), status, seniority: typed(i, 4), basic: typed(i, 5), trial: typed(i, 6), dayRate: typed(i, 8), hourRate: typed(i, 9), resp: typed(i, 22), housing: typed(i, 23), child: typed(i, 24), birthday: typed(i, 26), deduct: typed(i, 31), kpi: typed(i, 34), note: clean(r[38]), cc: k, srcRow: i + 1 });
}
// a person with two rows: the row marked "Thử việc" pays the probation days (code T), the other one the rest
const dup = new Map(); for (const p of rowsOut) dup.set(p.cc, (dup.get(p.cc) ?? 0) + 1);
for (const p of rowsOut) p.split = dup.get(p.cc) > 1;
// extra overtime hours typed inside the file's own attendance formulas (not in the day codes)
const extraOT = new Map(); // by attendance row
for (let i = 2; i < cc.length; i++) { const cell = XLSX.utils.encode_cell({ r: i, c: 36 }); const f = wb.Sheets["Chấm công"][cell]?.f ?? ""; const m = [...f.matchAll(/\+(\d+(?:\.\d+)?)(?=\+|$)/g)].map((x) => Number(x[1])).filter((v) => v === 3); if (m.length) extraOT.set(i - 2, m.reduce((s, v) => s + v, 0)); }

// ---------- styles ----------
const NAVY = "1F3A5F";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const head = (c, color = NAVY) => { c.fill = fill(color); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = BORDER; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };
const input = (c) => { c.fill = fill("FEF3C7"); c.border = BORDER; };
const MONEY = "#,##0;-#,##0;0";
const book = new ExcelJS.Workbook(); book.calcProperties.fullCalcOnLoad = true;

// QUY TẮC
const RULE = {}; // name -> absolute reference
{
  const ws = book.addWorksheet("QUY TẮC");
  ws.getCell("A1").value = `QUY TẮC TÍNH LƯƠNG THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  ws.getCell("A2").value = "Sửa số ở ô vàng, bảng lương tự tính lại. Giá trị ban đầu lấy từ công thức của file kế toán."; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } };
  const rules = [
    ["std", "Ngày công chuẩn của tháng", 26, "Đơn giá ngày = lương cơ bản / số này"],
    ["hours", "Số giờ một ngày công", 8.5, "Đơn giá giờ = đơn giá ngày / số này"],
    ["ot", "Tăng ca: % đơn giá giờ", 0.2, "Giờ tăng ca x đơn giá giờ x %. File kế toán dùng 20% (một vài dòng 150%)"],
    ["k3", "Ca đêm: % đơn giá giờ", 0.2, "Số ca đêm x giờ mỗi ca x đơn giá giờ x %"],
    ["nightHours", "Số giờ mỗi ca đêm", 8.5, "Mã N, N1, N2, N3 là ca đêm"],
    ["holiday", "Ngày lễ đi làm (mã L): hệ số của đơn giá ngày", 2, "Hưởng 200%; ngày L không tính vào ngày công"],
    ["attDays", "Chuyên cần: số ngày công tối thiểu", 26, ""],
    ["attPay", "Chuyên cần: số tiền", 500000, ""],
    ["sen1", "Thâm niên 1 năm", 200000, ""],
    ["sen2", "Thâm niên 2 năm", 400000, ""],
    ["sen3", "Thâm niên 3 năm", 600000, ""],
    ["sen4", "Thâm niên 4 năm trở lên", 800000, ""],
  ];
  ws.getColumn(1).width = 44; ws.getColumn(2).width = 14; ws.getColumn(3).width = 80;
  rules.forEach(([key, label, v, note], i) => { const r = 4 + i; ws.getCell(r, 1).value = label; ws.getCell(r, 2).value = v; input(ws.getCell(r, 2)); ws.getCell(r, 3).value = note; if (key === "ot" || key === "k3") ws.getCell(r, 2).numFmt = "0%"; else ws.getCell(r, 2).numFmt = Number.isInteger(v) ? "#,##0" : "0.0#"; RULE[key] = `'QUY TẮC'!$B$${r}`; });
  const next = addCodeTable(ws, 5 + rules.length, 3);
  ws.getCell(next + 1, 1).value = "OT1, OT2, OT3 trong dữ liệu cũ được tính như X1, X2, X3."; ws.getCell(next + 1, 1).font = { italic: true };
}

// CHẤM CÔNG
const CC = `'CHẤM CÔNG ${TAG}'`;
const L = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const D0 = 4, D1 = D0 + DAYS - 1;                  // day columns
const C = { off: D1 + 1, leave: D1 + 2, ts: D1 + 3, hol: D1 + 4, trial: D1 + 5, worked: D1 + 6, ptHours: D1 + 7, ot: D1 + 8, night: D1 + 9, extra: D1 + 10 };
const CC_FIRST = 4;
{
  const ws = book.addWorksheet(`CHẤM CÔNG ${TAG}`, { views: [{ state: "frozen", ySplit: 3, xSplit: 3 }] });
  ws.getCell("A1").value = `CHẤM CÔNG THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  ws.getCell("A2").value = "Nhập mã vào ô vàng (X, T, OFF, P, PT, PT12, N1, N3, OT3, ...). Các cột sau tự tính."; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } };
  ["Mã", "Họ và tên", "Chức vụ"].forEach((h, i) => { const c = ws.getCell(3, i + 1); c.value = h; head(c); });
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 24; ws.getColumn(3).width = 12;
  for (let d = 1; d <= DAYS; d++) { const c = ws.getCell(3, D0 + d - 1); c.value = d; head(c); ws.getColumn(D0 + d - 1).width = 5; }
  const tails = [[C.off, "Nghỉ không lương (OFF)"], [C.leave, "Nghỉ phép (P)"], [C.ts, "Thai sản (TS)"], [C.hol, "Ngày lễ đi làm (L)"], [C.trial, "Ngày thử việc (T)"], [C.worked, "Số ngày đi làm"], [C.ptHours, "Giờ công part time"], [C.ot, "Giờ tăng ca"], [C.night, "Số ca đêm"], [C.extra, "Giờ tăng ca cộng thêm (nhập tay)"]];
  tails.forEach(([c, h]) => { const cell = ws.getCell(3, c); cell.value = h; head(cell, c === C.extra ? "B45309" : "15803D"); ws.getColumn(c).width = 13; });
  ws.getRow(3).height = 44;
  people.forEach((p, k) => {
    const r = CC_FIRST + k, rng = `$${L(D0)}${r}:$${L(D1)}${r}`;
    ws.getCell(r, 1).value = k + 1; ws.getCell(r, 2).value = p.name; ws.getCell(r, 3).value = p.role;
    for (let c = 1; c <= 3; c++) ws.getCell(r, c).border = BORDER;
    p.codes.forEach((v, d) => { const cell = ws.getCell(r, D0 + d); if (v) cell.value = v; input(cell); cell.alignment = { horizontal: "center" }; });
    const n = (code) => `COUNTIF(${rng},"${code}")`;
    const f = (c, formula) => { ws.getCell(r, c).value = { formula, result: 0 }; ws.getCell(r, c).border = BORDER; };
    f(C.off, n("OFF")); f(C.leave, n("P")); f(C.ts, n("TS")); f(C.hol, n("L")); f(C.trial, n("T"));
    f(C.worked, `COUNT($${L(D0)}$3:$${L(D1)}$3)-${L(C.off)}${r}-${L(C.leave)}${r}-${L(C.ts)}${r}-${L(C.hol)}${r}`);
    f(C.ptHours, `${n("PT")}*5+${n("PT12")}*12`);
    f(C.ot, [1, 2, 3].map((h) => `(${n("X" + h)}+${n("OT" + h)}+${n("N" + h)})*${h}`).join("+") + `+${L(C.extra)}${r}`);
    f(C.night, ["N", "N1", "N2", "N3"].map(n).join("+"));
    if (extraOT.has(k)) ws.getCell(r, C.extra).value = extraOT.get(k);
    input(ws.getCell(r, C.extra));
  });
}

// BẢNG LƯƠNG
const PAY_FIRST = 4;
const COLS = [
  ["STT", 5], ["Họ tên", 24], ["Chức vụ", 11], ["Trạng thái", 11], ["Thâm niên (năm)", 9], ["Lương cơ bản", 13], ["Lương thử việc", 13], ["Đơn giá ngày", 13], ["Đơn giá giờ", 11],
  ["Ngày công tính lương", 11], ["Ngày lễ đi làm", 9], ["Giờ tăng ca", 9], ["Số ca đêm", 9], ["Lương công", 14], ["Lương tăng ca", 12], ["Lương ca đêm", 12], ["Lương ngày lễ", 12],
  ["Tiền ăn / ngày", 10], ["Đi lại / ngày", 10], ["Tiền ăn", 12], ["Đi lại", 11], ["Chuyên cần", 11], ["Thâm niên", 11], ["Trách nhiệm", 12], ["Phụ cấp nhà ở", 12], ["Phụ cấp con", 11], ["Sinh nhật", 10], ["Thưởng doanh thu (KPI dịch vụ)", 14], ["Trừ vi phạm", 11],
  ["Tổng thu nhập", 15], ["KPI", 12], ["Ứng lương", 12], ["Thực lĩnh", 15], ["Ghi chú", 34],
];
const P = Object.fromEntries(COLS.map(([h], i) => [h, L(i + 1)])); // column letters by heading
const TYPED = new Set(["Thâm niên (năm)", "Lương cơ bản", "Lương thử việc", "Tiền ăn / ngày", "Đi lại / ngày", "Trách nhiệm", "Phụ cấp nhà ở", "Phụ cấp con", "Sinh nhật", "Thưởng doanh thu (KPI dịch vụ)", "Trừ vi phạm", "KPI", "Ứng lương", "Ghi chú"]);
{
  const ws = book.addWorksheet(`BẢNG LƯƠNG ${TAG}`, { views: [{ state: "frozen", ySplit: 3, xSplit: 2 }] });
  ws.getCell("A1").value = `BẢNG LƯƠNG THÁNG ${String(MM).padStart(2, "0")}/${YYYY}`; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  ws.getCell("A2").value = "Ô vàng nhập tay, còn lại tự tính từ CHẤM CÔNG và QUY TẮC. Thực lĩnh = tổng thu nhập + KPI - ứng lương."; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } };
  COLS.forEach(([h, w], i) => { const c = ws.getCell(3, i + 1); c.value = h; head(c, TYPED.has(h) ? "B45309" : NAVY); ws.getColumn(i + 1).width = w; });
  ws.getRow(3).height = 58;
  const last = PAY_FIRST + rowsOut.length - 1;
  rowsOut.forEach((p, k) => {
    const r = PAY_FIRST + k, cr = CC_FIRST + p.cc;
    const c = (h) => `${P[h]}${r}`;
    const trial = p.status === "Thử việc";
    const partTime = p.status === "Part time";
    const ccCell = (col) => `${CC}!${L(col)}${cr}`;
    const set = (h, v) => { const cell = ws.getCell(c(h)); cell.value = v; };
    const f = (h, formula) => set(h, { formula, result: 0 });
    set("STT", k + 1); set("Họ tên", p.name); set("Chức vụ", p.role); set("Trạng thái", p.status);
    if (p.seniority !== undefined) set("Thâm niên (năm)", p.seniority);
    if (p.basic !== undefined) set("Lương cơ bản", p.basic);
    if (p.trial !== undefined) set("Lương thử việc", p.trial);
    // unit price: the file's typed daily rate when there is one, else basic salary (probation salary) / standard days
    if (p.dayRate !== undefined) set("Đơn giá ngày", p.dayRate); else if (!partTime) f("Đơn giá ngày", `${trial ? c("Lương thử việc") : c("Lương cơ bản")}/${RULE.std}`);
    if (p.hourRate !== undefined) set("Đơn giá giờ", p.hourRate); else if (partTime) set("Đơn giá giờ", 23000); else f("Đơn giá giờ", `${c("Đơn giá ngày")}/${RULE.hours}`);
    // days paid: worked + leave days, minus holiday days (paid separately); a split person: probation days or the rest
    const paid = `${ccCell(C.worked)}+${ccCell(C.leave)}`;
    if (p.split) f("Ngày công tính lương", trial ? ccCell(C.trial) : `${paid}-${ccCell(C.trial)}`);
    else f("Ngày công tính lương", partTime ? ccCell(C.worked) : paid);
    f("Ngày lễ đi làm", p.split && trial ? "0" : ccCell(C.hol));
    f("Giờ tăng ca", p.split && trial ? "0" : ccCell(C.ot)); f("Số ca đêm", p.split && trial ? "0" : ccCell(C.night));
    f("Lương công", partTime ? `${ccCell(C.ptHours)}*${c("Đơn giá giờ")}` : `${c("Ngày công tính lương")}*${c("Đơn giá ngày")}`);
    f("Lương tăng ca", `${c("Giờ tăng ca")}*${c("Đơn giá giờ")}*${RULE.ot}`);
    f("Lương ca đêm", `${c("Số ca đêm")}*${RULE.nightHours}*${c("Đơn giá giờ")}*${RULE.k3}`);
    f("Lương ngày lễ", `${c("Ngày lễ đi làm")}*${partTime ? c("Đơn giá giờ") + "*" + RULE.hours : c("Đơn giá ngày")}*${RULE.holiday}`);
    set("Tiền ăn / ngày", p.name === "NGUYỄN THỊ HIỆP" ? 40000 : 30000); set("Đi lại / ngày", p.name === "NGUYỄN THỊ HIỆP" ? 15000 : 10000);
    f("Tiền ăn", `${c("Tiền ăn / ngày")}*(${c("Ngày công tính lương")}+${c("Ngày lễ đi làm")})`);
    f("Đi lại", `${c("Đi lại / ngày")}*(${c("Ngày công tính lương")}+${c("Ngày lễ đi làm")})`);
    f("Chuyên cần", `IF(${c("Ngày công tính lương")}+${c("Ngày lễ đi làm")}>=${RULE.attDays},${RULE.attPay},0)`);
    f("Thâm niên", `IF(${c("Thâm niên (năm)")}>=4,${RULE.sen4},IF(${c("Thâm niên (năm)")}>=3,${RULE.sen3},IF(${c("Thâm niên (năm)")}>=2,${RULE.sen2},IF(${c("Thâm niên (năm)")}>=1,${RULE.sen1},0))))`);
    for (const [h, v] of [["Trách nhiệm", p.resp], ["Phụ cấp nhà ở", p.housing], ["Phụ cấp con", p.child], ["Sinh nhật", p.birthday], ["Trừ vi phạm", p.deduct], ["KPI", p.kpi]]) if (v) set(h, v);
    f("Tổng thu nhập", `SUM(${c("Lương công")}:${c("Sinh nhật")})+${c("Thưởng doanh thu (KPI dịch vụ)")}-${c("Trừ vi phạm")}`);
    f("Thực lĩnh", `${c("Tổng thu nhập")}+${c("KPI")}-${c("Ứng lương")}`);
    if (p.note) set("Ghi chú", p.note);
    for (let i = 1; i <= COLS.length; i++) { const cell = ws.getCell(r, i); cell.border = BORDER; if (i >= 6 && i <= 33 && !["Ngày công tính lương", "Ngày lễ đi làm", "Giờ tăng ca", "Số ca đêm", "Thâm niên (năm)"].includes(COLS[i - 1][0])) cell.numFmt = MONEY; else if (i >= 10 && i <= 13) cell.numFmt = "#,##0"; if (TYPED.has(COLS[i - 1][0])) input(cell); }
  });
  const t = last + 1;
  ws.getCell(t, 2).value = "Tổng";
  for (const h of ["Lương công", "Lương tăng ca", "Lương ca đêm", "Lương ngày lễ", "Tiền ăn", "Đi lại", "Chuyên cần", "Thâm niên", "Trách nhiệm", "Phụ cấp nhà ở", "Phụ cấp con", "Sinh nhật", "Thưởng doanh thu (KPI dịch vụ)", "Trừ vi phạm", "Tổng thu nhập", "KPI", "Ứng lương", "Thực lĩnh"]) ws.getCell(`${P[h]}${t}`).value = { formula: `SUM(${P[h]}${PAY_FIRST}:${P[h]}${last})`, result: 0 };
  for (let i = 1; i <= COLS.length; i++) { const cell = ws.getCell(t, i); cell.font = { bold: true }; cell.border = BORDER; cell.numFmt = MONEY; }
}
addSummary(book, {
  month: MM, year: YYYY, tag: TAG, payTab: "BẢNG LƯƠNG " + TAG, first: PAY_FIRST, last: PAY_FIRST + rowsOut.length - 1, letters: P, roles: [...new Set(rowsOut.map((p) => p.role))],
  info: [["Ngày công", "Ngày công tính lương"], ["Giờ tăng ca", "Giờ tăng ca"]],
  groups: [["Lương", ["Lương công", "Lương tăng ca", "Lương ca đêm", "Lương ngày lễ"]], ["Phụ cấp", ["Tiền ăn", "Đi lại", "Chuyên cần", "Thâm niên", "Trách nhiệm", "Phụ cấp nhà ở", "Phụ cấp con", "Sinh nhật"]], ["Thưởng", ["Thưởng doanh thu (KPI dịch vụ)", "KPI"]]],
});
addPayslip(book, {
  month: MM, year: YYYY, tag: TAG, payTab: "BẢNG LƯƠNG " + TAG, first: PAY_FIRST, last: PAY_FIRST + rowsOut.length - 1, letters: P,
  items: [
    ["Lương cơ bản", "Lương cơ bản", "money"], ["Lương thử việc", "Lương thử việc", "money"], ["Số ngày công", "Ngày công tính lương", "plain"], ["Số ngày lễ đi làm", "Ngày lễ đi làm", "plain"], ["Giờ tăng ca", "Giờ tăng ca", "plain"], ["Số ca đêm", "Số ca đêm", "plain"],
    ["Lương công", "Lương công", "money"], ["Lương tăng ca", "Lương tăng ca", "money"], ["Lương ca đêm", "Lương ca đêm", "money"], ["Lương ngày lễ", "Lương ngày lễ", "money"],
    ["Phụ cấp tiền ăn", "Tiền ăn", "money"], ["Phụ cấp đi lại", "Đi lại", "money"], ["Chuyên cần", "Chuyên cần", "money"], ["Thâm niên", "Thâm niên", "money"], ["Trách nhiệm", "Trách nhiệm", "money"], ["Phụ cấp nhà ở", "Phụ cấp nhà ở", "money"], ["Phụ cấp con", "Phụ cấp con", "money"], ["Sinh nhật", "Sinh nhật", "money"],
    ["Thưởng doanh thu", "Thưởng doanh thu (KPI dịch vụ)", "money"], ["Trừ vi phạm", "Trừ vi phạm", "money"], ["Tổng thu nhập", "Tổng thu nhập", "total"], ["KPI", "KPI", "money"], ["Ứng lương", "Ứng lương", "money"], ["Thực lĩnh", "Thực lĩnh", "total"],
  ],
});
await book.xlsx.writeFile(out);
console.log("người:", people.length, "dòng lương:", rowsOut.length);
console.log("VẤN ĐỀ:\n" + (problems.join("\n") || "không"));
