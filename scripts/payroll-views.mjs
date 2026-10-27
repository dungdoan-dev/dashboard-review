// Two extra views of a payroll workbook, shared by payroll-book.mjs and payroll-sontra.mjs:
//  addCodeTable: the shift codes of the QUY TẮC tab, one row per code.
//  addSummary: a short sheet for managers with the key figures of every person, then the same by role.
const NAVY = "1F3A5F";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const head = (c, color = NAVY) => { c.fill = fill(color); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = BORDER; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };
const MONEY = "#,##0;-#,##0;\"-\"", PLAIN = "#,##0;-#,##0;\"-\"";

/** maxOt: the largest overtime code (3 means X1..X3 and N1..N3). Returns the row after the table. */
export function addCodeTable(ws, startRow, maxOt) {
  ws.getCell(startRow, 1).value = "MÃ CHẤM CÔNG"; ws.getCell(startRow, 1).font = { bold: true, size: 12, color: { argb: `FF${NAVY}` } };
  const hours = Array.from({ length: maxOt }, (_, i) => i + 1);
  const rows = [
    ["X", "Đi làm đủ ca 8,5 giờ", "1 ngày công"],
    ["T", "Thử việc", "1 ngày công, đếm riêng số ngày thử việc"],
    ["PT", "Part time 5 giờ", "1 ngày công, trả theo giờ"],
    ["PT12", "Part time 12 giờ", "1 ngày công, trả theo giờ"],
    ["P", "Nghỉ phép năm", "Có lương, không tính vào ngày đi làm"],
    ["OFF", "Nghỉ không lương", "Không tính công"],
    ["N", "Ca đêm", "1 ngày công và 1 ca đêm"],
    ...hours.map((h) => [`X${h}`, `Tăng ca ${h} giờ`, `1 ngày công và ${h} giờ tăng ca`]),
    ...hours.map((h) => [`N${h}`, `Ca đêm tăng ca ${h} giờ`, `1 ca đêm và ${h} giờ tăng ca`]),
    ["TS", "Nghỉ thai sản", "Không tính công"],
    ["CT", "Công tác", "1 ngày công"],
    ["DL", "Du lịch", "1 ngày công"],
    ["L", "Đi làm ngày lễ, hưởng 200%", "Không tính vào ngày công; trả riêng theo hệ số ngày lễ ở trên"],
  ];
  ["Mã", "Ý nghĩa", "Cách tính"].forEach((h, i) => { const c = ws.getCell(startRow + 1, 1 + i); c.value = h; head(c); });
  rows.forEach((r, k) => r.forEach((v, i) => { const c = ws.getCell(startRow + 2 + k, 1 + i); c.value = v; c.border = BORDER; if (i === 0) c.font = { bold: true }; }));
  return startRow + 2 + rows.length;
}

/** groups: [label, [headings of BẢNG LƯƠNG to add up]]; info: [label, heading] shown as plain numbers; roles: the roles for the second table. */
export function addSummary(book, { month, year, tag, payTab, first, last, letters, info, groups, roles }) {
  const ws = book.addWorksheet(`TỔNG HỢP ${tag}`, { views: [{ state: "frozen", ySplit: 4, xSplit: 2 }] });
  ws.getCell("A1").value = `TỔNG HỢP LƯƠNG THÁNG ${String(month).padStart(2, "0")}/${year}`; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } };
  ws.getCell("A2").value = "Tự lấy từ tab BẢNG LƯƠNG. Thực lĩnh = lương + phụ cấp + thưởng - trừ vi phạm - ứng lương."; ws.getCell("A2").font = { italic: true, color: { argb: "FF586B84" } };
  const moneyFrom = 3 + info.length;            // 0-based index of the first money column
  const heads = ["STT", "Họ tên", "Chức vụ", ...info.map(([l]) => l), ...groups.map(([l]) => l), "Trừ vi phạm", "Ứng lương", "Thực lĩnh"];
  const widths = [5, 26, 14, ...info.map(() => 10), ...groups.map(() => 15), 12, 12, 16];
  heads.forEach((h, i) => { const c = ws.getCell(4, i + 1); c.value = h; head(c, i >= moneyFrom ? "15803D" : NAVY); ws.getColumn(i + 1).width = widths[i]; });
  ws.getRow(4).height = 32;
  const n = last - first + 1, pay = `'${payTab}'!`;
  for (let k = 0; k < n; k++) {
    const r = 5 + k, ref = (heading) => `${pay}${letters[heading]}${first + k}`;
    const formulas = [ref("STT"), ref("Họ tên"), ref("Chức vụ"), ...info.map(([, h]) => ref(h)), ...groups.map(([, hs]) => hs.map(ref).join("+")), ref("Trừ vi phạm"), ref("Ứng lương"), ref("Thực lĩnh")];
    formulas.forEach((formula, i) => { const c = ws.getCell(r, i + 1); c.value = { formula, result: 0 }; c.border = BORDER; if (i >= moneyFrom) c.numFmt = MONEY; else if (i >= 3) c.numFmt = PLAIN; });
    ws.getCell(r, heads.length).font = { bold: true };
  }
  const t = 5 + n;
  ws.getCell(t, 2).value = "Tổng";
  for (let c = 4; c <= heads.length; c++) { const L = ws.getColumn(c).letter; ws.getCell(t, c).value = { formula: `SUM(${L}5:${L}${t - 1})`, result: 0 }; }
  for (let c = 1; c <= heads.length; c++) { const cell = ws.getCell(t, c); cell.font = { bold: true }; cell.fill = fill("E8EEF6"); cell.border = BORDER; if (c >= 4) cell.numFmt = c > moneyFrom ? MONEY : PLAIN; }

  // the same by role
  const s = t + 3, moneyCols = heads.length - moneyFrom; // columns Lương..Thực lĩnh
  ws.getCell(s - 1, 1).value = "THEO CHỨC VỤ"; ws.getCell(s - 1, 1).font = { bold: true, size: 12, color: { argb: `FF${NAVY}` } };
  ["Chức vụ", "Số người", ...heads.slice(moneyFrom)].forEach((h, i) => { const c = ws.getCell(s, 2 + i); c.value = h; head(c); });
  roles.forEach((role, k) => {
    const r = s + 1 + k;
    ws.getCell(r, 2).value = role;
    ws.getCell(r, 3).value = { formula: `COUNTIF($C$5:$C$${t - 1},$B${r})`, result: 0 };
    for (let i = 0; i < moneyCols; i++) { const L = ws.getColumn(moneyFrom + 1 + i).letter; ws.getCell(r, 4 + i).value = { formula: `SUMIF($C$5:$C$${t - 1},$B${r},${L}$5:${L}$${t - 1})`, result: 0 }; ws.getCell(r, 4 + i).numFmt = MONEY; }
    for (let c = 2; c < 4 + moneyCols; c++) ws.getCell(r, c).border = BORDER;
  });
  const e = s + 1 + roles.length;
  ws.getCell(e, 2).value = "Tổng";
  for (let c = 3; c < 4 + moneyCols; c++) { const L = ws.getColumn(c).letter; ws.getCell(e, c).value = { formula: `SUM(${L}${s + 1}:${L}${e - 1})`, result: 0 }; ws.getCell(e, c).numFmt = c === 3 ? "0" : MONEY; }
  for (let c = 2; c < 4 + moneyCols; c++) { const cell = ws.getCell(e, c); cell.font = { bold: true }; cell.fill = fill("E8EEF6"); cell.border = BORDER; }
  return ws;
}
