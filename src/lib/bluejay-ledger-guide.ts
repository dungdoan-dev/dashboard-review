// Text and layout of the "Hướng dẫn" sheet of the ledger template (bluejay-ledger-template.ts): how to use, what to type in every cell and column,
// how the reconcile page reads it, how to read the result. Kept next to the parser's rules (bluejay-reconcile.ts): change both together.
import type ExcelJS from "exceljs";

type Cell = string | number;
type Span = [number, number]; // first and last guide column (1-based) a table column covers

const WIDTHS = [10, 26, 11, 40, 20, 44, 40, 14];
const NAVY = "1F3A5F";
const thin = { style: "thin" as const, color: { argb: "FFB8C2D0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });

// Column cells never repeat a header word exactly ("ID HỆ THỐNG"): the reconcile page finds the ledger sheet by those words, and must never take this sheet for it.
const FIELDS: Cell[][] = [
  ["Ô E1", "Khách sạn (ô vàng, hàng 1)", "Nên điền", "Chọn khách sạn của file này từ danh sách thả xuống.", "Yzistel Hoi An", "Tool so với khách sạn đang chọn ở thanh trên; khác nhau thì cảnh báo đỏ ở đầu kết quả.", "Một file chỉ một khách sạn. Ghi tên rút gọn (Yzistel) vẫn được."],
  ["Ô J1", "Kỳ báo cáo (ô vàng, hàng 1)", "Nên điền", "Tháng và năm của bảng kê, dạng mm/yyyy.", "09/2026", "Tool cảnh báo nếu có dòng ngày ngoài tháng này, và dùng tháng này để phân loại “thanh toán kỳ trước”.", "Không điền thì tool lấy tháng của ngày nhỏ nhất trong file."],
  ["Cột A", "Ngày tháng thu", "Bắt buộc", "Ngày thu tiền thực tế (không phải ngày khách ở), dạng ngày của Excel.", "01/09/2026", "Kỳ đối soát lấy từ ngày nhỏ nhất đến lớn nhất. Dòng không có ngày bị bỏ qua.", "Không gõ ngày dạng chữ; ô phải căn phải mới là ngày thật."],
  ["Cột B", "Mã đặt phòng (ID hệ thống)", "Bắt buộc, trừ dòng tổng hợp", "Mã đặt phòng Blue Jay (6 số) hoặc mã đặt phòng của OTA. Mọi dòng của cùng một đặt phòng dùng cùng mã.", "009465, 2519808162", "Khóa để khớp với Blue Jay (không phân biệt hoa thường, bỏ khoảng trắng).", "Cột đã đặt kiểu Text để giữ số 0 đầu. Dòng tổng hợp (quẹt thẻ cuối ngày, hoa hồng, lãi) để trống."],
  ["Cột C", "Nền tảng", "Nên điền", "Chọn từ danh sách: Agoda, Booking, Expedia, Trip, Traveloka, Khách Lẻ, Zalo, BE, Thu khác.", "Agoda", "Chỉ để tham khảo và hiện khi không tìm thấy đặt phòng trong Blue Jay. Kênh dùng để so lấy từ Blue Jay.", "Điền đúng giúp người đọc kết quả biết nguồn."],
  ["Cột D", "Hình thức thanh toán", "Không bắt buộc", "Chọn: TT trực tiềp, TT OTA, Tiền thẻ, Tiền pos.", "TT trực tiềp", "Không dùng để so sánh.", "Giữ nguyên chữ “tiềp” trong danh sách để thống nhất với bảng kê cũ."],
  ["Cột E", "Dịch vụ", "Bắt buộc", "Chọn từ danh sách. Tiền phòng ghi đúng “Tiền phòng”; tiền cọc phòng ghi “Cọc phòng”; còn lại là dịch vụ (Minibar, Giặt Ủi, Phụ thu…).", "Tiền phòng, Minibar", "“Tiền phòng” và “Cọc phòng” là tiền phòng, mọi chữ khác là dịch vụ. Khách OTA chỉ so phần dịch vụ.", "Ghi sai chữ làm tiền phòng bị tính là dịch vụ và gây lệch."],
  ["Cột F", "Nội dung (ghi chú)", "Không bắt buộc", "Ghi chú tự do về khoản thu.", "túi giặt", "Hiện ở cột Kết quả. Nếu có chữ “tháng N” hoặc “kỳ trước” và cột T để trống thì tool coi là thanh toán kỳ trước.", "Nên ghi tên OTA và tháng khi OTA trả tiền phòng."],
  ["Cột G", "Số phòng", "Không bắt buộc", "Số phòng của khoản thu.", "202", "Không dùng để so sánh.", ""],
  ["Cột H, I, J", "Tiền cọc đã nhận (đã ở)", "Khi có", "Cọc tiền mặt, cọc chuyển khoản, cọc thẻ của khách đã ở. Mỗi khoản vào đúng một cột.", "1.500.000", "Cộng vào tổng thu của dòng.", "Không nhập cọc vào cột khác."],
  ["Cột K đến P", "Thu tiền khách sạn", "Khi có", "Tiền mặt, cọc TM chưa ở, tiền TK, cọc TK chưa ở, tiền quẹt thẻ, tiền POS cafe. Mỗi khoản vào đúng một cột.", "50.000", "Cộng vào tổng thu của dòng. Khách trực tiếp: tổng thu của mọi dòng cùng mã được so với tiền đã thanh toán trong Blue Jay.", "Hoàn tiền nhập số âm."],
  ["Cột Q", "Tổng tiền", "Không nhập", "Tự cộng từ cột H đến P bằng công thức.", "", "Tool tự cộng cột H đến P nên không đọc cột này, tránh cộng trùng.", "Không xóa công thức."],
  ["Cột R, S", "Giảm trừ doanh thu", "Khi có", "Hoa hồng nền tảng và các khoản giảm trừ khác.", "375.870", "Không tính vào tiền thu. Tổng giảm trừ của dòng không có ID hiện ở thẻ “Dòng không có ID”.", "Không nhập hoa hồng vào cột thu."],
  ["Cột T", "Kỳ lưu trú được thanh toán", "Khi OTA trả sau", "Chỉ cho tiền phòng OTA trả sau: tháng khách đã ở, dạng mm/yyyy.", "08/2026", "Nhỏ hơn kỳ báo cáo thì dòng được xếp là “thanh toán kỳ trước”, không bị báo thiếu trong Blue Jay.", "Để trống thì tool đọc chữ “tháng N” ở cột Nội dung."],
];

const STEPS: Cell[][] = [
  ["1", "Tải file mẫu ở trang Đối soát bảng kê (nút “Tải file mẫu”). Mỗi tháng và mỗi khách sạn dùng một file riêng."],
  ["2", "Hàng 1: chọn khách sạn ở ô E1 và nhập kỳ báo cáo ở ô J1."],
  ["3", "Từ hàng 4, nhập từng khoản thu, mỗi khoản một dòng, theo bảng “Hướng dẫn từng mục” bên dưới."],
  ["4", "Lưu thành file .xlsx, giữ nguyên tên sheet “BK THU TIỀN KS”."],
  ["5", "Vào Vận hành, Đối soát bảng kê. Chọn đúng khách sạn ở thanh trên rồi bấm “Chọn file bảng kê”. Đọc kết quả theo bảng “Cách đọc kết quả”."],
];

const RESULTS: Cell[][] = [
  ["Khớp", "Số tiền trong bảng kê bằng số trong Blue Jay (sai số 1 đồng).", "Không cần làm gì."],
  ["Lệch số tiền", "Tìm thấy đặt phòng nhưng số tiền khác nhau.", "Kiểm tra nhập sai số, thiếu dòng, hoặc Blue Jay chưa ghi thanh toán (khách đang ở sẽ có ghi chú). Xem cột Chênh."],
  ["Có trong bảng kê, không có trong Blue Jay", "Mã không tìm thấy trong dữ liệu Blue Jay đã lưu.", "Kiểm tra gõ sai mã; xem có cảnh báo “Blue Jay chưa lưu tuần …” không (tuần chưa lưu thì chưa chắc sai); nếu là tiền OTA trả cho kỳ trước thì điền cột T."],
  ["Có trong Blue Jay, chưa có trong bảng kê", "Blue Jay có khoản khách sạn đã thu (khách trực tiếp có thanh toán, hoặc đặt phòng OTA có dịch vụ) nhưng bảng kê không có mã đó.", "Bổ sung các dòng còn thiếu vào bảng kê."],
  ["Thanh toán kỳ trước", "Tiền OTA trả cho kỳ lưu trú trước (cột T hoặc chữ “tháng N”).", "Chỉ để biết, không phải lỗi."],
];

const RULES: Cell[][] = [
  ["Khách trực tiếp (Khách lẻ, Zalo, BE)", "So tổng mọi cột thu (H đến P) của các dòng cùng mã với tổng “đã thanh toán” trong Blue Jay.", "Khách trực tiếp trả hết cho khách sạn nên bảng kê phải có đủ."],
  ["Khách OTA", "Chỉ so phần dịch vụ (không gồm “Tiền phòng”, “Cọc phòng”) với tiền dịch vụ trong Blue Jay.", "OTA trả tiền phòng sau cả tháng nên không so theo từng đặt phòng."],
  ["Khách trực tiếp nhận phòng trước kỳ", "Chỉ so dịch vụ.", "Tiền phòng đã thu ở bảng kê tháng trước."],
  ["Dung sai", "1 đồng.", "Blue Jay lưu số nguyên đồng."],
];

const SPECIAL: Cell[][] = [
  ["OTA trả tiền phòng", "Ghi vào ngày OTA thanh toán, dịch vụ “Tiền phòng”, điền cột T (tháng khách ở) và ghi tên OTA ở Nội dung. Không điền cột T thì ghi chữ “tháng N” ở Nội dung."],
  ["Dịch vụ khách trả tại quầy", "Nhập ngày khách trả, đúng dịch vụ (Minibar, Giặt Ủi, Phụ thu…) vào cột thu tương ứng."],
  ["Đặt phòng nhiều phòng", "Nhập cùng một mã cho mọi phòng. Tool cộng tiền của các phòng trong Blue Jay trước khi so."],
  ["Đặt phòng bắc qua tháng", "Tiền phòng nằm ở bảng kê tháng nhận phòng. Bảng kê tháng sau chỉ nhập khoản phát sinh trong tháng đó (thường là dịch vụ)."],
  ["Dòng tổng hợp", "Quẹt thẻ cuối ngày, hoa hồng nền tảng, lãi tiền gửi: để trống cột mã. Tool tách riêng, không đối soát theo đặt phòng."],
  ["Hoàn tiền", "Nhập số âm vào đúng cột đã thu."],
];

const EXAMPLES: Cell[][] = [
  ["01/09/2026", "007692", "Zalo", "Phụ thu", "túi giặt", "Tiền TK", 50000, ""],
  ["02/09/2026", "009465", "Khách Lẻ", "Tiền phòng", "", "Tiền măt", 1300000, ""],
  ["02/09/2026", "009465", "Khách Lẻ", "Minibar", "", "Tiền măt", 35000, ""],
  ["06/09/2026", "1734737918", "Agoda", "Tiền phòng", "Agoda thanh toán", "Tiền TK", 520000, "08/2026"],
  ["26/09/2026", "(để trống)", "", "Lãi tiền gửi", "", "Tiền TK", 19487, ""],
];

const MISTAKES: Cell[][] = [
  ["Mã gõ sai hoặc dính khoảng trắng", "Báo “có trong bảng kê, không có trong Blue Jay”. Khoảng trắng và tab tool tự bỏ, nhưng chữ sai thì không."],
  ["Tiền phòng ghi chữ khác (ví dụ “Phòng”)", "Tool coi là dịch vụ, khách OTA bị báo lệch."],
  ["Chèn cột hoặc đổi tên tiêu đề hàng 2 và 3", "Tool báo “Bảng kê thiếu cột”. Tool tìm cột theo tên tiêu đề."],
  ["Ngày gõ dạng chữ", "Dòng bị bỏ qua vì không có ngày."],
  ["Nhập tay vào cột Tổng tiền", "Không ảnh hưởng đối soát nhưng mất công thức; tool không đọc cột này."],
  ["Hai khách sạn trong một file", "Kết quả sai hàng loạt. Mỗi khách sạn một file."],
];

/** Fills the (empty) guide sheet. Row heights are estimated because Excel does not fit merged, wrapped cells. */
export function buildGuideSheet(sheet: ExcelJS.Worksheet) {
  WIDTHS.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  const span = (a: number, b: number) => WIDTHS.slice(a - 1, b).reduce((s, w) => s + w, 0);
  const height = (cells: { text: Cell; width: number }[]) => 16 * Math.max(1, ...cells.map(({ text, width }) => Math.ceil(String(text).length / (width * 0.95)))) + 4;
  const put = (row: ExcelJS.Row, spans: Span[], values: Cell[], style: (cell: ExcelJS.Cell, i: number) => void) => {
    values.forEach((value, i) => {
      const [a, b] = spans[i];
      if (b > a) sheet.mergeCells(row.number, a, row.number, b);
      const cell = sheet.getCell(row.number, a);
      cell.value = value;
      cell.alignment = { wrapText: true, vertical: "top" };
      for (let c = a; c <= b; c++) sheet.getCell(row.number, c).border = BORDER;
      style(cell, i);
    });
    row.height = height(values.map((text, i) => ({ text, width: span(...spans[i]) })));
  };
  const spacer = () => sheet.addRow([]);
  const title = (text: string) => { const row = sheet.addRow([text]); row.font = { bold: true, size: 14, color: { argb: `FF${NAVY}` } }; row.height = 24; };
  const note = (text: string) => {
    const row = sheet.addRow([]);
    sheet.mergeCells(row.number, 1, row.number, 8);
    const cell = sheet.getCell(row.number, 1);
    cell.value = text; cell.alignment = { wrapText: true, vertical: "top" };
    row.height = height([{ text, width: span(1, 8) }]);
  };
  const heading = (text: string) => {
    const row = sheet.addRow([]);
    sheet.mergeCells(row.number, 1, row.number, 8);
    const cell = sheet.getCell(row.number, 1);
    cell.value = text; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = fill(NAVY); row.height = 20;
  };
  const table = (head: string[], rows: Cell[][], spans: Span[], color = "15803D") => {
    put(sheet.addRow([]), spans, head, (cell) => { cell.fill = fill(color); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
    for (const values of rows) put(sheet.addRow([]), spans, values, (cell, i) => { if (i === 0) cell.font = { bold: true }; });
  };
  const single: Span[] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]];

  title("HƯỚNG DẪN NHẬP BẢNG KÊ THU TIỀN KHÁCH SẠN");
  note("Một file là một khách sạn, một tháng. Nhập vào sheet “BK THU TIỀN KS” rồi tải lên trang Đối soát bảng kê. Tool so từng đặt phòng trong bảng kê với dữ liệu Blue Jay đã lưu, không gọi Blue Jay nên dùng được mọi giờ.");
  spacer();
  heading("1. CÁCH DÙNG");
  for (const [n, text] of STEPS) put(sheet.addRow([]), [[1, 1], [2, 8]], [n, text], (cell, i) => { if (i === 0) cell.font = { bold: true }; });
  spacer();
  heading("2. HƯỚNG DẪN TỪNG MỤC (ô và cột của sheet nhập liệu)");
  table(["Ô / cột", "Mục", "Bắt buộc", "Nhập gì", "Ví dụ", "Tool dùng để làm gì", "Lưu ý"], FIELDS, single);
  spacer();
  heading("3. TOOL SO SÁNH THẾ NÀO");
  table(["Đối tượng", "Cách so", "Lý do"], RULES, [[1, 2], [3, 5], [6, 8]]);
  spacer();
  heading("4. CÁCH ĐỌC KẾT QUẢ ĐỐI SOÁT");
  table(["Nhóm kết quả", "Nghĩa là", "Việc cần làm"], RESULTS, [[1, 2], [3, 4], [5, 8]]);
  spacer();
  heading("5. TRƯỜNG HỢP ĐẶC BIỆT");
  for (const values of SPECIAL) put(sheet.addRow([]), [[1, 2], [3, 8]], values, (cell, i) => { if (i === 0) cell.font = { bold: true }; });
  spacer();
  heading("6. VÍ DỤ (không nằm trong sheet nhập liệu)");
  table(["Ngày thu", "Mã", "Nền tảng", "Dịch vụ", "Nội dung", "Cột nhập", "Số tiền", "Kỳ lưu trú"], EXAMPLES, [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]]);
  spacer();
  heading("7. LỖI THƯỜNG GẶP");
  for (const values of MISTAKES) put(sheet.addRow([]), [[1, 2], [3, 8]], values, (cell, i) => { if (i === 0) cell.font = { bold: true }; });
}

export const GUIDE_FIELD_KEYS = FIELDS.map((row) => String(row[0]));
