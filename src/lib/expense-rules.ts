// Keywords that tell which of the 16 expenses a line is, from what is typed in "Nội dung chi". The longest keyword found wins ("mì tôm cho nhân viên": "nhân viên" beats "mì tôm").
// Same rules as the tab "Quy tắc hạng mục" of the hotel's Google Sheet (scripts/apps-script/hang-muc-chi.gs reads that tab); this list is what the tab starts from.
// A keyword matches at the start of a word, accents and case ignored. Checked against the real lines of Sontra, August and October 2026: expense-rules.test.ts.
import { EXPENSES } from "./expense-kinds.ts";

const NAME = Object.fromEntries(EXPENSES.map((e) => [e[0], e[1]])) as Record<string, string>;

const BY_CODE: Record<string, string[]> = {
  CP11: ["tiền điện", "điện tháng", "điện khu", "tiền nước", "nước tháng", "nước khu", "internet", "fpt", "truyền hình", "vnpt", "cước", "điện thoại", "sms", "phí quẹt thẻ", "quẹt thẻ", "quẹ thẻ", "phí ck", "phí chuyển khoản", "phí ngân hàng", "phí sao kê", "tiền rác", "thu gom rác", "rác tháng"],
  CP13: ["hoa hồng", "marketing", "mkt", "quảng cáo", "quảng bá", "google ads", "facebook ads", "chụp ảnh", "viết bài", "book phòng", "môi giới"],
  CP14: ["thuế", "thuế nhà thầu", "nhà thầu", "gtgt", "tndn", "môn bài", "pccc", "công an", "giấy phép", "chữ ký số", "khai báo", "sổ khai", "đăng ký kinh doanh", "an ninh trật tự", "bluejay", "kiotviet"],
  CP10: ["lương", "thưởng", "bhxh", "bhyt", "bhtn", "phụ cấp", "ứng lương", "phúc lợi", "đồng phục", "nhân viên", "quà tết", "hiếu hỷ", "thai sản", "team building", "tất niên"],
  CP09: ["thuê khách sạn", "thuê khác sạn", "tiền thuê", "thuê nhà phụ", "thuê nhà khu", "thuê mặt bằng"],
  CP15: ["quản lý vận hành", "quản lý và vận hành", "quản lý, vận hành", "phí quản lý"],
  CP12: ["kế toán", "dv kt", "tư vấn thuế", "tư vấn", "giặt là", "giặt ủi", "thuê xe", "xe kt", "đón sân bay", "đưa đón", "sân bay", "casual", "tour", "dịch vụ du lịch", "vận chuyển", "gửi hàng", "dịch vụ ngoài"],
  CP07: ["minibar", "amenities", "amenity", "snack", "nước suối", "nước sport", "bình nước", "nước bình", "thuốc xịt", "xịt tẩy", "xịt muỗi", "aquafina", "coca", "bò húc", "bia", "mì tôm", "cà phê", "trà", "hóa chất", "nước giặt", "bột giặt", "nước xả", "javen", "nước lau sàn", "vệ sinh", "giấy vệ sinh", "giấy ăn", "khăn giấy", "túi rác", "bao rác", "vật tư", "bàn chải", "lược", "tăm bông", "dầu gội", "sữa tắm", "pin ", "keo", "decal"],
  CP03: ["sửa", "bảo dưỡng", "thay ", "aptomat", "vòi sen", "dây sen", "bát sen", "vòi xịt", "bản lề", "đường ống", "máy bơm", "sạc bình", "thay nhớt", "linh kiện"],
  CP02: ["máy sấy tóc", "ấm siêu tốc", "ly cốc", "ccdc", "thảm", "giường", "nệm", "khay", "bút bi", "ream giấy", "kệ", "tủ"],
  CP01: ["tscđ", "mua máy giặt", "mua máy sấy", "tivi", "ti vi", "két sắt", "cây nước", "máy chấm công", "mua xe", "mua ô tô"],
  CP08: ["trang trí", "khai trương", "sự kiện", "cây xanh", "chậu cây", "phân bón", "quà tặng khách", "hoa quả", "bình hoa", "hoa tết"],
  CP17: ["bồi thường"],
  CP16: ["hoàn tiền", "hoàn cọc", "hoàn phòng", "giảm giá"],
  CP18: ["luân chuyển", "rút tiền", "nhập quỹ", "chuyển tiền sang", "chuyển quỹ", "chủ đầu tư", "điều chuyển"],
  CP19: ["văn phòng phẩm", "in ấn", "mực in", "hộp mực", "giấy in", "quan hệ đối ngoại", "chi khác"],
};

/** Keywords that only count when no other keyword is found: a bank fee mentioned in passing ("DV kế toán và phí ck 22k") must not decide the expense. */
const WEAK = new Set(["phí ck", "phí chuyển khoản", "phí ngân hàng", "phí sao kê", "quẹt thẻ", "cước"]);

/** [keyword, expense name, weak] in the order of the template's list. */
export const EXPENSE_RULES: [string, string, boolean][] = Object.entries(BY_CODE).flatMap(([code, words]) => words.map((w): [string, string, boolean] => [w, NAME[code], WEAK.has(w)]));
