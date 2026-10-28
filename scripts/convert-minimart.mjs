// The accountant's old workbook of the mini mart "KT THU CHI MINI MART SƠN TRÀ ĐN Tm_yyyy" (one sheet THU CHI MINIMART: the thu table on the left, the chi table beside it) -> the same data in the current THU MINIMART and CHI MINIMART tabs of the Ăn sáng, cafe, mini mart Google Sheet.
// The template is that live sheet exported as xlsx (formulas, panels, guides stay; only the lists are cleared and refilled). Every total of the source is checked against the result; the script stops when one differs.
// usage: node scripts/convert-minimart.mjs "<KT THU CHI MINI MART file>" "<template.xlsx>" "<out.xlsx>" <yyyy-mm>
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const [srcPath, tplPath, outPath, month] = process.argv.slice(2);
if (!srcPath || !tplPath || !outPath || !/^\d{4}-\d{2}$/.test(month ?? "")) throw new Error('usage: node scripts/convert-minimart.mjs "<KT THU CHI MINI MART file>" "<template.xlsx>" "<out.xlsx>" <yyyy-mm>');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { EXPENSE_RULES } = await import(pathToFileURL(path.join(root, "src/lib/expense-rules.ts")).href);
const [YEAR, MM] = month.split("-").map(Number);
const FROM = Date.UTC(YEAR, MM - 1, 1), TO = Date.UTC(YEAR, MM, 0);

const src = XLSX.read(fs.readFileSync(srcPath));
const sheetName = src.SheetNames.find((n) => /^THU CHI MINIMART$/i.test(n.normalize("NFC").trim()));
if (!sheetName) throw new Error("Không thấy sheet THU CHI MINIMART trong file nguồn.");
const rows = XLSX.utils.sheet_to_json(src.Sheets[sheetName], { header: 1, defval: "" });
const book = new ExcelJS.Workbook();
await book.xlsx.readFile(tplPath);
const tab = (name) => { const ws = book.getWorksheet(name); if (!ws) throw new Error(`Mẫu không có tab ${name}.`); return ws; };

const day = (serial) => new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 864e5);
const isDate = (v) => typeof v === "number" && v > 40000 && v < 60000;
const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, "")) || 0);
const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const norm = (v) => text(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d");
const report = [], checks = [];
const check = (label, got, want) => { checks.push(`${got === want ? "OK  " : "SAI "}${label}: ${got} (nguồn ${want})`); if (got !== want) throw new Error(`${label}: kết quả ${got}, nguồn ${want}`); };
const sum = (list, f) => Math.round(list.reduce((t, x) => t + f(x), 0));
const clear = (ws, r0, r1, cols) => { for (let r = r0; r <= Math.min(r1, ws.rowCount); r++) for (const c of cols) ws.getCell(r, c).value = null; };
const inMonth = (serial) => { const t = day(serial).getTime(); return t >= FROM && t <= TO; };
const FIRST = 5, LAST = 504; // the rows the template's totals and formulas cover

// ---- THU MINIMART: the columns are the same (A..I); the source has its own totals on row 5 and the lines from row 6; a line with only a date is an empty line
const thu = tab("THU MINIMART");
const thuRows = rows.slice(5).filter((r) => r.slice(1, 9).some((v) => v !== ""));
if (thuRows.length > LAST - FIRST + 1) throw new Error("THU MINIMART chỉ có 500 dòng.");
for (const r of thuRows) if (r[0] !== "" && (!isDate(r[0]) || !inMonth(r[0]))) throw new Error(`Ngày thu ngoài tháng ${month}: ${JSON.stringify(r.slice(0, 9))}`);
clear(thu, FIRST, LAST, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
thuRows.forEach((r, i) => {
  const row = thu.getRow(FIRST + i);
  row.getCell(1).value = new Date(isDate(r[0]) ? day(r[0]).getTime() : FROM);
  if (!isDate(r[0])) report.push(`  dòng thu không có ngày, ghi ngày 01/${String(MM).padStart(2, "0")}: ${JSON.stringify(r.slice(1, 9).filter((v) => v !== ""))}`);
  if (text(r[1])) row.getCell(2).value = text(r[1]);
  for (let c = 2; c <= 7; c++) if (r[c] !== "" && num(r[c]) !== 0) row.getCell(1 + c).value = num(r[c]);
  if (text(r[8])) row.getCell(9).value = text(r[8]);
});
thu.getCell("I1").value = new Date(FROM);
report.push(`THU MINIMART: ${thuRows.length} dòng`);

// ---- CHI MINIMART: the old categories become the kinds of the template's list (Danh mục, column L); a category the table does not know is filed by the words of the line
const kinds = []; { const d = tab("Danh mục"); for (let r = 2; r <= 30; r++) { const v = text(d.getCell(r, 12).value); if (v) kinds.push(v); } }
const kind = (name) => { const k = kinds.find((x) => norm(x) === norm(name)); if (!k) throw new Error(`Mẫu không có hạng mục chi “${name}”.`); return k; };
const OLD_KIND = {
  "mua hang hoa nk": "Chi mua hàng hóa", "chi maketing": "Chi Marketing", "chi khac": "Chi khác", "chi phi khac": "Chi khác", "chi quan ly,van hanh": "Chi quản lý, Vận hành", "chi quan ly, van hanh": "Chi quản lý, Vận hành",
  "chi vat tu": "Chi bao bì – Vật tư", "chi mua tscd": "Chi đầu tư TSCĐ", "chi mua do dung ( ccdc)": "Chi mua đồ dùng – CCDC", "chi sua chua": "Chi sửa chữa – Bảo dưỡng", "chi bao duong tai san": "Chi sửa chữa – Bảo dưỡng",
  "chi khai truong, su kien": "Chi khai trương – Sự kiện", "chi trang tri quan": "Chi khai trương – Sự kiện", "chi ve sinh": "Chi dịch vụ ngoài - phần mềm ql", "phi quet the": "Chi điện nước – Viễn thông, phí dv",
  "chi luong nv": "Chi nhân sự – BHXH – Phúc lợi", "chi thuong nv": "Chi nhân sự – BHXH – Phúc lợi", "chi ung luong": "Chi nhân sự – BHXH – Phúc lợi", "chi qua tet": "Chi nhân sự – BHXH – Phúc lợi", "chi phuc loi": "Chi nhân sự – BHXH – Phúc lợi",
  "chi nop bhxh": "Chi nhân sự – BHXH – Phúc lợi", "chi du lich": "Chi nhân sự – BHXH – Phúc lợi", "chi phi nhan su": "Chi nhân sự – BHXH – Phúc lợi", "chi dv ngoai": "Chi dịch vụ ngoài - phần mềm ql", "chi hoan tien kh": "Chi hoàn tiền khách hàng", "luan chuyen tien": "Chi rút tiền – Điều chuyển tiền",
};
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/apps-script/hang-muc-chi.gs"), "utf8") + "\nthis.KC_match = KC_match;", sandbox);
const chi = tab("CHI MINIMART");
const chiRows = rows.slice(5).filter((r) => r.slice(10, 14).some((v) => v !== "")); // a line with only a date is an empty line
if (chiRows.length > LAST - FIRST + 1) throw new Error("CHI MINIMART chỉ có 500 dòng.");
for (const r of chiRows) if (!isDate(r[9]) || !inMonth(r[9])) throw new Error(`Ngày chi ngoài tháng ${month} hoặc không có ngày: ${JSON.stringify(r.slice(9, 14))}`);
clear(chi, FIRST, LAST, [1, 2, 3, 4, 5, 6, 7]);
const byContent = [];
chiRows.forEach((r, i) => {
  const row = chi.getRow(FIRST + i), old = text(r[10]);
  let k = OLD_KIND[norm(old)] ? kind(OLD_KIND[norm(old)]) : null;
  if (!k) { k = sandbox.KC_match(text(r[11]), EXPENSE_RULES) ?? kind("Chi khác"); byContent.push(`${old || "(trống)"} | ${text(r[11]).slice(0, 50)} -> ${k}`); }
  row.getCell(1).value = new Date(day(r[9]).getTime()); row.getCell(2).value = k; row.getCell(3).value = text(r[11]);
  if (num(r[12])) row.getCell(4).value = num(r[12]);
  if (num(r[13])) row.getCell(5).value = num(r[13]);
});
chi.getCell("G1").value = new Date(FROM);
report.push(`CHI MINIMART: ${chiRows.length} dòng`, ...byContent.map((o) => "  gán theo nội dung: " + o));

// the opening balances belong to the month before: the template's are those of its own month, and the source has no opening balance
thu.getCell("M1").value = 0; thu.getCell("Q1").value = 0;
report.push("  Đầu kỳ tiền mặt và Đầu kỳ ngân hàng (THU MINIMART M1, Q1) đặt 0: file nguồn không có số dư đầu kỳ, nhập lại cho đúng");

// ---- every total of the source (row 5 of each table) is found again in the result
const column = (ws, c, n) => sum([...Array(n).keys()], (i) => num(ws.getCell(FIRST + i, c).value));
[["tiền mặt", 3, 2], ["tài khoản", 4, 3], ["Shopee Food", 5, 4], ["Grab Food", 6, 5], ["hàng huỷ", 7, 6], ["thuê phao", 8, 7]].forEach(([label, to, from]) => check(`THU ${label}`, column(thu, to, thuRows.length), sum([rows[4]], (r) => num(r[from]))));
check("CHI tiền mặt", column(chi, 4, chiRows.length), sum([rows[4]], (r) => num(r[12])));
check("CHI tài khoản", column(chi, 5, chiRows.length), sum([rows[4]], (r) => num(r[13])));
check("CHI tiền mặt (các dòng nguồn)", column(chi, 4, chiRows.length), sum(chiRows, (r) => num(r[12])));
check("CHI tài khoản (các dòng nguồn)", column(chi, 5, chiRows.length), sum(chiRows, (r) => num(r[13])));

// the file is the whole template: the café's tabs (the template carries another unit's data) are emptied of their lists and hidden, to unhide when the branch has a café too.
// Emptied: the typed lists (BK THU A–L and N, BK CHI A–G, kho: nhập A–E, xuất G–K, kiểm kê M–P, tồn đầu W–X); kept: formulas, the panels, the item catalogue (R–V).
const cafe = [["BK THU", [...Array(12).keys()].map((i) => i + 1).concat([14]), 504], ["BK CHI", [1, 2, 3, 4, 5, 6, 7], 504], ...["NGUYÊN LIỆU CAFE", "NGUYÊN LIỆU ĂN SÁNG", "VẬT TƯ"].map((n) => [n, [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 23, 24], 6004])];
for (const [name, cols, last] of cafe) { const ws = tab(name); clear(ws, FIRST, last, cols); ws.state = "hidden"; }
tab("BK THU").getCell("I1").value = new Date(FROM); tab("BK CHI").getCell("G1").value = new Date(FROM);
for (const n of ["NGUYÊN LIỆU CAFE", "NGUYÊN LIỆU ĂN SÁNG", "VẬT TƯ"]) tab(n).getCell("U4").value = new Date(FROM);
tab("BK THU").getCell("E1").value = "Ăn sáng, Cafe Sơn Trà ĐN"; tab("BK CHI").getCell("D1").value = "Ăn sáng, Cafe Sơn Trà ĐN";
report.push("  Tab Ăn sáng, cafe (BK THU, BK CHI, 3 tab kho) để trống và ẩn");
book.views = [{ ...(book.views?.[0] ?? {}), activeTab: book.worksheets.findIndex((w) => w.name === "THU MINIMART") }];
book.calcProperties.fullCalcOnLoad = true;
await book.xlsx.writeFile(outPath);
console.log(outPath);
console.log(report.join("\n"));
console.log(checks.join("\n"));
