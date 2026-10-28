// Builds the payroll formulas of the QNS rules into a payroll workbook ("BẢNG LƯƠNG QNS", "BẢNG LƯƠNG VGL …": the accountant's template with the month-driven tabs), from the rules and notes of the QNS QUY TẮC tab:
//  - overtime 150% (B7) is for FO, HK, CF and not for AN (an ninh); part time overtime is a fixed amount per hour (B8, e.g. 23.000/giờ)
//  - night shift (code N, B9 = amount per hour) is paid to AN only: night shifts x 8,5 hours x B9
//  - part time attendance bonus (B16) needs the number of days in the new row 28 (29)
//  - ca gãy (code G, 10 hours): counts as a working day and gets 2 meals (row 29) instead of 1
//  - holiday work (code L): coefficient B10 for full time (300%), B11 for part time; the day is out of the working days
//  - KPI of a source (KPI THEO GIỜ column E) can go to several positions ("FO + AN"): shared by hours worked; Mart: FO + AN, Ăn sáng cafe: ascf
//  - codes: X1, X1,5 … X3,5 and the same with N (decimals typed with "." or ","), TS and 4 hours are gone, G added
// The roster (NHÂN SỰ) says who is part time (Hình thức) and who is an AN (Chức vụ equal to, or starting with, the word in QUY TẮC B30).
// usage: node scripts/payroll-qns.mjs <in.xlsx> <out.xlsx>
import ExcelJS from "exceljs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: node scripts/payroll-qns.mjs <in.xlsx> <out.xlsx>");
const book = new ExcelJS.Workbook();
await book.xlsx.readFile(src);
const sheet = (name) => { const ws = book.getWorksheet(name); if (!ws) throw new Error(`Không thấy tab ${name}.`); return ws; };
const rules = sheet("QUY TẮC"), cc = sheet("CHẤM CÔNG"), pay = sheet("BẢNG LƯƠNG"), kpi = sheet("KPI THEO GIỜ"), slip = sheet("PHIẾU LƯƠNG");

// the layout this was made for
const expect = (cell, text) => { if (!String(cell.value ?? "").startsWith(text)) throw new Error(`${cell.worksheet.name}!${cell.address} không phải “${text}”: file có cấu trúc khác, chưa hỗ trợ.`); };
expect(rules.getCell("A8"), "Tăng ca part time"); expect(rules.getCell("A9"), "Ca đêm"); expect(rules.getCell("A16"), "Chuyên cần part time"); expect(rules.getCell("A28"), "MÃ CHẤM CÔNG"); expect(rules.getCell("A29"), "Mã");
expect(cc.getCell("AK3"), "Thai sản"); expect(cc.getCell("AN3"), "Giờ tăng ca"); expect(pay.getCell("P3"), "Lương tăng ca"); expect(pay.getCell("AK3"), "Ghi chú"); expect(kpi.getCell("B3"), "Nguồn KPI");
const FIRST = 4, LAST = 33;
const Q = (cell) => `'QUY TẮC'!$B$${cell}`;
const CODES0 = 33; // first row of the code table after the three new rows

// 1. QUY TẮC: the amounts per hour as numbers, the notes the rules rely on, three new inputs, and the code table (the same table whatever the file had)
const positions = new Set(Array.from({ length: LAST - FIRST + 1 }, (_, i) => String(book.getWorksheet("NHÂN SỰ").getCell(FIRST + i, 3).value ?? "").trim().toUpperCase()).filter(Boolean));
const FO = positions.has("LỄ TÂN") && !positions.has("FO") ? "LỄ TÂN" : "FO"; // the front office is named FO or LỄ TÂN in the roster
for (const a of ["B8", "B9"]) { const c = rules.getCell(a); const n = typeof c.value === "number" ? c.value : Number(String(c.value ?? "").replace(/[^\d]/g, "")); c.value = n >= 1000 ? n : 23000; c.numFmt = '#,##0"/ giờ"'; } // a fraction left from the old rule (20%) becomes the 23.000/giờ of QNS
rules.getCell("A8").value = "Tăng ca part time: tiền mỗi giờ";
rules.getCell("A9").value = "Ca đêm: tiền mỗi giờ (an ninh)";
const RED = { name: "Arial", bold: true, color: { argb: "FFFF0000" }, size: 11 }, PLAIN = { name: "Arial", color: { theme: 1 }, size: 11 };
const text = (a) => { const v = rules.getCell(a).value; return v && typeof v === "object" ? (v.richText ?? []).map((t) => t.text).join("") : String(v ?? ""); };
if (!text("C7").includes("Không tính với AN")) rules.getCell("C7").value = { richText: [{ font: PLAIN, text: "Giờ tăng ca x đơn giá giờ x %. Part time dùng ô bên dưới " }, { font: RED, text: "( tính với FO, HK, CF - Không tính với AN)" }] };
if (/x %/.test(text("C9"))) rules.getCell("C9").value = "Số ca đêm x 8,5 giờ x tiền mỗi giờ (chỉ an ninh)";
if (!text("C16")) rules.getCell("C16").value = { richText: [{ font: RED, text: "29 công tính chuyên cần" }] };
if (text("C25").trim() === "mini") rules.getCell("C25").value = `${FO} + AN`;
if (text("C27").trim() === "lễ tân") rules.getCell("C27").value = "ascf";
const style = (a) => ({ ...rules.getCell(a).style });
const s = { title: style("A28"), head: ["A29", "B29", "C29"].map(style), body: ["A30", "B30", "C30"].map(style), input: ["A27", "B27", "C27"].map(style) };
for (const m of [...(rules.model.merges ?? [])]) if (Number(m.match(/\d+/)[0]) >= 28) rules.unMergeCells(m);
for (let r = 28; r <= 70; r++) for (let c = 1; c <= 4; c++) { const cell = rules.getCell(r, c); cell.value = null; cell.style = {}; }
const put = (r, vals, styles, fmt) => vals.forEach((v, i) => { const cell = rules.getCell(r, i + 1); cell.value = v; cell.style = { ...styles[i] }; if (i === 1 && fmt) cell.numFmt = fmt; });
put(28, ["Chuyên cần part time: số công tối thiểu", 29, "Ngày công + phép + lễ"], s.input, "0");
put(29, ["Ca gãy (G): số bữa ăn mỗi ca", 2, "Tiền ăn mỗi ngày x số bữa. Ca gãy 10 giờ, áp dụng cho ăn sáng cafe"], s.input, "0");
put(30, ["Chức vụ an ninh (AN)", "AN", "Chức vụ trong NHÂN SỰ trùng với chữ này (hoặc bắt đầu bằng chữ này rồi cách một khoảng trắng) là an ninh: không có lương tăng ca, được phụ cấp ca đêm"], s.input, "@");
put(31, ["MÃ CHẤM CÔNG", null, null], [s.title, s.title, s.title]);
put(32, ["Mã", "Ý nghĩa", "Cách tính"], s.head);
const CODES = [
  ["X", "Đi làm đủ ca 8,5 giờ", "1 ngày công"], ["X1", "Tăng ca 1 giờ", "1 ngày công và 1 giờ tăng ca"], ["X1,5", "Tăng ca 1,5 giờ", "1 ngày công và 1,5 giờ tăng ca"], ["X2", "Tăng ca 2 giờ", "1 ngày công và 2 giờ tăng ca"],
  ["X2.5", "Tăng ca 2,5 giờ", "1 ngày công và 2,5 giờ tăng ca (gõ X2.5 hoặc X2,5)"], ["X3", "Tăng ca 3 giờ", "1 ngày công và 3 giờ tăng ca"], ["X3.5", "Tăng ca 3,5 giờ", "1 ngày công và 3,5 giờ tăng ca (gõ X3.5 hoặc X3,5)"],
  ["T", "Thử việc", "1 ngày công, đếm riêng số ngày thử việc"], ["PT", "Part time 5 giờ", "1 ngày công, trả theo giờ"], ["PT12", "Part time 12 giờ", "1 ngày công, trả theo giờ"], ["P", "Nghỉ phép năm", "Có lương, không tính vào ngày đi làm"], ["OFF", "Nghỉ không lương", "Không tính công"],
  ["N", "Ca đêm 8,5 giờ", "1 ca đêm: 8,5 giờ làm đêm áp dụng cho an ninh"], ["N1", "Ca đêm tăng ca 1 giờ", "1 ca đêm và 1 giờ tăng ca"], ["N1,5", "Ca đêm tăng ca 1,5 giờ", "1 ca đêm và 1,5 giờ tăng ca"], ["N2", "Ca đêm tăng ca 2 giờ", "1 ca đêm và 2 giờ tăng ca"],
  ["N2.5", "Ca đêm tăng ca 2,5 giờ", "1 ca đêm và 2,5 giờ tăng ca (gõ N2.5 hoặc N2,5)"], ["N3", "Ca đêm tăng ca 3 giờ", "1 ca đêm và 3 giờ tăng ca"], ["N3.5", "Ca đêm tăng ca 3,5 giờ", "1 ca đêm và 3,5 giờ tăng ca (gõ N3.5 hoặc N3,5)"],
  ["CT", "Công tác", "1 ngày công"], ["DL", "Du lịch", "1 ngày công"], ["L", "Đi làm ngày lễ, hưởng 300% FT", "Không tính vào ngày công; trả riêng theo hệ số ngày lễ ở trên"], ["G", "Ca gẫy  10H", "Hưởng hai bữa ăn áp dụng cho AS cafe"],
];
CODES.forEach((row, i) => put(CODES0 + i, row, s.body));
const firstN = CODES0 + CODES.findIndex((c) => c[0] === "N"), lastN = CODES0 + CODES.findIndex((c) => c[0] === "N3.5");
rules.mergeCells(`D${firstN}:D${lastN}`);
Object.assign(rules.getCell(`D${firstN}`), { value: "tính cho an ninh", fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF9900" } }, alignment: { horizontal: "center", vertical: "middle", wrapText: true } });
const codeRange = `'QUY TẮC'!$A$${CODES0}:$A$${CODES0 + CODES.length - 1}`;

// 2. CHẤM CÔNG: overtime hours and night shifts by code (X1 … X3,5, N1 … N3,5), the ca gãy count where TS was
cc.getCell("AK3").value = "Ca gãy (G)";
const HOURS = [1, 1.5, 2, 2.5, 3, 3.5, 4]; // 4 is not in the code table any more, but a X4 / N4 already typed is still counted: the pay of a month already entered does not change by itself
for (let r = FIRST; r <= LAST; r++) {
  const rng = `$D${r}:$AH${r}`, days = "$D$3:$AH$3";
  const n = (code) => `COUNTIFS(${rng},"${code}",${days},">0")`; // a code under a day past the end of the month is not counted
  const dec = (prefix, h) => (Number.isInteger(h) ? n(`${prefix}${h}`) : `(${n(`${prefix}${h}`)}+${n(`${prefix}${String(h).replace(".", ",")}`)})`); // 1.5 or 1,5
  const f = (col, formula) => { cc.getCell(`${col}${r}`).value = { formula, result: 0 }; };
  f("AK", n("G"));
  f("AM", `IF($B${r}="",0,COUNT(${days})-AI${r}-AJ${r}-AL${r})`);
  f("AN", HOURS.map((h) => `(${dec("X", h)}+${dec("N", h)})*${h}`).join("+"));
  f("AO", `${n("N")}+${HOURS.map((h) => dec("N", h)).join("+")}`);
}
// a code that is not in the table (a typo, or TS / X4 / N4 that no longer exist) gets a warning instead of being silently ignored
for (let r = FIRST; r <= LAST; r++) for (let c = 4; c <= 34; c++) cc.getCell(r, c).dataValidation = { type: "list", allowBlank: true, formulae: [codeRange], showErrorMessage: true, errorStyle: "warning", errorTitle: "Mã chấm công", error: "Mã này không có trong bảng MÃ CHẤM CÔNG ở tab QUY TẮC (TS, X4, N4 không còn). Vẫn nhập?" };

// 3. BẢNG LƯƠNG: two helper columns (AN flag, ca gãy count), then the pay columns by the rules
const head = pay.getCell("AK3"), body = pay.getCell("AK4");
[["AL", "Là an ninh (tự tính)"], ["AM", "Ca gãy G (tự tính)"]].forEach(([col, title]) => { const h = pay.getCell(`${col}3`); h.value = title; h.style = { ...head.style }; pay.getColumn(col).width = 14; });
const fromCc = (col, r) => `IFERROR(INDEX('CHẤM CÔNG'!$${col}$4:$${col}$33,MATCH($A${r},'CHẤM CÔNG'!$A$4:$A$33,0)),0)`;
const AN = Q(30);
// the accountant's file gives some rows the part time formulas (a probationer on part time pay): those rows keep them, whatever their "Hình thức"; the other rows follow "Hình thức" in NHÂN SỰ
const ptRows = new Set(); for (let r = FIRST; r <= LAST; r++) if (String(pay.getCell(`P${r}`).formula ?? "").includes("$B$8")) ptRows.add(r);
const pick = (when, a, b) => (when === true ? a : `IF(${when},${a},${b})`);
for (let r = FIRST; r <= LAST; r++) {
  const pt = ptRows.has(r) || `'NHÂN SỰ'!$D${r}="Part time"`, set = (col, formula) => { pay.getCell(`${col}${r}`).value = { formula, result: 0 }; };
  set("AL", `IF(OR($C${r}="",TRIM(${AN})=""),0,IF(OR(UPPER(TRIM($C${r}))=UPPER(TRIM(${AN})),LEFT(UPPER(TRIM($C${r})),LEN(TRIM(${AN}))+1)=UPPER(TRIM(${AN}))&" "),1,0))`);
  set("AM", fromCc("AK", r));
  for (const col of ["AL", "AM"]) { pay.getCell(`${col}${r}`).style = { ...body.style }; }
  set("P", `IF($AL${r}=1,0,${pick(pt, `M${r}*${Q(8)}`, `M${r}*J${r}*${Q(7)}`)})`);
  set("Q", `IF($AL${r}=1,N${r}*${Q(6)}*${Q(9)},0)`);
  set("R", `I${r}*O${r}*${pick(pt, Q(11), Q(10))}`);
  if (r > FIRST) { // row 4 is the manager: no meal, travel or attendance pay, as in the accountant's file
    set("T", pick(pt, `IF(M${r}<>0,${Q(12)},0)`, `${Q(12)}*(K${r}+O${r}+$AM${r}*(${Q(29)}-1))`));
    set("V", `IF(K${r}+L${r}+O${r}>=${pick(pt, Q(28), Q(14))},${pick(pt, Q(16), Q(15))},0)`);
  }
}

// 4. KPI THEO GIỜ: a source can name several positions ("FO + AN"); its fund is shared by the hours of everybody in them, so each position gets the same amount per hour from that source.
//    No array formulas: column I has the source's positions as "+FO+AN+", G the hours of the positions in it, H the amount per hour, E of the position table adds up what its sources pay per hour.
[["G", "Tổng giờ người nhận"], ["H", "KPI mỗi giờ"], ["I", "Chức vụ nhận (tự tính)"]].forEach(([col, title]) => { const h = kpi.getCell(`${col}3`); h.value = title; h.style = { ...kpi.getCell("F3").style }; kpi.getColumn(col).width = Math.max(kpi.getColumn(col).width ?? 10, 16); });
const has = (pos, list) => `ISNUMBER(SEARCH("+"&TRIM(${pos})&"+",${list}))`;
const POSITIONS = Array.from({ length: 10 }, (_, i) => 14 + i), SOURCES = [4, 5, 6, 7, 8, 9];
for (const r of SOURCES) {
  kpi.getCell(`I${r}`).value = { formula: `"+"&SUBSTITUTE(SUBSTITUTE(TRIM($E${r})," +","+"),"+ ","+")&"+"`, result: "" };
  kpi.getCell(`G${r}`).value = { formula: POSITIONS.map((p) => `IF(AND($B$${p}<>"",${has(`$B$${p}`, `$I${r}`)}),$D$${p},0)`).join("+"), result: 0 };
  kpi.getCell(`H${r}`).value = { formula: `IF(G${r}=0,0,F${r}/G${r})`, result: 0 };
  for (const col of ["G", "H", "I"]) kpi.getCell(`${col}${r}`).style = { ...kpi.getCell(`F${r}`).style };
}
for (const [r, who] of [[7, `${FO} + AN`], [8, "ascf"], [9, "ascf"]]) kpi.getCell(`E${r}`).value = who; // the recipients named in the QUY TẮC notes
for (const r of POSITIONS) { // the table by position: what its sources pay per hour, and its fund; the person's KPI (column J below) is hours x that
  kpi.getCell(`E${r}`).value = { formula: `IF($B${r}="","",${SOURCES.map((x) => `IF(${has(`$B${r}`, `$I$${x}`)},$H$${x},0)`).join("+")})`, result: 0 };
  kpi.getCell(`C${r}`).value = { formula: `IF($B${r}="","",D${r}*E${r})`, result: 0 };
}

// 5. PHIẾU LƯƠNG: the night line shows hours (night shifts x hours of a shift), as the label says
slip.getCell("C9").value = { formula: `IF($F$1="",0,IFERROR(INDEX('BẢNG LƯƠNG'!$N$4:$N$33,$F$1),0)*${Q(6)})`, result: 0 };

book.calcProperties.fullCalcOnLoad = true;
await book.xlsx.writeFile(out);
console.log(`ok: ${out}`);
