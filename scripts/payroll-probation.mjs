// Payroll workbook ("lương.xlsx": QUY TẮC, NHÂN SỰ, CHẤM CÔNG, BẢNG LƯƠNG, ...): no more "Lương thử việc" column, everybody is paid from "Lương cơ bản",
// and a day marked T in CHẤM CÔNG is paid 80% of the daily rate (a new input in QUY TẮC), a day marked X 100%.
//   node scripts/payroll-probation.mjs <in.xlsx> <out.xlsx>
import ExcelJS from "exceljs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: node scripts/payroll-probation.mjs <in.xlsx> <out.xlsx>");
const book = new ExcelJS.Workbook();
await book.xlsx.readFile(src);
const tab = (name) => { const w = book.getWorksheet(name); if (!w) throw new Error(`Không thấy tab ${name}.`); return w; };
const rules = tab("QUY TẮC"), cc = tab("CHẤM CÔNG"), pay = tab("BẢNG LƯƠNG");
const FIRST = 4, LAST = 33; // the people rows of CHẤM CÔNG and BẢNG LƯƠNG
const formulaOf = (cell) => { const m = cell.model; return m.formula ?? (m.sharedFormula ? cell.formula : null); }; // a shared formula is read translated for this cell, and written back as an explicit one
if (!/lương thử việc/i.test(String(pay.getCell("H3").value ?? ""))) throw new Error("H3 của BẢNG LƯƠNG không phải cột “Lương thử việc”: file khác với file dự kiến.");
let T0 = 1; while (T0 < 200 && !/^MÃ CHẤM CÔNG$/i.test(String(rules.getCell(T0, 1).value ?? ""))) T0++; // the title row of the code table: the new input takes its place and the table moves down a row
if (T0 >= 200 || rules.getCell(T0, 2).value !== null) throw new Error("QUY TẮC: không thấy tiêu đề bảng mã chấm công: file khác với file dự kiến.");

// 1. QUY TẮC: one more input above the code table
let end = T0 + 1; while (end < 300 && (rules.getCell(end, 1).value ?? "") !== "") end++;
for (let r = end; r >= T0; r--) for (let c = 1; c <= 4; c++) { const from = rules.getCell(r, c), to = rules.getCell(r + 1, c); to.value = from.value; to.style = { ...from.style }; }
const input = (c) => ({ ...rules.getCell(T0 - 1, c).style });
rules.getCell(T0, 1).value = "Thử việc (mã T): % đơn giá ngày"; rules.getCell(T0, 1).style = input(1);
rules.getCell(T0, 2).value = 0.8; rules.getCell(T0, 2).style = input(2); rules.getCell(T0, 2).numFmt = "0%";
rules.getCell(T0, 3).value = "Ngày chấm công T tính 80% đơn giá ngày (lương cơ bản / ngày công chuẩn), ngày chấm công X tính 100%"; rules.getCell(T0, 3).style = input(3);
for (let r = T0 + 1; r <= end + 1; r++) {
  const code = String(rules.getCell(r, 1).value ?? "").trim();
  if (code === "T") rules.getCell(r, 3).value = "1 ngày công, tính 80% đơn giá ngày, đếm riêng số ngày thử việc";
  if (code === "X") rules.getCell(r, 3).value = "1 ngày công, 100% đơn giá ngày";
}
const PERCENT = `'QUY TẮC'!$B$${T0}`;

// 2. CHẤM CÔNG: a counter of the T days after the last counter
const col = cc.getColumn("AO").number + 1, L = cc.getColumn(col).letter;
if (cc.getCell(3, col).value !== null) throw new Error(`CHẤM CÔNG: cột ${L} đã có dữ liệu.`);
cc.getColumn(col).width = cc.getColumn("AO").width;
for (let r = 3; r <= LAST; r++) cc.getCell(r, col).style = { ...cc.getCell(r, col - 1).style };
cc.getCell(3, col).value = "Ngày thử việc (T)";
for (let r = FIRST; r <= LAST; r++) cc.getCell(r, col).value = { formula: `COUNTIFS($D${r}:$AH${r},"T",$D$3:$AH$3,">0")` };
const tDays = (r) => `IFERROR(INDEX('CHẤM CÔNG'!$${L}$${FIRST}:$${L}$${LAST},MATCH($A${r},'CHẤM CÔNG'!$A$${FIRST}:$A$${LAST},0)),0)`;

// 3. BẢNG LƯƠNG: the daily rate always from G; lương công = rate x (days worked + leave) minus the 20% off the T days; column H empty and hidden (the other sheets keep their column letters)
let changedRate = 0;
const was = new Map(); // read every formula before writing any: a slave of a shared formula reads through its master, which this loop rewrites
for (let r = FIRST; r <= LAST; r++) was.set(r, { rate: formulaOf(pay.getCell(r, 9)), pay: formulaOf(pay.getCell(r, 19)) });
for (let r = FIRST; r <= LAST; r++) {
  const { rate: f, pay: sf } = was.get(r);
  if (f) {
    const g = f.replace(`IF('NHÂN SỰ'!$E${r}="THỬ VIỆC",H${r},G${r})`, `G${r}`).replace(new RegExp(`(^|[^A-Z$])H${r}(?![0-9])`, "g"), `$1G${r}`);
    if (g !== f) changedRate++;
    pay.getCell(r, 9).value = { formula: g };
  }
  if (sf !== `I${r}*(K${r}+L${r})`) { if (sf) throw new Error(`BẢNG LƯƠNG S${r}: công thức khác dự kiến (${sf}).`); continue; }
  pay.getCell(r, 19).value = { formula: `I${r}*(K${r}+L${r}-(1-${PERCENT})*${tDays(r)})` };
}
for (let r = FIRST; r <= LAST; r++) {
  const h = pay.getCell(r, 8), g = pay.getCell(r, 7);
  if (typeof h.value === "number" && h.value > 0) {
    if (g.value === null || g.value === "") { g.value = Math.round(h.value / 0.8); console.log(`Dòng ${r}: lương thử việc H ${h.value} (80%) đổi thành lương cơ bản G ${g.value}.`); }
    else console.log(`Dòng ${r}: lương thử việc H ${h.value} bị bỏ, giữ lương cơ bản G ${g.value}.`);
  }
  h.value = null;
}
pay.getCell("H3").value = null;
pay.getColumn(8).hidden = true;
book.calcProperties.fullCalcOnLoad = true;
await book.xlsx.writeFile(out);
console.log(`xong: ${changedRate} đơn giá ngày đã đổi sang lương cơ bản, cột ${L} của CHẤM CÔNG đếm ngày T, % thử việc ở QUY TẮC B${T0}.`);
