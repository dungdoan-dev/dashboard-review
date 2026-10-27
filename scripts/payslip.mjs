// The payslip tab of a payroll workbook: pick a staff number (STT) and the slip fills from the BẢNG LƯƠNG tab, ready to print for that person.
// Used by payroll-book.mjs and payroll-sontra.mjs. items: [label, column heading of BẢNG LƯƠNG, kind]; kind "money" is formatted as VND, "plain" as a count, "total" is bold.
const NAVY = "1F3A5F";
const thin = { style: "thin", color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });

export function addPayslip(book, { month, year, tag, payTab, first, last, letters, items }) {
  const ws = book.addWorksheet(`PHIẾU LƯƠNG ${tag}`, { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  const pay = `'${payTab}'!`;
  const rangeOf = (col) => `${pay}$${col}$${first}:$${col}$${last}`;
  ws.getColumn(1).width = 3; ws.getColumn(2).width = 40; ws.getColumn(3).width = 22; ws.getColumn(4).width = 3; ws.getColumn(5).width = 8;
  ws.getCell("B1").value = `PHIẾU LƯƠNG THÁNG ${String(month).padStart(2, "0")}/${year}`; ws.getCell("B1").font = { bold: true, size: 15, color: { argb: `FF${NAVY}` } };
  const input = (a) => { ws.getCell(a).fill = fill("FEF3C7"); ws.getCell(a).border = BORDER; };
  ws.getCell("B2").value = "Đơn vị"; ws.getCell("C2").value = ""; input("C2");
  ws.getCell("B3").value = "Chọn số thứ tự (STT) nhân viên"; ws.getCell("B3").font = { bold: true };
  ws.getCell("C3").value = 1; input("C3"); ws.getCell("C3").alignment = { horizontal: "center" };
  ws.getCell("C3").dataValidation = { type: "list", allowBlank: false, formulae: [rangeOf(letters["STT"])], showErrorMessage: true, errorTitle: "STT", error: "Chọn số thứ tự có trong bảng lương." };
  ws.getCell("E3").value = { formula: `IFERROR(MATCH($C$3,${rangeOf(letters["STT"])},0),"")`, result: 1 }; ws.getColumn(5).hidden = true; // row of the person in BẢNG LƯƠNG
  const pick = (col) => ({ formula: `IF($E$3="","",INDEX(${rangeOf(col)},$E$3))`, result: "" });
  ws.getCell("B4").value = "Họ và tên"; ws.getCell("C4").value = pick(letters["Họ tên"]); ws.getCell("C4").font = { bold: true };
  ws.getCell("B5").value = "Chức vụ"; ws.getCell("C5").value = pick(letters["Chức vụ"]);
  ws.getCell("B6").value = "Ngày thanh toán"; input("C6"); ws.getCell("C6").numFmt = "dd/mm/yyyy";
  for (const r of [4, 5, 6]) ws.getCell(`C${r}`).alignment = { horizontal: "right" };
  ws.getCell("B8").value = "HẠNG MỤC"; ws.getCell("C8").value = "VND";
  for (const a of ["B8", "C8"]) { const c = ws.getCell(a); c.fill = fill(NAVY); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = BORDER; c.alignment = { horizontal: "center" }; }
  items.forEach(([label, heading, kind], i) => {
    const r = 9 + i;
    ws.getCell(`B${r}`).value = label; ws.getCell(`C${r}`).value = pick(letters[heading]);
    for (const a of [`B${r}`, `C${r}`]) ws.getCell(a).border = BORDER;
    ws.getCell(`C${r}`).numFmt = "#,##0;-#,##0;\"-\"";
    ws.getCell(`C${r}`).alignment = { horizontal: "right" };
    if (kind === "total") { for (const a of [`B${r}`, `C${r}`]) { ws.getCell(a).font = { bold: true }; ws.getCell(a).fill = fill("E8EEF6"); } }
  });
  const end = 9 + items.length;
  ws.getCell(`B${end + 1}`).value = "Người lập"; ws.getCell(`C${end + 1}`).value = "Nhân viên ký nhận";
  for (const a of [`B${end + 1}`, `C${end + 1}`]) ws.getCell(a).alignment = { horizontal: "center" };
  ws.pageSetup.printArea = `B1:C${end + 6}`;
  return ws;
}

