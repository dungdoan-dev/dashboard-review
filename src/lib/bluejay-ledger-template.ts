// Standard blank ledger ("Bảng kê thu tiền khách sạn") to type into and upload on the reconcile page.
// Same layout as the finance team's monthly sheet "BK THU TIỀN KS"; bluejay-ledger-template.test.ts checks that parseLedgerWorkbook reads it.
// Built with exceljs (colours, borders, drop-downs); the page loads this file only when the template is downloaded.
import ExcelJS from "exceljs";
import { BLUEJAY_HOTELS } from "./bluejay-metrics.ts";
import { buildGuideSheet } from "./bluejay-ledger-guide.ts";
import { addIncomePanel } from "./fund-panel.ts";

export const TEMPLATE_SHEET = "BK THU TIỀN KS";
const ROWS = 500; // data rows prepared with borders, formats and the "Tổng tiền" formula
const FIRST = 4;  // first data row: row 1 title, row 2 group header, row 3 column names

const PLATFORMS = ["Agoda", "Booking", "Expedia", "Trip", "Traveloka", "Khách Lẻ", "Zalo", "BE", "Thu khác"];
const PAYMENTS = ["TT trực tiềp", "TT OTA", "Tiền thẻ", "Tiền pos"];
const SERVICES = ["Tiền phòng", "Minibar", "Giặt Ủi", "Dịch Vụ Ngoài", "DỊCH VỤ KS", "Phụ thu", "Cọc phòng", "Nâng hạng phòng", "Combo ăn sáng", "Tiền pos cafe", "Cọc tiền TK", "Cọc tiền TM", "Lãi tiền gửi", "Tiền quẹt thẻ tháng này", "Tiền quẹt thẻ tháng trước", "Rút tiền tài khoản", "Thu khác"];

// Column letters A..T. Money columns H..P are what the tool adds up; Q is the sheet's own total and is not counted twice; T is the stay month an OTA room payment is for.
const COLUMNS: { head: string; group: string; width: number; color: string }[] = [
  { head: "NGÀY THÁNG", group: "NGÀY THÁNG", width: 13, color: "1F3A5F" },
  { head: "ID HỆ THỐNG", group: "ID HỆ THỐNG", width: 22, color: "1F3A5F" },
  { head: "NỀN TẢNG", group: "NỀN TẢNG", width: 13, color: "1F3A5F" },
  { head: "Thanh toán", group: "Thanh toán", width: 14, color: "1F3A5F" },
  { head: "DỊCH VỤ", group: "DỊCH VỤ", width: 22, color: "1F3A5F" },
  { head: "NỘI DUNG", group: "NỘI DUNG", width: 28, color: "1F3A5F" },
  { head: "SỐ PHÒNG TT", group: "SỐ PHÒNG TT", width: 11, color: "1F3A5F" },
  { head: "Cọc tiền mặt\nĐã ở", group: "TIỀN CỌC ĐÃ NHẬN", width: 14, color: "C2570C" },
  { head: "Cọc tiền TK\nĐã ở", group: "", width: 14, color: "C2570C" },
  { head: "Cọc tiền thẻ\nĐã ở", group: "", width: 14, color: "C2570C" },
  { head: "Tiền măt", group: "THU TIỀN KHÁCH SẠN", width: 14, color: "15803D" },
  { head: "Cọc tiền TM\nchưa ở", group: "", width: 14, color: "15803D" },
  { head: "Tiền TK", group: "", width: 14, color: "15803D" },
  { head: "Cọc tiền TK\nchưa ở", group: "", width: 14, color: "15803D" },
  { head: "Tiền quẹt thẻ", group: "", width: 14, color: "15803D" },
  { head: "Tiền POS cafe", group: "", width: 14, color: "15803D" },
  { head: "", group: "Tổng tiền", width: 15, color: "475569" },
  { head: "Hoa hồng\nnền tảng", group: "GIẢM TRỪ DOANH THU", width: 14, color: "B91C1C" },
  { head: "Các khoản\ngiảm trừ khác", group: "", width: 14, color: "B91C1C" },
  { head: "KỲ LƯU TRÚ\nĐƯỢC THANH TOÁN", group: "KỲ LƯU TRÚ ĐƯỢC THANH TOÁN", width: 17, color: "7C3AED" },
];
const STAY_COL = 20;
const MONEY_COLS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19]; // H..P, R, S (1-based)

const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });

export function buildLedgerTemplate(book = new ExcelJS.Workbook()): ExcelJS.Workbook { // book: add the tabs to a workbook that already has others
  book.calcProperties.fullCalcOnLoad = true; // the "Tổng tiền" formulas carry no cached value
  const sheet = book.addWorksheet(TEMPLATE_SHEET, { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const guide = book.addWorksheet("Hướng dẫn thu");
  const list = book.addWorksheet("Danh mục thu");

  sheet.getCell("A1").value = "BẢNG KÊ THU TIỀN KHÁCH SẠN";
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F3A5F" } };
  // Row 1: the hotel and the month this file is for. The reconcile page reads the cell to the right of each label.
  const label = (ref: string, text: string) => { const c = sheet.getCell(ref); c.value = text; c.font = { bold: true, color: { argb: "FF1F3A5F" } }; c.alignment = { horizontal: "right", vertical: "middle" }; };
  const input = (ref: string) => { const c = sheet.getCell(ref); c.fill = fill("FEF3C7"); c.border = BORDER; c.font = { bold: true }; c.alignment = { horizontal: "left", vertical: "middle" }; return c; };
  label("D1", "KHÁCH SẠN");
  sheet.mergeCells("E1:F1");
  input("E1").dataValidation = { type: "list", allowBlank: true, formulae: [`'Danh mục thu'!$D$2:$D$${BLUEJAY_HOTELS.length + 1}`], showErrorMessage: true, errorStyle: "warning", errorTitle: "Khách sạn", error: "Tên khách sạn không có trong danh mục; vẫn có thể giữ nếu đúng." };
  sheet.getCell("F1").border = BORDER;
  label("H1", "KỲ BÁO CÁO (tháng/năm)");
  sheet.mergeCells("H1:I1");
  input("J1").numFmt = "mm/yyyy";
  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 34;
  COLUMNS.forEach((col, i) => {
    const group = sheet.getCell(2, i + 1), name = sheet.getCell(3, i + 1);
    group.value = col.group || null;
    name.value = col.head || null;
    for (const cell of [group, name]) {
      cell.fill = fill(col.color);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = BORDER;
    }
    sheet.getColumn(i + 1).width = col.width;
  });
  // Single-row headers (A..G), the total and the stay month take the full header height; the groups above the money columns are merged.
  for (const c of [1, 2, 3, 4, 5, 6, 7, 17, STAY_COL]) { sheet.mergeCells(2, c, 3, c); }
  sheet.mergeCells(2, 8, 2, 10);
  sheet.mergeCells(2, 11, 2, 16);
  sheet.mergeCells(2, 18, 2, 19);

  for (let r = FIRST; r < FIRST + ROWS; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= COLUMNS.length; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      if (r % 2 === 1) cell.fill = fill("F4F7FB"); // light banding
    }
    row.getCell(1).numFmt = "dd/mm/yyyy";
    row.getCell(2).numFmt = "@"; // keeps the leading zeros of 009465
    for (const c of MONEY_COLS) row.getCell(c).numFmt = "#,##0";
    row.getCell(STAY_COL).numFmt = "mm/yyyy";
    row.getCell(17).value = { formula: `SUM(H${r}:P${r})`, result: 0 };
    row.getCell(17).font = { bold: true };
  }
  // Drop-downs are warnings, not blocks: a value outside the list can still be kept.
  const rule = (col: number, source: string, what: string): ExcelJS.DataValidation => ({
    type: "list", allowBlank: true, formulae: [source], showErrorMessage: true, errorStyle: "warning", errorTitle: what, error: `${what} không có trong danh mục; vẫn có thể giữ nếu đúng.`,
  });
  const lists = [
    { col: 3, rule: rule(3, `'Danh mục thu'!$A$2:$A$${PLATFORMS.length + 1}`, "Nền tảng") },
    { col: 4, rule: rule(4, `'Danh mục thu'!$C$2:$C$${PAYMENTS.length + 1}`, "Hình thức thanh toán") },
    { col: 5, rule: rule(5, `'Danh mục thu'!$B$2:$B$${SERVICES.length + 1}`, "Dịch vụ") },
  ];
  for (let r = FIRST; r < FIRST + ROWS; r++) for (const l of lists) sheet.getCell(r, l.col).dataValidation = l.rule;

  addIncomePanel(sheet); // the day-by-day check of cash and bank, to the right of the ledger (columns V..AH)
  buildGuideSheet(guide);

  list.columns = [{ width: 14 }, { width: 28 }, { width: 16 }, { width: 30 }];
  const head = list.addRow(["NỀN TẢNG", "DỊCH VỤ", "THANH TOÁN", "KHÁCH SẠN"]);
  head.eachCell((cell) => { cell.fill = fill("1F3A5F"); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.border = BORDER; });
  for (let i = 0; i < Math.max(PLATFORMS.length, SERVICES.length, PAYMENTS.length, BLUEJAY_HOTELS.length); i++) {
    list.addRow([PLATFORMS[i] ?? "", SERVICES[i] ?? "", PAYMENTS[i] ?? "", BLUEJAY_HOTELS[i]?.name ?? ""]).eachCell((cell) => { cell.border = BORDER; });
  }
  return book;
}

/** Browser: build the template and hand it to the user as a file download. */
export async function downloadLedgerTemplate(filename = "mau-bang-ke-thu-tien.xlsx") {
  const buffer = await buildLedgerTemplate().xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
