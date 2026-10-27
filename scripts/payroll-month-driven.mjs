// Turns a payroll workbook built for one month (QUY TẮC, NHÂN SỰ, CHẤM CÔNG mm-yyyy, BẢNG LƯƠNG mm-yyyy, KPI THEO GIỜ, TỔNG HỢP, PHIẾU LƯƠNG) into one where the month typed in QUY TẮC!B4 drives everything:
// the attendance sheet always has 31 day columns, the ones past the end of the month are blank and greyed out and are not counted, the titles follow the month, and the tab names lose their "mm-yyyy".
// usage: node scripts/payroll-month-driven.mjs <in.xlsx> <out.xlsx>
import ExcelJS from "exceljs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: node scripts/payroll-month-driven.mjs <in.xlsx> <out.xlsx>");

const BASES = ["CHẤM CÔNG", "BẢNG LƯƠNG", "KPI THEO GIỜ", "TỔNG HỢP", "PHIẾU LƯƠNG"];
const MONTH = "'QUY TẮC'!$B$4";
const D0 = 4, OLD_D1 = 33, NEW_D1 = 34, OLD_C0 = 34, COUNTERS = 7; // days from column D; 30 old day columns, 31 new ones; the 7 counters sit right after the days
const FIRST = 4, LAST = 33; // the person rows
const letters = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const L = letters, num = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(src);

// 1. tab names without the month
const renames = new Map();
for (const ws of book.worksheets) {
  const m = ws.name.match(/^(.+?) \d\d-\d{4}$/);
  if (m && BASES.includes(m[1])) renames.set(ws.name, m[1]);
}
const cc = book.worksheets.find((w) => renames.get(w.name) === "CHẤM CÔNG");
if (!cc) throw new Error("Không thấy tab CHẤM CÔNG mm-yyyy.");
if (cc.getCell(3, OLD_D1).value !== 30) throw new Error("File này không phải bản 30 ngày (cột AG của CHẤM CÔNG không phải ngày 30).");

// 2. formulas of the other tabs: new tab names, and the references into the attendance columns that move one column to the right
const shiftCols = (ref) => ref.replace(/(\$?)([A-Z]{1,3})(\$?\d+)/g, (_, d, col, row) => `${d}${num(col) >= OLD_C0 ? L(num(col) + 1) : col}${row}`);
const rewrite = (formula) => {
  let f = formula;
  for (const [from, to] of renames) f = f.split(`'${from}'!`).join(`'${to}'!`);
  return f.replace(/('CHẤM CÔNG'!)(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)/g, (_, sheet, ref) => sheet + shiftCols(ref));
};
let rewritten = 0;
for (const ws of book.worksheets) {
  if (ws === cc) continue;
  ws.eachRow((row) => row.eachCell((cell) => {
    const dv = cell.dataValidation; // the drop-down of PHIẾU LƯƠNG lists the codes of the pay tab by name
    if (dv?.formulae?.some((x) => typeof x === "string" && rewrite(x) !== x)) cell.dataValidation = { ...dv, formulae: dv.formulae.map((x) => (typeof x === "string" ? rewrite(x) : x)) };
    const m = cell.model; // shared-formula followers have no text of their own and follow their first cell: only plain formulas are rewritten (the first cell of a shared group never points at a renamed tab, checked below)
    if (m.sharedFormula || m.formula === undefined) return;
    const f = rewrite(m.formula);
    if (f === m.formula) return;
    if (m.shareType === "shared") throw new Error(`${ws.name}!${cell.address}: formula chung trỏ tới tab đổi tên, chưa hỗ trợ.`);
    cell.value = { formula: f, result: m.result };
    rewritten++;
  }));
}

// 3. the attendance sheet: counters one column to the right, a 31st day column, header days from the month
const keep = [];
for (let r = 3; r <= LAST; r++) for (let c = OLD_D1; c <= OLD_C0 + COUNTERS - 1; c++) keep.push({ r, c, style: cc.getCell(r, c).style, value: cc.getCell(r, c).value });
const at = (r, c) => keep.find((k) => k.r === r && k.c === c);
for (let r = 3; r <= LAST; r++) {
  for (let c = OLD_C0 + COUNTERS; c >= NEW_D1; c--) cc.getCell(r, c).style = at(r, c === NEW_D1 ? OLD_D1 : c - 1).style; // day 31 looks like day 30, each counter like the one it replaces
}
for (let c = OLD_C0 + COUNTERS; c >= OLD_C0 + 1; c--) cc.getColumn(c).width = cc.getColumn(c - 1).width;
cc.getColumn(NEW_D1).width = cc.getColumn(OLD_D1).width;
const C = { off: NEW_D1 + 1, leave: NEW_D1 + 2, ts: NEW_D1 + 3, hol: NEW_D1 + 4, worked: NEW_D1 + 5, ot: NEW_D1 + 6, night: NEW_D1 + 7 };
for (let k = 0; k < COUNTERS; k++) cc.getCell(3, C.off + k).value = at(3, OLD_C0 + k).value; // the counter headers
cc.getCell(3, D0).value = 1;
for (let c = D0 + 1; c <= NEW_D1; c++) cc.getCell(3, c).value = { formula: `IF(${L(c - 1)}3="","",IF(${L(c - 1)}3<DAY(EOMONTH(${MONTH},0)),${L(c - 1)}3+1,""))`, result: c - D0 + 1 <= 30 ? c - D0 + 1 : "" };
for (let r = FIRST; r <= LAST; r++) cc.getCell(r, NEW_D1).value = null; // day 31 is an empty input cell (it held the first counter)
for (let r = FIRST; r <= LAST; r++) {
  const rng = `$${L(D0)}${r}:$${L(NEW_D1)}${r}`, days = `$${L(D0)}$3:$${L(NEW_D1)}$3`;
  const n = (code) => `COUNTIFS(${rng},"${code}",${days},">0")`; // a code typed under a day past the end of the month is not counted
  const f = (c, formula, result = 0) => { cc.getCell(r, c).value = { formula, result }; };
  f(C.off, n("OFF")); f(C.leave, n("P")); f(C.ts, n("TS")); f(C.hol, n("L"));
  f(C.worked, `IF($B${r}="",0,COUNT(${days})-${L(C.off)}${r}-${L(C.leave)}${r}-${L(C.ts)}${r}-${L(C.hol)}${r})`);
  f(C.ot, [1, 2, 3, 4].map((h) => `(${n("X" + h)}+${n("N" + h)})*${h}`).join("+"));
  f(C.night, ["N", "N1", "N2", "N3", "N4"].map(n).join("+"));
}
// the grey that marks the days past the end of the month, and the existing "empty row" rule over the wider table
for (const cf of cc.conditionalFormattings) cf.ref = cf.ref.replace(/:AN(\d+)$/, `:${L(C.night)}$1`);
cc.addConditionalFormatting({ ref: `${L(D0)}3:${L(NEW_D1)}${LAST}`, rules: [{ type: "expression", priority: 2, formulae: [`${L(D0)}$3=""`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD9D9D9" } }, font: { color: { argb: "FFD9D9D9" } } } }] });

// 4. names and titles
for (const [from, to] of renames) book.getWorksheet(from).name = to;
const title = (sheet, text) => { book.getWorksheet(sheet).getCell("A1").value = { formula: `"${text} "&TEXT(${MONTH},"mm/yyyy")`, result: "" }; };
title("QUY TẮC", "QUY TẮC TÍNH LƯƠNG THÁNG");
title("CHẤM CÔNG", "CHẤM CÔNG THÁNG");
title("BẢNG LƯƠNG", "BẢNG LƯƠNG THÁNG");
title("KPI THEO GIỜ", "KPI CHIA THEO SỐ GIỜ LÀM THÁNG");
title("TỔNG HỢP", "TỔNG HỢP LƯƠNG THÁNG");
const rules = book.getWorksheet("QUY TẮC");
rules.getCell("A4").value = "Tháng tính lương (chọn ngày bất kỳ trong tháng)";
rules.getCell("C4").value = "Đổi ô này thì CHẤM CÔNG tự đổi số ngày (28 đến 31), tiêu đề, thâm niên theo tháng mới. Xóa mã chấm công của tháng cũ trước khi nhập tháng mới";
book.calcProperties.fullCalcOnLoad = true;

await book.xlsx.writeFile(out);
console.log(`ok: ${renames.size} tab đổi tên, ${rewritten} công thức ở các tab khác được sửa, ${out}`);
