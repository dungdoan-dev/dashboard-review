// The finance team's expense list (sheet BK CHI KS of KT THU CHI SƠN TRÀ mẫu.xlsx). No imports: the template (exceljs) and the summary both use it.
// [code, name, what goes in it, report group]. Codes keep the finance team's numbers (CP04..CP06 are not used).
// "Nhóm báo cáo" is only a proposal for the profit report: every group but the last is a cost of the hotel (the last is a move of money between funds). The report refines it by what the line says: see reportGroup in finance-summary.ts.
export const EXPENSES: [string, string, string, string][] = [
  ["CP01", "Chi đầu tư TSCĐ", "Máy móc, két sắt, cây nước, xe máy, ô tô, máy chấm công, điều hòa, thiết bị điện, hệ thống kỹ thuật và các tài sản đủ tiêu chuẩn ghi nhận TSCĐ.", "Chi phí đầu tư, sự kiện"],
  ["CP02", "Chi mua đồ dùng CCDC", "Giường, tủ, thảm phòng, ly cốc, thìa cà phê, khay minibar, khay đựng điều khiển, đồng phục, dụng cụ phục vụ khách sạn và các tài sản không đủ tiêu chuẩn ghi nhận TSCĐ.", "Chi phí đầu tư, sự kiện"],
  ["CP03", "Chi sửa chữa – Bảo dưỡng", "Sửa vòi sen, bản lề, đường ống, hệ thống điện nước; bảo dưỡng điều hòa, xe, máy móc, thiết bị kỹ thuật.", "Chi phí đầu tư, sự kiện"],
  ["CP07", "Chi Amenities – Minibar – Vật tư", "Bàn chải, lược, tăm bông, chụp tóc; minibar bán và miễn phí, trà, cà phê, nước uống; giấy, hóa chất, túi rác, vật tư vệ sinh.", "Chi phí vận hành"],
  ["CP08", "Chi Sự kiện - cây xanh", "Khai trương, sự kiện, trang trí Tết, hoa, cây xanh, chậu cây, đất, phân bón, quà tặng khách và vật phẩm trang trí.", "Chi phí đầu tư, sự kiện"],
  ["CP09", "Chi thuê khách sạn", "Tiền thuê khách sạn, mặt bằng.", "Chi phí vận hành"],
  ["CP15", "Chi quản lý, vận hành", "Chi tiền quản lý vận hành khách sạn.", "Chi dịch vụ ngoài & nộp thuế"], // the accountant's KQ HĐKD lists it with the outside services
  ["CP10", "Chi nhân sự – BHXH", "Lương, phụ cấp, thưởng, ứng lương, BHXH, BHYT, BHTN, quà Tết, hiếu hỷ, thai sản, thăm hỏi, du lịch nhân viên.", "Chi phí nhân sự"],
  ["CP11", "Chi điện nước – Viễn thông, phí dv", "Tiền điện, nước, Internet, điện thoại, phí quẹt thẻ, phí giao dịch ngân hàng.", "Chi dịch vụ ngoài & nộp thuế"],
  ["CP12", "Chi dịch vụ ngoài - phần mềm QL", "Thuê xe, giặt là, Casual HK, dịch vụ kế toán, vận chuyển, gửi hàng và dịch vụ vệ sinh, dv thuê ngoài, chi phần mềm quản lý.", "Chi dịch vụ ngoài & nộp thuế"],
  ["CP13", "Chi Marketing – OTA", "Google Ads, Facebook Ads, chụp ảnh, viết bài, marketing book phòng, hoa hồng OTA, quảng bá, khuyến mãi.", "Chi dịch vụ ngoài & nộp thuế"],
  ["CP14", "Chi thuế – Pháp lý – PCCC", "Thuế nhà thầu, GTGT, TNDN; đăng ký kinh doanh, giấy phép, chữ ký số, PCCC, an ninh trật tự, phần mềm BlueJay, KiotViet.", "Chi dịch vụ ngoài & nộp thuế"],
  ["CP17", "Chi bồi thường KH", "Chi bồi thường khách do sự cố, khiếu nại hoặc chất lượng dịch vụ.", "Chi dịch vụ ngoài & nộp thuế"],
  ["CP19", "Chi khác", "Các khoản chi hợp lệ phát sinh trong quá trình hoạt động chưa thuộc những nhóm chi phí trên.", "Chi phí khác"],
  ["CP16", "Chi hoàn tiền KH", "Hoàn cọc, hoàn tiền phòng/dịch vụ khách.", "Chi dịch vụ ngoài & nộp thuế"], // the accountant's weekly report counts refunds in this group
  ["CP18", "Chi rút tiền – Điều chuyển tiền", "Rút tiền tài khoản nhập quỹ, chuyển quỹ, chuyển tiền giữa các tài khoản, chuyển hoặc thanh toán tiền cho chủ đầu tư.", "Điều chuyển tiền (không phải chi phí)"],
];
