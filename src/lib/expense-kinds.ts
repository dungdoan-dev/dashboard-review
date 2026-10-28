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

// Expense lists of the F&B file (Ăn sáng, cafe, mini mart), from "Danh mục chi ks.xlsx": same codes and report groups as the hotel's, the three food groups (CP04..CP06) count as running costs like Amenities - Minibar - Vật tư.
// Pass one of them where a function takes `list` (summarizeFinance, costTree); names match ignoring accents and dashes.
const group = (code: string) => EXPENSES.find((e) => e[0] === code)![3];
const food = group("CP07");
/** Ăn sáng, cafe: sheets BK CHI and the "Danh mục" of the F&B file. */
export const FNB_EXPENSES: [string, string, string, string][] = [
  ["CP01", "Chi đầu tư TSCĐ", "Mua máy pha cà phê, máy xay, tủ lạnh, tủ đông, máy làm đá, thiết bị pha chế và các tài sản đủ tiêu chuẩn ghi nhận TSCĐ.", group("CP01")],
  ["CP02", "Chi mua đồ dùng CCDC", "Bình lắc, ca đong, tamper, ly thủy tinh, khay, dụng cụ pha chế, dụng cụ phục vụ, đồng phục và CCDC khác.", group("CP02")],
  ["CP03", "Chi sửa chữa – Bảo dưỡng", "Sửa chữa, bảo trì, bảo dưỡng máy pha cà phê, máy xay, tủ lạnh, máy làm đá, thiết bị điện và CCDC.", group("CP03")],
  ["CP04", "Chi nguyên liệu pha chế", "Cà phê, trà, sữa, syrup, đường, kem, trái cây, bột, topping, bánh và nguyên liệu chế biến nhập kho.", food],
  ["CP04", "Nguyên liệu ăn sáng", "Gà, thịt bò, thịt heo, xương, trứng, xúc xích, bánh mì, bún, phở, rau củ.", food], // the sheet's list has these two beside CP04: one line with it in the month's result (same code)
  ["CP04", "Gia vị ăn sáng", "Muối, đường, nước mắm, hạt nêm, bột ngọt, tiêu, ớt, tỏi, hành, dầu ăn.", food],
  ["CP05", "Chi mua hàng hóa", "Bia, nước giải khát đóng chai, bánh đóng gói, hạt hướng dương, đồ ăn nhẹ và hàng hóa mua về bán nguyên trạng.", food],
  ["CP06", "Chi bao bì – Vật tư", "Ly giấy, nắp ly, ống hút, túi đựng bánh, túi quai, giấy ăn, bao tay, vật tư đóng gói, vật tư vệ sinh.", food],
  ["CP08", "Chi Sự kiện - cây xanh", "Khai trương, sự kiện, trang trí Tết, hoa, cây xanh, chậu cây, đất, phân bón, quà tặng khách và vật phẩm trang trí.", group("CP08")],
  ["CP10", "Chi nhân sự – BHXH – Phúc lợi", "Lương, phụ cấp, thưởng KPI, thưởng Tết, tháng lương 13, ứng lương, BHXH, quà Tết, hiếu hỷ, thai sản, thăm hỏi, du lịch nhân viên.", group("CP10")],
  ["CP11", "Chi điện nước – Viễn thông, phí dv", "Tiền điện, nước, Internet, điện thoại, phí quẹt thẻ, phí giao dịch ngân hàng.", group("CP11")],
  ["CP12", "Chi dịch vụ ngoài – Phần mềm", "Phí KiotViet, dịch vụ vận chuyển, giao hàng, thuê nhân công, vệ sinh, bảo trì thuê ngoài và các dịch vụ khác.", group("CP12")],
  ["CP13", "Chi Marketing", "Quảng cáo, thiết kế và in poster, truyền thông, khuyến mãi, trang trí, tổ chức sự kiện và chương trình quảng bá quán.", group("CP13")],
  ["CP14", "Chi thuế – Pháp lý", "Các khoản thuế, phí, lệ phí, giấy phép kinh doanh, an toàn thực phẩm, PCCC và thủ tục pháp lý liên quan.", group("CP14")],
  ["CP15", "Chi quản lý, vận hành", "Phí thuê đơn vị quản lý, vận hành quán cà phê; phí quản lý cố định hằng tháng; phí quản lý theo tỷ lệ doanh thu; phí quản lý theo hiệu quả kinh doanh; các khoản phí quản lý và vận hành theo hợp đồng.", group("CP15")],
  ["CP16", "Chi hoàn tiền", "Chi hoàn tiền khách hoặc giao dịch điều chuyển phải theo dõi riêng theo bản chất.", group("CP16")],
  ["CP17", "Chi bồi thường KH", "Chi bồi thường khách do sự cố, khiếu nại hoặc chất lượng dịch vụ.", group("CP17")],
  ["CP18", "Chi rút tiền – Điều chuyển tiền", "Rút tiền tài khoản nhập quỹ, chuyển quỹ, chuyển tiền giữa các tài khoản, chuyển hoặc thanh toán tiền cho chủ đầu tư.", group("CP18")],
  ["CP19", "Chi khác", "Mua đá sử dụng trong chế biến, các khoản chi hợp lệ phát sinh chưa thuộc nhóm cụ thể.", group("CP19")],
];
/** Mini mart: sheet CHI MINIMART. */
export const MART_EXPENSES: [string, string, string, string][] = [
  ["CP01", "Chi đầu tư TSCĐ", "Tủ lạnh, tủ đông, máy làm đá, máy móc, thiết bị và tài sản đủ điều kiện ghi nhận TSCĐ.", group("CP01")],
  ["CP02", "Chi mua đồ dùng – CCDC", "Ly, cốc, khay, bình lắc, dụng cụ pha chế, bàn ghế, đồng phục, đồ dùng phục vụ khách và CCDC khác.", group("CP02")],
  ["CP03", "Chi sửa chữa – Bảo dưỡng", "Sửa chữa, bảo trì, bảo dưỡng máy móc, thiết bị, hệ thống điện nước, điều hòa, bàn ghế và cơ sở vật chất.", group("CP03")],
  ["CP05", "Chi mua hàng hóa", "Cà phê, trà, sữa, syrup, đường, trái cây, bánh, topping, bia, nước giải khát, hàng hóa nhập kho phục vụ kinh doanh.", food],
  ["CP06", "Chi bao bì – Vật tư", "Ly giấy, nắp ly, ống hút, túi đựng bánh, túi quai, giấy ăn, bao tay, vật tư đóng gói, vật tư vệ sinh.", food],
  ["CP08", "Chi khai trương – Sự kiện", "Chi khai trương, tổ chức sự kiện, hoa, cây xanh, trang trí quán, trang trí Tết, vật phẩm trang trí và chi phí phục vụ sự kiện.", group("CP08")],
  ["CP10", "Chi nhân sự – BHXH – Phúc lợi", "Lương, phụ cấp, thưởng KPI, thưởng lễ Tết, ứng lương, BHXH, BHYT, BHTN, quà Tết, hiếu hỷ, thai sản, thăm hỏi, du lịch nhân viên.", group("CP10")],
  ["CP11", "Chi điện nước – Viễn thông, phí dv", "Tiền điện, nước, Internet, điện thoại, phí quẹt thẻ, phí giao dịch ngân hàng.", group("CP11")],
  ["CP12", "Chi dịch vụ ngoài - phần mềm ql", "Phí phần mềm KiotViet, dịch vụ giao hàng, vận chuyển, thuê nhân công, dịch vụ vệ sinh, bảo vệ và dịch vụ thuê ngoài khác, chi phần mềm quản lý.", group("CP12")],
  ["CP13", "Chi Marketing", "Quảng cáo Google, Facebook, thiết kế và in poster, chụp ảnh, truyền thông, khuyến mãi, quảng bá sản phẩm và thương hiệu.", group("CP13")],
  ["CP15", "Chi quản lý, Vận hành", "Phí thuê đơn vị quản lý, vận hành quán; phí quản lý cố định, phí quản lý theo doanh thu, phí quản lý theo hiệu quả kinh doanh và các khoản phí theo hợp đồng.", group("CP15")],
  ["CP16", "Chi hoàn tiền khách hàng", "Hoàn tiền đơn hàng bị hủy, hoàn tiền do khách thanh toán thừa, hoàn tiền đặt cọc, hoàn tiền do sai đơn hàng, lỗi sản phẩm hoặc chất lượng dịch vụ.", group("CP16")],
  ["CP17", "Chi bồi thường KH", "Chi bồi thường khách do sự cố, khiếu nại hoặc chất lượng dịch vụ.", group("CP17")],
  ["CP18", "Chi rút tiền – Điều chuyển tiền", "Rút tiền tài khoản nhập quỹ, chuyển quỹ, chuyển tiền giữa các tài khoản, chuyển hoặc thanh toán tiền cho chủ đầu tư.", group("CP18")],
  ["CP19", "Chi khác", "Các khoản chi hợp lệ phát sinh trong hoạt động kinh doanh chưa thuộc các nhóm chi phí đã quy định.", group("CP19")],
];

/** Names the F&B sheets used before the lists above, with the kind they stand for now: [old name, current name]. */
export const OLD_FNB_KINDS: [string, string][] = [
  ["Chi NL cafe", "Chi nguyên liệu pha chế"], ["Chi NL ăn sáng", "Chi nguyên liệu pha chế"], ["Chi bao bì, vật tư", "Chi bao bì – Vật tư"],
  ["Quản lý,vận hành", "Chi quản lý, vận hành"], ["Chi Maketing", "Chi Marketing"], ["Chi mua TSCĐ", "Chi đầu tư TSCĐ"],
];
