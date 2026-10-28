// The accountant's old monthly workbook "KT THU CHI SƠN TRÀ ĐN Tm_yyyy" (BK THU KS, BK CHI KS, DV Ngoài, the kho matrices, the weekly counts) -> the same data in the current template of the hotel's Google Sheet.
// The template is the live sheet exported as xlsx (its lists are cleared and refilled, its formulas, panels and guides stay); every total of the source is checked against the result and the script stops when one differs.
// usage: node scripts/convert-kt-thu-chi.mjs "<KT THU CHI file>" "<template.xlsx>" "<out.xlsx>" <yyyy-mm>
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const [srcPath, tplPath, outPath, month] = process.argv.slice(2);
if (!srcPath || !tplPath || !outPath || !/^\d{4}-\d{2}$/.test(month ?? "")) throw new Error('usage: node scripts/convert-kt-thu-chi.mjs "<KT THU CHI file>" "<template.xlsx>" "<out.xlsx>" <yyyy-mm>');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (name) => import(pathToFileURL(path.join(root, "src/lib", name)).href);
const { EXPENSE_RULES } = await lib("expense-rules.ts");
const { EXPENSES } = await lib("expense-kinds.ts");
const [YEAR, MM] = month.split("-").map(Number);
const FROM = Date.UTC(YEAR, MM - 1, 1), TO = Date.UTC(YEAR, MM, 0);

const src = XLSX.read(fs.readFileSync(srcPath));
const sheetOf = (re) => { const name = src.SheetNames.find((n) => re.test(n.normalize("NFC"))); if (!name) throw new Error(`Không thấy sheet ${re} trong file nguồn.`); return XLSX.utils.sheet_to_json(src.Sheets[name], { header: 1, defval: "" }); };
const book = new ExcelJS.Workbook();
await book.xlsx.readFile(tplPath);
const tab = (name) => { const ws = book.getWorksheet(name); if (!ws) throw new Error(`Mẫu không có tab ${name}.`); return ws; };

const day = (serial) => new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 864e5);
const isDate = (v) => typeof v === "number" && v > 40000 && v < 60000;
const inMonth = (d) => d.getTime() >= FROM && d.getTime() <= TO;
const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, "")) || 0);
const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const norm = (v) => text(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d");
const clear = (ws, r0, r1, cols) => { for (let r = r0; r <= Math.min(r1, ws.rowCount); r++) for (const c of cols) ws.getCell(r, c).value = null; }; // only the rows the sheet has
const report = [], checks = [];
const check = (label, got, want) => { checks.push(`${got === want ? "OK  " : "SAI "}${label}: ${got} (nguồn ${want})`); if (got !== want) throw new Error(`${label}: kết quả ${got}, nguồn ${want}`); };
const sum = (list, f) => Math.round(list.reduce((t, x) => t + f(x), 0));

// ---- BK THU: the template has one column of deposits of staying guests (cash) and no column for the bank ones, no visa column, no fee columns; the fees and discounts are in the two deduction columns
const thu = tab("BK THU");
const thuRows = sheetOf(/^BK THU KS$/i).slice(6).filter((r) => isDate(r[0]));
if (thuRows.length > 500) throw new Error("BK THU chỉ có 500 dòng.");
clear(thu, 5, 504, [...Array(15).keys()].map((i) => i + 1).concat([17, 18, 19]));
thuRows.forEach((r, i) => {
  const row = thu.getRow(5 + i), set = (c, v) => { if (v !== "" && v != null && v !== 0) row.getCell(c).value = v; };
  row.getCell(1).value = day(r[0]);
  set(2, text(r[1])); set(3, text(r[2])); set(4, text(r[3])); set(5, text(r[4])); set(6, text(r[5])); set(7, text(r[6]));
  set(8, num(r[7])); set(9, num(r[9])); set(10, num(r[10])); set(11, num(r[11])); set(12, num(r[12])); set(13, num(r[13]));
  set(17, num(r[15])); set(18, num(r[16]) + num(r[17]));
});
thu.getCell("I1").value = new Date(FROM);
const droppedBank = sum(thuRows, (r) => num(r[8])), droppedVisa = sum(thuRows, (r) => num(r[14]));
report.push(`BK THU: ${thuRows.length} dòng`);
if (droppedBank || droppedVisa) report.push(`  KHÔNG chép (mẫu không có cột): cọc tiền TK đã ở ${droppedBank} (${thuRows.filter((r) => num(r[8])).length} dòng), tiền TK thẻ visa ${droppedVisa}`);

// ---- BK CHI: the old categories become the 16 kinds of the template; a line the table does not know is filed by its words
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/apps-script/hang-muc-chi.gs"), "utf8") + "\nthis.KC_match = KC_match;", sandbox);
const kindName = Object.fromEntries(EXPENSES.map(([code, n]) => [code, n]));
const OLD_KIND = {
  "Phí quẹt thẻ": "CP11", "Chi sửa chữa": "CP03", "Chi bồi thường KH": "CP17", "Chi tiền điện nước": "CP11", "Chi DV thuê xe": "CP12", "Chi nộp BHXH": "CP10", "Chi lương nv": "CP10",
  "Chi thưởng nv": "CP10", "Chi DV kế toán": "CP12", "Chi hoàn tiền KH": "CP16", "Chi hoa hồng nền tảng": "CP13", "Chi mua minibar": "CP07", "Chi marketing": "CP13", "Casual HK": "CP12",
  "Chi vật tư": "CP07", "Chi mua đồ dùng KS ( CCDC)": "CP02", "Chi bảo dưỡng tài sản": "CP03", "Chi thuế nhà thầu": "CP14", "Chi thuê khác sạn": "CP09", "Chi làm giấy tờ, chữ ký số..., vận hành": "CP14",
};
const chi = tab("BK CHI");
const chiRows = sheetOf(/^BK CHI KS$/i).slice(6).filter((r) => isDate(r[0]));
clear(chi, 5, 504, [1, 2, 3, 4, 5, 6, 7]);
const byContent = [];
chiRows.forEach((r, i) => {
  const row = chi.getRow(5 + i), old = text(r[1]);
  let kind = OLD_KIND[old] ? kindName[OLD_KIND[old]] : null;
  if (!kind) { kind = sandbox.KC_match(text(r[2]), EXPENSE_RULES) ?? kindName.CP19; byContent.push(`${old} | ${text(r[2]).slice(0, 50)} -> ${kind}`); }
  row.getCell(1).value = day(r[0]); row.getCell(2).value = kind; row.getCell(3).value = text(r[2]);
  [3, 4, 5].forEach((c, k) => { if (num(r[c])) row.getCell(4 + k).value = num(r[c]); });
  if (text(r[8])) row.getCell(7).value = text(r[8]);
});
chi.getCell("G1").value = new Date(FROM);
report.push(`BK CHI: ${chiRows.length} dòng`, ...byContent.map((o) => "  gán theo nội dung: " + o));

// ---- DV NGOÀI
const dv = tab("DV NGOÀI");
const dvRows = sheetOf(/^DV Ngo/i).slice(3).filter((r) => isDate(r[0]) && text(r[3]));
clear(dv, 4, 1000, [1, 2, 3, 4, 5, 6, 7, 9, 10]);
dvRows.forEach((r, i) => {
  const row = dv.getRow(4 + i);
  row.getCell(1).value = day(r[0]); if (text(r[1])) row.getCell(2).value = text(r[1]); row.getCell(3).value = text(r[2]); row.getCell(4).value = text(r[3]); row.getCell(5).value = text(r[4]);
  row.getCell(6).value = num(r[5]); row.getCell(7).value = num(r[6]); row.getCell(9).value = num(r[8]); if (text(r[9])) row.getCell(10).value = text(r[9]);
});
report.push(`DV NGOÀI: ${dvRows.length} đơn`);

// ---- kho: the matrices of the accountant (an item per column or per row) become the three lists of each kho tab; items are matched by position with the template's item list (names that differ are reported)
const itemsOf = (ws) => { const out = []; for (let r = 5; r <= 80; r++) { const n = text(ws.getCell(r, 20).value); if (!n || /^cộng$/i.test(n)) break; out.push(n); } return out; };
const warnNames = (label, sourceNames, templateNames) => sourceNames.forEach((n, i) => { if (norm(n) !== norm(templateNames[i])) report.push(`  tên khác (${label}): nguồn “${text(n)}” ↔ mẫu “${templateNames[i]}”`); });
const week = (w) => { const jan4 = new Date(Date.UTC(YEAR, 0, 4)), monday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5; return new Date(monday + (w - 1) * 7 * 864e5 + 6 * 864e5); }; // Sunday of ISO week w
const khoNames = { MINIBAR: itemsOf(tab("MINIBAR")), AMEN: itemsOf(tab("AMENITIES")), VT: itemsOf(tab("VẬT TƯ")), VAI: itemsOf(tab("ĐỒ VẢI")) };
const lines = { MINIBAR: { in: [], out: [], count: [] }, AMENITIES: { in: [], out: [], count: [] }, "VẬT TƯ": { in: [], out: [], count: [] }, "ĐỒ VẢI": { in: [], out: [], count: [] } };
const amenAll = [...khoNames.AMEN, ...khoNames.VT];
const own = (i) => (i < khoNames.AMEN.length ? ["AMENITIES", i, khoNames.AMEN] : ["VẬT TƯ", i - khoNames.AMEN.length, khoNames.VT]);

// nhập: dated pairs (quantity, amount) to the right of a total pair; an item whose total is more than its dated pairs gets the rest on the first day of the month
const receipts = (rows, dateRow, firstItemRow, nItems, names, put) => {
  const dates = []; rows[dateRow].forEach((v, c) => { if (c >= 4 && isDate(v)) dates.push([c, day(v)]); });
  for (let k = 0; k < nItems; k++) {
    const r = rows[firstItemRow + k]; if (!r || !text(r[1])) throw new Error(`Nhập kho: thiếu mặt hàng thứ ${k + 1}.`);
    let qty = 0, amount = 0;
    for (const [c, d] of dates) if (num(r[c]) || num(r[c + 1])) { put(k, d, num(r[c]), num(r[c + 1])); qty += num(r[c]); amount += num(r[c + 1]); }
    if (num(r[2]) - qty > 0.001 || num(r[3]) - amount > 1) put(k, new Date(FROM), num(r[2]) - qty, num(r[3]) - amount);
  }
  warnNames("nhập", Array.from({ length: nItems }, (_, k) => rows[firstItemRow + k][1]), names);
};
const mini = sheetOf(/^Nh.p kho MINIBAR\.$/i); // the visible sheet ends with a dot; a hidden copy has none
receipts(mini, 2, 4, khoNames.MINIBAR.length, khoNames.MINIBAR, (k, d, q, a) => lines.MINIBAR.in.push({ d, item: khoNames.MINIBAR[k], q, a }));
const amen = sheetOf(/^Nh.p kho AMENIES\.$/i);
receipts(amen, 1, 4, amenAll.length, amenAll, (k, d, q, a) => { const [sheet, i, names] = own(k); lines[sheet].in.push({ d, item: names[i], q, a }); });

// xuất: a row per day, an item per column, the room beside
// the date is written only on the first row of a day; the rows under it belong to that day
// a day typed with a wrong month (e.g. 25/07 in the August sheet) keeps its day number in the converted month
const datedRows = (rows) => {
  let d = null;
  return rows.slice(3).flatMap((r) => {
    if (isDate(r[0])) {
      d = day(r[0]);
      if (!inMonth(d)) { const fixed = new Date(Date.UTC(YEAR, MM - 1, d.getUTCDate())), note = `  ngày gõ sai tháng: ${d.toISOString().slice(0, 10)} → ${fixed.toISOString().slice(0, 10)}`; if (!report.includes(note)) report.push(note); d = fixed; }
    }
    return d ? [[d, r]] : [];
  });
};
const issues = (rows, itemCols, roomCol, put) => {
  for (const [d, r] of datedRows(rows)) itemCols.forEach((c, k) => { if (num(r[c])) put(k, d, r[roomCol], num(r[c])); });
};
const xm = sheetOf(/^Xu.t kho MINIBAR$/i);
const miniCols = Array.from({ length: khoNames.MINIBAR.length }, (_, k) => 1 + k);
warnNames("xuất minibar", miniCols.map((c) => xm[1][c]), khoNames.MINIBAR);
issues(xm, miniCols, 12, (k, d, room, q) => lines.MINIBAR.out.push({ d, room, item: khoNames.MINIBAR[k], q }));
const xa = sheetOf(/^Xu.t kho AMENIES$/i);
const amenCols = [...Array.from({ length: khoNames.AMEN.length }, (_, k) => 1 + k), ...Array.from({ length: 11 }, (_, k) => 6 + k), ...Array.from({ length: 10 }, (_, k) => 18 + k)];
if (amenCols.length !== amenAll.length) throw new Error(`Xuất kho AMENIES: ${amenCols.length} cột mặt hàng, mẫu có ${amenAll.length}.`);
issues(xa, amenCols, 17, (k, d, room, q) => { const [sheet, i, names] = own(k); lines[sheet].out.push({ d, room, item: names[i], q }); });

// kiểm kê: a column per week, dated the Sunday of the week; blank = not counted, 0 = counted zero
const counts = (rows, nameCol, firstWeekCol, headRow, firstRow, nItems, put) => {
  const w0 = Number(String(rows[headRow][firstWeekCol]).match(/\d+/)?.[0]);
  for (let k = 0; k < nItems; k++) for (let j = 0; j < 5; j++) { const v = rows[firstRow + k]?.[firstWeekCol + j]; if (v === "" || v == null) continue; const d = week(w0 + j); if (inMonth(d)) put(k, d, num(v)); }
};
const kk = sheetOf(/^B.ng ki.m k. MN, AM$/i);
counts(kk, 1, 2, 1, 3, khoNames.MINIBAR.length, (k, d, q) => lines.MINIBAR.count.push({ d, item: khoNames.MINIBAR[k], q }));
counts(kk, 10, 11, 1, 3, amenAll.length, (k, d, q) => { const [sheet, i, names] = own(k); lines[sheet].count.push({ d, item: names[i], q }); });
warnNames("kiểm kê minibar", khoNames.MINIBAR.map((_, k) => kk[3 + k][1]), khoNames.MINIBAR);
warnNames("kiểm kê amenities", amenAll.map((_, k) => kk[3 + k][10]), amenAll);

// đồ vải: opening = "SL tồn đầu kỳ", what spoiled is an issue and the count a count, both dated the last day of the month
const vai = sheetOf(/^KK .* v.i$/i).slice(2).filter((r) => text(r[1]));
if (vai.length < khoNames.VAI.length) throw new Error(`KK đồ vải: ${vai.length} mặt hàng, mẫu có ${khoNames.VAI.length}.`);
const monthEnd = new Date(TO);
khoNames.VAI.forEach((item, k) => { const r = vai[k]; if (num(r[4])) lines["ĐỒ VẢI"].out.push({ d: monthEnd, room: "", item, q: num(r[4]) }); if (r[6] !== "") lines["ĐỒ VẢI"].count.push({ d: monthEnd, item, q: num(r[6]) }); });
warnNames("đồ vải", vai.slice(0, khoNames.VAI.length).map((r) => r[1]), khoNames.VAI);
const vaiTpl = tab("ĐỒ VẢI");
khoNames.VAI.forEach((_, k) => { vaiTpl.getCell(5 + k, 23).value = num(vai[k][2]); }); // Tồn đầu (SL)

// write the lists
for (const [name, l] of Object.entries(lines)) {
  const ws = tab(name);
  clear(ws, 5, 1504, [1, 2, 3, 4, 5]); clear(ws, 5, 6004, [7, 8, 9, 10, 11]); clear(ws, 5, 1504, [13, 14, 15, 16]);
  l.in.forEach((x, i) => { const r = 5 + i; ws.getCell(r, 1).value = x.d; ws.getCell(r, 2).value = x.item; ws.getCell(r, 3).value = x.q; ws.getCell(r, 4).value = x.a; });
  l.out.forEach((x, i) => { const r = 5 + i; ws.getCell(r, 7).value = x.d; if (x.room !== "" && x.room != null) ws.getCell(r, 8).value = typeof x.room === "number" ? x.room : text(x.room); ws.getCell(r, 9).value = x.item; ws.getCell(r, 10).value = x.q; });
  l.count.forEach((x, i) => { const r = 5 + i; ws.getCell(r, 13).value = x.d; ws.getCell(r, 14).value = x.item; ws.getCell(r, 15).value = x.q; });
  ws.getCell("U2").value = new Date(FROM);
  report.push(`${name}: ${l.in.length} dòng nhập, ${l.out.length} dòng xuất, ${l.count.length} dòng kiểm kê`);
}

// ---- every total of the source is found again in the result
const column = (ws, r0, n, c) => sum([...Array(n).keys()], (i) => num(ws.getCell(r0 + i, c).value));
for (const [label, to, from] of [["cọc tiền mặt đã ở", 8, 7], ["tiền mặt", 9, 9], ["cọc TM chưa ở", 10, 10], ["tiền TK", 11, 11], ["cọc TK chưa ở", 12, 12], ["quẹt thẻ", 13, 13], ["hoa hồng", 17, 15]]) check(`BK THU ${label}`, column(thu, 5, thuRows.length, to), sum(thuRows, (r) => num(r[from])));
check("BK THU phí quẹt + giảm giá phòng", column(thu, 5, thuRows.length, 18), sum(thuRows, (r) => num(r[16]) + num(r[17])));
check("BK CHI tiền mặt", column(chi, 5, chiRows.length, 4), sum(chiRows, (r) => num(r[3])));
check("BK CHI chuyển khoản", column(chi, 5, chiRows.length, 5), sum(chiRows, (r) => num(r[4])));
check("BK CHI visa", column(chi, 5, chiRows.length, 6), sum(chiRows, (r) => num(r[5])));
check("DV NGOÀI giá bán", column(dv, 4, dvRows.length, 7), sum(dvRows, (r) => num(r[6])));
const xmTotal = sum(datedRows(xm), ([, r]) => miniCols.reduce((t, c) => t + num(r[c]), 0));
check("MINIBAR xuất (số lượng)", sum(lines.MINIBAR.out, (x) => x.q), xmTotal);
const xaTotal = sum(datedRows(xa), ([, r]) => amenCols.reduce((t, c) => t + num(r[c]), 0));
// the sheet's own "Xuất trong kỳ" row (row 3) is an independent total per item
check("MINIBAR xuất theo dòng tổng của nguồn", xmTotal, sum(miniCols, (c) => num(xm[2][c])));
// AMENITIES / VẬT TƯ: a few totals of the source were typed by hand without a line behind them; they are reported, not invented into lines
amenCols.forEach((c, k) => { const lined = sum(lines[own(k)[0]].out.filter((x) => x.item === own(k)[2][own(k)[1]]), (x) => x.q); if (lined !== num(xa[2][c])) report.push(`  dòng tổng “Xuất ra” của nguồn khác các dòng: ${own(k)[2][own(k)[1]]} dòng ${lined}, tổng ${num(xa[2][c])}`); });
check("AMENITIES + VẬT TƯ xuất (số lượng)", sum(lines.AMENITIES.out, (x) => x.q) + sum(lines["VẬT TƯ"].out, (x) => x.q), xaTotal);

book.calcProperties.fullCalcOnLoad = true;
await book.xlsx.writeFile(outPath);
console.log(outPath);
console.log(report.join("\n"));
console.log(checks.join("\n"));
