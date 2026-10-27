// Links the KPI of each person (KPI THEO GIỜ, column J, from the hours worked) to "Thưởng doanh thu" of BẢNG LƯƠNG, so the bonus follows the KPI sheet instead of being typed.
// usage: node scripts/payroll-kpi-link.mjs <in.xlsx> <out.xlsx>
import ExcelJS from "exceljs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: node scripts/payroll-kpi-link.mjs <in.xlsx> <out.xlsx>");

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(src);
const pay = book.worksheets.find((w) => /^BẢNG LƯƠNG/.test(w.name)), kpi = book.worksheets.find((w) => /^KPI THEO GIỜ/.test(w.name));
if (!pay || !kpi) throw new Error("Không thấy tab BẢNG LƯƠNG hoặc KPI THEO GIỜ.");

const header = (ws, row, text) => { for (let c = 1; c <= ws.columnCount; c++) if (String(ws.getCell(row, c).value ?? "").trim() === text) return c; return 0; };
const bonus = header(pay, 3, "Thưởng doanh thu"), code = header(pay, 3, "Mã NV"), person = header(kpi, 26, "KPI");
if (!bonus || !code || !person) throw new Error("Không thấy cột “Thưởng doanh thu”, “Mã NV” hoặc “KPI” ở dòng tiêu đề.");
const L = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const first = 27, last = 56; // the person rows of KPI THEO GIỜ (a code in column A, the KPI in column J)
if (String(kpi.getCell(first, 1).formula ?? "").length === 0) throw new Error("A27 của KPI THEO GIỜ không phải công thức lấy mã từ NHÂN SỰ: kiểm tra lại cấu trúc.");

let done = 0;
for (let r = 4; r <= 33; r++) {
  const cell = pay.getCell(r, bonus);
  const kept = cell.value;
  cell.value = { formula: `ROUND(SUMIF('${kpi.name}'!$A$${first}:$A$${last},$${L(code)}${r},'${kpi.name}'!$${L(person)}$${first}:$${L(person)}$${last}),0)`, result: 0 };
  cell.fill = { type: "pattern", pattern: "none" }; // no longer typed: not a yellow input cell
  if (typeof kept === "number") done++;
}
const note = String(pay.getCell("A2").value ?? "");
pay.getCell("A2").value = note.replace("Thưởng doanh thu nhập tay.", "Thưởng doanh thu tự lấy từ cột KPI của tab KPI THEO GIỜ (gõ đè số vào ô nếu cần).");
book.calcProperties.fullCalcOnLoad = true;

await book.xlsx.writeFile(out);
console.log(`ok: ${done} ô thưởng doanh thu đang gõ tay được thay bằng công thức, ${out}`);
