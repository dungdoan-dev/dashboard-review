// Standard blank expense ledger ("Bảng kê chi khách sạn") to type into, next to the income ledger of bluejay-ledger-template.ts.
// Same layout as the finance team's sheet "BK CHI KS" (KT THU CHI SƠN TRÀ mẫu.xlsx): A..I are typed, J is the sheet's own total; the expense list is theirs (CP01..CP19).
// Built with exceljs; nothing reads it back yet, bluejay-expense-template.test.ts checks the layout and the summary formulas.
import ExcelJS from "exceljs";
import { BLUEJAY_HOTELS } from "./bluejay-metrics.ts";
import { EXPENSES } from "./expense-kinds.ts";

/** The monthly tab. The name carries the month so the app finds it (it accepts 08/2026 and 08-2026). An Excel file cannot have "/" in a sheet name, so the template says "BK CHI 08-2026";
 * in Google Sheets the tab is named "BK CHI 08/2026" (the BK THU panel finds it either way). */
export const expenseSheetName = (month: string) => `BK CHI ${month.replace("/", "-")}`;
const thisMonth = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const ROWS = 500; // data rows prepared with borders, formats and the "Tổng chi" formula
const FIRST = 4;  // first data row: row 1 title, row 2 group header, row 3 column names

export { EXPENSES };

const COLUMNS: { head: string; group: string; width: number; color: string }[] = [
  { head: "Ngày", group: "KHOẢN CHI", width: 13, color: "1F3A5F" },
  { head: "Hạng mục", group: "", width: 34, color: "1F3A5F" },
  { head: "Nội dung chi", group: "", width: 44, color: "1F3A5F" },
  { head: "Chi tiền mặt", group: "CHI TIỀN RA KHỎI QUỸ", width: 15, color: "B91C1C" },
  { head: "Chi tiền CK", group: "", width: 15, color: "B91C1C" },
  { head: "Chi tiền CK\nthẻ visa", group: "", width: 15, color: "B91C1C" },
  { head: "Hoa hồng\nnền tảng", group: "GIẢM TRỪ DOANH THU (không ra tiền)", width: 15, color: "C2570C" },
  { head: "Phí quẹt thẻ", group: "", width: 15, color: "C2570C" },
  { head: "GHI CHÚ", group: "GHI CHÚ", width: 30, color: "1F3A5F" },
  { head: "", group: "Tổng chi", width: 16, color: "475569" },
];
const MONEY_COLS = [4, 5, 6, 7, 8, 10];

const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
const headCell = (cell: ExcelJS.Cell, color = "1F3A5F") => { cell.fill = fill(color); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.border = BORDER; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; };

const GUIDE: string[][] = [
  ["HƯỚNG DẪN NHẬP BẢNG KÊ CHI KHÁCH SẠN"],
  ["Một file là một khách sạn, một tháng. Mỗi khoản chi một dòng, nhập từ hàng 4 của sheet “BK CHI TIỀN KS”."],
  ["Ngày", "Ngày chi thực tế, dạng ngày của Excel (không gõ chữ)."],
  ["Hạng mục", "Chọn trong danh sách (cột Hạng mục ở sheet “Danh mục chi”, có mô tả từng mục). Báo cáo chi trên dashboard cộng theo đúng tên này, nên gõ sai tên thì khoản chi không được cộng."],
  ["Nội dung chi", "Ghi chú tự do: chi cho việc gì, tháng nào, mã khách (nếu là phí quẹt thẻ, hoa hồng)."],
  ["Chi tiền mặt / CK / CK thẻ visa", "Số tiền thực chi, mỗi khoản vào đúng một cột theo quỹ đã chi: tiền mặt, tài khoản ngân hàng, tài khoản thẻ visa."],
  ["Hoa hồng nền tảng, Phí quẹt thẻ", "Chỉ khi OTA hoặc ngân hàng trừ thẳng vào tiền thu: số tiền bị trừ, không ra khỏi quỹ nên KHÔNG nhập vào cột chi. Khoản chi thật (ví dụ chuyển khoản trả hoa hồng) nhập ở cột chi tiền."],
  ["Tổng chi", "Tự cộng ba cột chi tiền, không nhập tay. Không cộng hoa hồng và phí quẹt thẻ."],
  ["Hoàn tiền, rút tiền", "Hạng mục “Chi hoàn tiền KH” và “Chi rút tiền – Điều chuyển tiền” vẫn là tiền ra khỏi quỹ (có trong sổ quỹ) nhưng không phải chi phí kinh doanh; cột “Nhóm báo cáo” ở sheet “Danh mục chi” ghi rõ để báo cáo lãi lỗ tách riêng."],
];

export function buildExpenseTemplate(month = thisMonth(), book = new ExcelJS.Workbook()): ExcelJS.Workbook {
  book.calcProperties.fullCalcOnLoad = true; // formulas carry no cached value
  const sheet = book.addWorksheet(expenseSheetName(month), { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const guide = book.addWorksheet("Hướng dẫn chi");
  const list = book.addWorksheet("Danh mục chi");
  const lastRow = FIRST + ROWS - 1;

  sheet.getCell("A1").value = "BẢNG KÊ CHI KHÁCH SẠN";
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F3A5F" } };
  const label = (ref: string, text: string) => { const c = sheet.getCell(ref); c.value = text; c.font = { bold: true, color: { argb: "FF1F3A5F" } }; c.alignment = { horizontal: "right", vertical: "middle" }; };
  const input = (ref: string) => { const c = sheet.getCell(ref); c.fill = fill("FEF3C7"); c.border = BORDER; c.font = { bold: true }; c.alignment = { horizontal: "left", vertical: "middle" }; return c; };
  label("C1", "KHÁCH SẠN");
  input("D1").dataValidation = { type: "list", allowBlank: true, formulae: [`'Danh mục chi'!$F$2:$F$${BLUEJAY_HOTELS.length + 1}`], showErrorMessage: true, errorStyle: "warning", errorTitle: "Khách sạn", error: "Tên khách sạn không có trong danh mục." };
  sheet.mergeCells("D1:E1");
  sheet.getCell("E1").border = BORDER;
  label("F1", "KỲ BÁO CÁO (tháng/năm)");
  sheet.mergeCells("F1:G1");
  input("H1").numFmt = "mm/yyyy";
  sheet.getRow(1).height = 24; sheet.getRow(2).height = 22; sheet.getRow(3).height = 34;
  COLUMNS.forEach((col, i) => {
    const group = sheet.getCell(2, i + 1), name = sheet.getCell(3, i + 1);
    group.value = col.group || null;
    name.value = col.head || null;
    headCell(group, col.color); headCell(name, col.color);
    sheet.getColumn(i + 1).width = col.width;
  });
  for (const c of [9, 10]) sheet.mergeCells(2, c, 3, c);
  sheet.mergeCells(2, 1, 2, 3);
  sheet.mergeCells(2, 4, 2, 6);
  sheet.mergeCells(2, 7, 2, 8);

  const kinds = { type: "list" as const, allowBlank: true, formulae: [`'Danh mục chi'!$B$2:$B$${EXPENSES.length + 1}`], showErrorMessage: true, errorStyle: "warning" as const, errorTitle: "Hạng mục", error: "Hạng mục không có trong danh mục; tổng hợp chi sẽ không cộng khoản này." };
  for (let r = FIRST; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= COLUMNS.length; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      if (r % 2 === 1) cell.fill = fill("F4F7FB");
    }
    row.getCell(1).numFmt = "dd/mm/yyyy";
    for (const c of MONEY_COLS) row.getCell(c).numFmt = "#,##0";
    row.getCell(10).value = { formula: `SUM(D${r}:F${r})`, result: 0 };
    row.getCell(10).font = { bold: true };
    row.getCell(2).dataValidation = kinds;
  }


  guide.columns = [{ width: 32 }, { width: 110 }];
  GUIDE.forEach((line, i) => {
    const row = guide.addRow(line);
    row.getCell(1).font = { bold: true, color: { argb: "FF1F3A5F" }, ...(i === 0 ? { size: 14 } : {}) };
    row.alignment = { wrapText: true, vertical: "top" };
  });

  list.columns = [{ width: 8 }, { width: 36 }, { width: 80 }, { width: 34 }, { width: 3 }, { width: 28 }];
  list.addRow(["Mã", "Hạng mục", "Gồm những khoản", "Nhóm báo cáo (đề xuất)", "", "Khách sạn"]).eachCell((cell, c) => { if (c !== 5) headCell(cell); });
  for (let i = 0; i < Math.max(EXPENSES.length, BLUEJAY_HOTELS.length); i++) {
    const e = EXPENSES[i];
    list.addRow([e?.[0] ?? "", e?.[1] ?? "", e?.[2] ?? "", e?.[3] ?? "", "", BLUEJAY_HOTELS[i]?.name ?? ""]).eachCell((cell, c) => { if (c !== 5) { cell.border = BORDER; cell.alignment = { wrapText: true, vertical: "top" }; } });
  }
  return book;
}

/** Browser: build the template and hand it to the user as a file download. */
export async function downloadExpenseTemplate(filename = "mau-bang-ke-chi-tien.xlsx") {
  const buffer = await buildExpenseTemplate().xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
