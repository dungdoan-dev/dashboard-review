// Night shift and overtime codes of the payroll workbook (QUY TẮC, NHÂN SỰ, CHẤM CÔNG, BẢNG LƯƠNG, KPI THEO GIỜ, TỔNG HỢP, PHIẾU LƯƠNG), as the manager asked:
//  - A12 (new) = a 12-hour shift: 8.5 hours of day work (1 công) + 3.5 hours of night work, paid +20% (night) and 150% (overtime)
//  - N stays = a night shift of 8.5 hours (1 công, night pay +20% on the 8.5 hours); N1, N2, N2.5, N3, N3.5 = a night shift with that many overtime hours (150%)
//  - overtime codes X1, X2, X2.5, X3, X3.5 (2.5 and 3.5 added, 4 gone for X and N); "X2,5" typed with a comma counts too
//  - TS (thai sản) is gone: its counter column now shows the night hours (N x 8.5 + A12 x 3.5)
// usage: node scripts/payroll-a12.mjs <in.xlsx> <out.xlsx>
import ExcelJS from "exceljs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: node scripts/payroll-a12.mjs <in.xlsx> <out.xlsx>");
const book = new ExcelJS.Workbook();
await book.xlsx.readFile(src);
const sheet = (name) => { const ws = book.getWorksheet(name); if (!ws) throw new Error(`Không thấy tab ${name}.`); return ws; };
const rules = sheet("QUY TẮC"), cc = sheet("CHẤM CÔNG"), pay = sheet("BẢNG LƯƠNG"), slip = sheet("PHIẾU LƯƠNG");

// the layout this was made for (CHẤM CÔNG: 31 day columns D..AH, then 7 counters AI..AO)
const expect = (cell, text) => { if (!String(cell.value ?? "").startsWith(text)) throw new Error(`${cell.worksheet.name}!${cell.address} không phải “${text}”: file có cấu trúc khác, chưa hỗ trợ.`); };
expect(cc.getCell("AK3"), "Thai sản"); expect(cc.getCell("AN3"), "Giờ tăng ca"); expect(cc.getCell("AO3"), "Số ca đêm"); expect(pay.getCell("Q3"), "Lương ca đêm"); expect(rules.getCell("A28"), "MÃ CHẤM CÔNG");

const A12_HOURS = "'QUY TẮC'!$B$28"; // night hours of one A12 shift (also its overtime hours)
const DAY_HOURS = "'QUY TẮC'!$B$6";  // hours of one N shift
const FIRST = 4, LAST = 33;

// 1. QUY TẮC: the hours of an A12 shift as an input cell, then the table of codes
const style = (a) => ({ ...rules.getCell(a).style });
const s = { title: style("A28"), headA: style("A29"), headB: style("B29"), headC: style("C29"), bodyA: style("A30"), bodyB: style("B30"), bodyC: style("C30"), labelA: style("A6"), input: style("B6"), noteC: style("C6") };
for (let r = 28; r <= 60; r++) for (let c = 1; c <= 3; c++) { const cell = rules.getCell(r, c); cell.value = null; cell.style = {}; }
const put = (r, vals, styles) => vals.forEach((v, i) => { const cell = rules.getCell(r, i + 1); cell.value = v; cell.style = styles[i]; });
put(28, ["Ca 12 giờ (A12): số giờ làm đêm mỗi ca", 3.5, "Cũng là số giờ tăng ca của ca đó: 8,5 giờ đầu là 1 công, 3,5 giờ sau tính tăng ca 150% và cộng thêm 20% làm đêm"], [s.labelA, s.input, s.noteC]);
rules.getCell("B28").numFmt = "0.0#";
rules.getCell("A9").value = "Làm đêm: % cộng thêm trên đơn giá giờ";
rules.getCell("C9").value = "Giờ làm đêm x đơn giá giờ x %. Ca N: 8,5 giờ (ô B6). Ca A12: 3,5 giờ (ô B28). Cộng thêm vào lương tăng ca 150%";
put(30, ["MÃ CHẤM CÔNG", null, null], [s.title, s.title, s.title]);
put(31, ["Mã", "Ý nghĩa", "Cách tính"], [s.headA, s.headB, s.headC]);
const codes = [
  ["X", "Đi làm đủ ca 8,5 giờ", "1 ngày công"], ["T", "Thử việc", "1 ngày công, đếm riêng số ngày thử việc"],
  ["PT", "Part time 5 giờ", "1 ngày công, trả theo giờ"], ["PT12", "Part time 12 giờ", "1 ngày công, trả theo giờ"],
  ["P", "Nghỉ phép năm", "Có lương, không tính vào ngày đi làm"], ["OFF", "Nghỉ không lương", "Không tính công"],
  ["N", "Ca đêm 8,5 giờ", "1 ngày công và 1 ca đêm: 8,5 giờ làm đêm cộng thêm 20%"],
  ["A12", "Ca 12 giờ", "1 ngày công (8,5 giờ làm ngày) + 3,5 giờ làm đêm: tính tăng ca 150% và cộng thêm 20% làm đêm"],
  ["X1", "Tăng ca 1 giờ", "1 ngày công và 1 giờ tăng ca"], ["X2", "Tăng ca 2 giờ", "1 ngày công và 2 giờ tăng ca"], ["X2.5", "Tăng ca 2,5 giờ", "1 ngày công và 2,5 giờ tăng ca (gõ X2.5 hoặc X2,5)"],
  ["X3", "Tăng ca 3 giờ", "1 ngày công và 3 giờ tăng ca"], ["X3.5", "Tăng ca 3,5 giờ", "1 ngày công và 3,5 giờ tăng ca (gõ X3.5 hoặc X3,5)"],
  ["N1", "Ca đêm tăng ca 1 giờ", "1 ca đêm và 1 giờ tăng ca"], ["N2", "Ca đêm tăng ca 2 giờ", "1 ca đêm và 2 giờ tăng ca"], ["N2.5", "Ca đêm tăng ca 2,5 giờ", "1 ca đêm và 2,5 giờ tăng ca (gõ N2.5 hoặc N2,5)"],
  ["N3", "Ca đêm tăng ca 3 giờ", "1 ca đêm và 3 giờ tăng ca"], ["N3.5", "Ca đêm tăng ca 3,5 giờ", "1 ca đêm và 3,5 giờ tăng ca (gõ N3.5 hoặc N3,5)"],
  ["CT", "Công tác", "1 ngày công"], ["DL", "Du lịch", "1 ngày công"], ["L", "Đi làm ngày lễ, hưởng 200%", "Không tính vào ngày công; trả riêng theo hệ số ngày lễ ở trên"],
];
codes.forEach((row, i) => put(32 + i, row, [s.bodyA, s.bodyB, s.bodyC]));
const codeRange = `'QUY TẮC'!$A$32:$A$${31 + codes.length}`;

// 2. CHẤM CÔNG: the TS counter column shows the night hours; worked days no longer subtract TS; overtime hours and night shifts from the codes
cc.getCell("AK3").value = "Giờ làm đêm (N, A12)";
cc.getCell("AO3").value = "Số ca đêm (N)";
for (let r = FIRST; r <= LAST; r++) {
  const rng = `$D${r}:$AH${r}`, days = "$D$3:$AH$3";
  const n = (code) => `COUNTIFS(${rng},"${code}",${days},">0")`; // a code under a day past the end of the month is not counted
  const dec = (prefix, h) => (Number.isInteger(h) ? n(`${prefix}${h}`) : `(${n(`${prefix}${h}`)}+${n(`${prefix}${String(h).replace(".", ",")}`)})`); // 2.5 or 2,5
  const hoursOf = [1, 2, 2.5, 3, 3.5].map((h) => `(${dec("X", h)}+${dec("N", h)})*${h}`).join("+");
  const f = (col, formula) => { cc.getCell(`${col}${r}`).value = { formula, result: 0 }; };
  f("AK", `AO${r}*${DAY_HOURS}+${n("A12")}*${A12_HOURS}`);
  f("AM", `IF($B${r}="",0,COUNT(${days})-AI${r}-AJ${r}-AL${r})`);
  f("AN", `${hoursOf}+${n("A12")}*${A12_HOURS}`);
  f("AO", `${n("N")}+${[1, 2, 2.5, 3, 3.5].map((h) => dec("N", h)).join("+")}`);
}
// a code that is not in the table (a typo, or X4 / N4 / TS that no longer exist) gets a warning instead of being silently ignored
for (let r = FIRST; r <= LAST; r++) for (let c = 4; c <= 34; c++) cc.getCell(r, c).dataValidation = { type: "list", allowBlank: true, formulae: [codeRange], showErrorMessage: true, errorStyle: "warning", errorTitle: "Mã chấm công", error: "Mã này không có trong bảng MÃ CHẤM CÔNG ở tab QUY TẮC (X4, N4 và TS không còn). Vẫn nhập?" };

// 3. BẢNG LƯƠNG: night pay is the night hours (N x 8.5 + A12 x 3.5, from CHẤM CÔNG) x hourly rate x 20%
pay.getCell("N3").value = "Số ca đêm (N)";
let changed = 0;
for (let r = FIRST; r <= LAST; r++) {
  const cell = pay.getCell(`Q${r}`), m = cell.model;
  if (m.sharedFormula || m.formula === undefined) continue; // an empty cell: nothing to fix
  if (m.shareType === "shared") throw new Error(`BẢNG LƯƠNG!Q${r} là công thức chung, chưa hỗ trợ.`);
  const old = `N${r}*'QUY TẮC'!$B$6`;
  if (!m.formula.includes(old)) throw new Error(`BẢNG LƯƠNG!Q${r} có công thức lạ: ${m.formula}`);
  const nightHours = `IFERROR(INDEX('CHẤM CÔNG'!$AK$4:$AK$33,MATCH($A${r},'CHẤM CÔNG'!$A$4:$A$33,0)),0)`;
  cell.value = { formula: m.formula.replace(old, nightHours), result: m.result };
  changed++;
}

// 4. PHIẾU LƯƠNG: the payslip shows the night hours, not the number of shifts
slip.getCell("B9").value = "Số giờ làm đêm (ca N, ca 12 giờ A12):";
const c9 = slip.getCell("C9");
if (!String(c9.model.formula ?? "").includes("$N$4:$N$33")) throw new Error("PHIẾU LƯƠNG!C9 có công thức lạ.");
c9.value = { formula: `IF($F$1="",0,IFERROR(INDEX('CHẤM CÔNG'!$AK$4:$AK$33,MATCH(INDEX('BẢNG LƯƠNG'!$A$4:$A$33,$F$1),'CHẤM CÔNG'!$A$4:$A$33,0)),0))`, result: 0 };

book.calcProperties.fullCalcOnLoad = true;
await book.xlsx.writeFile(out);
console.log(`ok: ${changed} công thức lương ca đêm sửa, ${codes.length} mã chấm công, ${out}`);
