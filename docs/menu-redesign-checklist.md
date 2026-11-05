# Thiết kế lại thanh menu bên trái — checklist

Làm lần lượt từ trên xuống. Mỗi bước có skill nên dùng và việc phải xong trước khi sang bước sau.
Code của menu: `src/components/reviewdesk-app.tsx` (khối `<aside className="sidebar">`, hàm `navGroup`, biến `pageGroup`), CSS trong `src/app/globals.css` (`.sidebar`, `.nav-*`).

## Hiện trạng (để đối chiếu)

- **VẬN HÀNH** (9 mục): Vận hành khách sạn, Doanh thu & thanh toán, Doanh thu theo ngày, So sánh khách sạn, Kho, Thu chi, Báo cáo quản lý, Kết quả HĐKD, Đối soát bảng kê.
- **NHÂN SỰ** (2 mục): Nhân sự, Tuyển dụng.
- **MARKETING** (11 mục, 4 tiêu đề nhỏ):
  - Báo cáo: Báo cáo marketing
  - Đánh giá: Tổng quan, Chi tiết cơ sở, So sánh cơ sở
  - Kênh: Google Maps, Facebook, Instagram, Google Analytics, TikTok
  - Quảng cáo: Facebook Ads, Google Ads
- **Cài đặt**, và cuối menu là khung tài khoản (đăng xuất).
- **Theo vai trò:** `admin` thấy tất cả; `hr` chỉ thấy NHÂN SỰ; `mkt` chỉ thấy MARKETING (chỉ xem).
- **Ba trạng thái:** mở rộng, thu gọn (chỉ biểu tượng, chữ hiện khi rê chuột), và trên điện thoại (trượt ra từ nút ☰ trên thanh tiêu đề).

---

## Bước 1 · Soát hiện trạng — `design:design-critique`

- [x] Chụp menu ở 3 trạng thái (mở rộng, thu gọn, điện thoại). Chụp trên bản chạy mẫu, giao diện của `admin`; `hr` và `mkt` đối chiếu theo code.
- [x] Ghi các điểm vướng (bảng bên dưới).
- [ ] Ghi các mục dùng nhiều nhất: chưa có số liệu lượt mở trang, cần hỏi người dùng thật.
- [x] Chốt danh sách vấn đề cần sửa, xếp theo mức độ.

### Kết quả bước 1 (05/11/2026)

**Số đo:** menu rộng 236px (thu gọn 55px); mỗi mục cao 40px, chữ 12px màu `#6d6d78` (tương phản khoảng 5:1, đạt); tiêu đề nhóm 11px; tiêu đề nhỏ trong MARKETING 10,5px màu `#8a8a96` (tương phản khoảng 3,4:1, **không đạt** 4,5:1). Phím Tab đi đúng thứ tự từ trên xuống.

| # | Vấn đề | Mức | Đề xuất |
|---|---|---|---|
| 1 | Mở Tổng quan thì nhóm **VẬN HÀNH** mở còn **MARKETING đóng**: trang đang xem (Tổng quan thuộc Marketing) không thấy trên menu. Code cố ý mở Vận hành khi vào `/`. | 🔴 | Luôn mở nhóm chứa trang đang xem; hoặc đổi trang chủ `/` sang trang của nhóm đầu tiên. |
| 2 | Mục đang chọn không có `aria-current="page"`: trình đọc màn hình không biết đang ở trang nào. | 🔴 | Thêm `aria-current` cho mục đang chọn. |
| 3 | **Menu thu gọn** là một cột 23 biểu tượng liền nhau, không có vạch chia nhóm, dài quá màn hình 1000px (Google Ads và Cài đặt bị đẩy xuống phải cuộn). Logo thu còn một chấm nhỏ. | 🟡 | Thêm vạch chia giữa các nhóm khi thu gọn, hoặc thu gọn theo nhóm (một biểu tượng mỗi nhóm, rê chuột hiện danh sách). |
| 4 | Biểu tượng trùng hoặc gần giống nhau: "So sánh khách sạn" và "Báo cáo marketing" cùng biểu tượng biểu đồ; nhiều biểu tượng bảng/giấy (Thu chi, Báo cáo quản lý, Kho) khó phân biệt khi thu gọn. | 🟡 | Mỗi mục một biểu tượng riêng (bước 4). |
| 5 | Tiêu đề nhỏ (BÁO CÁO, ĐÁNH GIÁ, KÊNH, QUẢNG CÁO) chữ quá nhạt và nhỏ. | 🟡 | Đậm lên tối thiểu `#6d6d78`, cỡ 11px. |
| 6 | Với tài khoản `hr` (chỉ NHÂN SỰ) và `mkt` (chỉ MARKETING), menu chỉ còn một nhóm nhưng vẫn có nút mở/đóng nhóm: thêm một bước bấm vô ích. | 🟡 | Khi chỉ có một nhóm, bỏ nút mở/đóng, hiện thẳng các mục. |
| 7 | Tên dễ lẫn: "So sánh khách sạn" (Vận hành) và "So sánh cơ sở" (Marketing); "Doanh thu & thanh toán" và "Doanh thu theo ngày"; Google Maps ở Kênh trùng tên nền tảng đánh giá. | 🟡 | Xử lý ở bước 3. |
| 8 | Khoảng trống lớn giữa các nhóm khi đóng (NHÂN SỰ, MARKETING cách nhau ~58px) làm menu trông rời rạc. | 🟢 | Giảm khoảng cách tiêu đề nhóm. |
| 9 | Cài đặt nằm tách ở cuối, chung chỗ với khung tài khoản: hợp lý, giữ nguyên. | ✅ | — |

**Đang ổn:** mục cao 40px dễ bấm trên điện thoại; menu điện thoại trượt ra có lớp nền tối; mục đang chọn có nền tím nhạt và chữ tím rõ; khi thu gọn, rê chuột hiện tên mục.

## Bước 2 · Chọn hướng — quyết định của bạn

**Đã chọn: đổi cấu trúc.** Đề xuất cây menu mới (chờ duyệt):

```
[Ô tìm mục]                      Ctrl+K: gõ vài chữ là ra mục, Enter để mở
GHIM                             tối đa 5 mục tự chọn (bấm ☆ cạnh mục), nhớ theo trình duyệt
VẬN HÀNH
  Báo cáo      Vận hành khách sạn · So sánh khách sạn · Kết quả HĐKD · Báo cáo quản lý
  Doanh thu    Doanh thu & thanh toán · Doanh thu theo ngày · Đối soát bảng kê
  Tiền & kho   Thu chi · Kho
NHÂN SỰ         Nhân sự · Tuyển dụng
MARKETING
  Báo cáo      Báo cáo marketing
  Đánh giá     Tổng quan đánh giá · Chi tiết cơ sở · So sánh cơ sở
  Kênh         Google Maps · Facebook · Instagram · Google Analytics · TikTok
  Quảng cáo    Facebook Ads · Google Ads
─────
Cài đặt · Tài khoản
```

- **Nhóm đang mở:** luôn là nhóm chứa trang đang xem (sửa lỗi 1); các nhóm khác vẫn mở/đóng được.
- **Vai trò chỉ có một nhóm** (`hr`, `mkt`): không có nút mở/đóng, các mục hiện thẳng (sửa lỗi 6).
- **Thu gọn:** mỗi nhóm một biểu tượng (Vận hành, Nhân sự, Marketing, Cài đặt); rê chuột hoặc bấm thì hiện danh sách mục của nhóm bên cạnh (sửa lỗi 3).
- **Không đổi:** đường dẫn các trang, phân quyền, thứ tự Vận hành → Nhân sự → Marketing.

- [x] Duyệt cây menu và các tính năng (05/11/2026). **Chỉ giữ "thu gọn theo nhóm".** Không làm: ô tìm mục, ghim mục, chia tiêu đề nhỏ cho Vận hành (Vận hành giữ 9 mục như hiện tại). Hai sửa lỗi chung vẫn làm: luôn mở nhóm chứa trang đang xem, và vai trò chỉ có một nhóm thì không có nút mở/đóng.

Cây menu đã chốt:

```
VẬN HÀNH
  Báo cáo      Báo cáo vận hành · So sánh khách sạn · Kết quả kinh doanh · Báo cáo quản lý
  Doanh thu    Đặt phòng & thanh toán · Doanh thu theo ngày · Đối soát bảng kê
  Tiền & kho   Thu chi · Kho          (thêm theo yêu cầu 05/11/2026)
NHÂN SỰ         Nhân sự · Tuyển dụng
MARKETING       Báo cáo · Đánh giá · Kênh · Quảng cáo (như hiện tại)
─────
Cài đặt · Tài khoản
Thu gọn: 4 biểu tượng (Vận hành, Nhân sự, Marketing, Cài đặt); rê chuột hoặc bấm vào biểu tượng nhóm thì hiện danh sách mục của nhóm đó.
```

- [x] Chọn một trong hai:
  - **Chỉ làm đẹp:** giữ nhóm và thứ tự hiện tại.
  - **Đổi cấu trúc:** sắp xếp lại nhóm, thêm tìm kiếm mục, ghim mục hay dùng…
- [x] Nếu đổi cấu trúc: vẽ cây menu mới (nhóm → mục) trên giấy hoặc trong file này, kiểm tra lại với từng vai trò. `admin`: 3 nhóm + Cài đặt; `hr`: chỉ NHÂN SỰ, hiện thẳng 2 mục, thu gọn còn 1 biểu tượng; `mkt`: chỉ MARKETING, hiện thẳng, thu gọn còn 1 biểu tượng.
- [x] Chốt những thứ **không đổi**: đường dẫn các trang (link đã lưu phải còn chạy) và phân quyền.

## Bước 3 · Đặt tên — `design:ux-copy`

**Đề xuất (05/11/2026, chờ duyệt).** Nguyên tắc: mỗi tên nói đúng nội dung trang, không lặp tên nhóm, hai mục cùng chủ đề phải khác nhau ngay ở chữ đầu, tối đa khoảng 20 ký tự. "Chú thích" là chữ hiện khi rê chuột (dùng ở chế độ thu gọn và cho người mới).

| Nhóm | Tên hiện tại | Tên đề xuất | Chú thích khi rê chuột | Lý do |
|---|---|---|---|---|
| Vận hành | Vận hành khách sạn | **Báo cáo vận hành** | Công suất, ADR, RevPAR theo tuần hoặc khoảng ngày | Lặp tên nhóm; trang chính là báo cáo |
| Vận hành | Doanh thu & thanh toán | **Đặt phòng & thanh toán** | Từng đặt phòng: tiền phòng, dịch vụ, đã thu, còn nợ | Dễ lẫn với "Doanh thu theo ngày"; trang liệt kê theo đặt phòng |
| Vận hành | Doanh thu theo ngày | Doanh thu theo ngày *(giữ)* | Tiền phòng và dịch vụ theo ngày trả phòng | — |
| Vận hành | So sánh khách sạn | So sánh khách sạn *(giữ)* | Công suất và doanh thu từng khách sạn theo tuần | Mục Marketing đổi tên nên hết trùng |
| Vận hành | Kho | Kho *(giữ)* | Nhập, xuất, tồn kho theo tháng | — |
| Vận hành | Thu chi | Thu chi *(giữ)* | Tiền thu và chi theo bảng kê | — |
| Vận hành | Báo cáo quản lý | Báo cáo quản lý *(giữ)* | Bảng tuần của kế toán: doanh thu, thu chi, F&B | — |
| Vận hành | Kết quả HĐKD | **Kết quả kinh doanh** | Doanh thu, chi phí, lợi nhuận theo tháng | Bỏ chữ viết tắt |
| Vận hành | Đối soát bảng kê | Đối soát bảng kê *(giữ)* | So bảng kê thu với Blue Jay | — |
| Nhân sự | Nhân sự | **Hồ sơ nhân sự** | Danh sách, hồ sơ và thống kê nhân viên | Lặp tên nhóm |
| Nhân sự | Tuyển dụng | Tuyển dụng *(giữ)* | Vị trí tuyển, ứng viên, sinh nhật | — |
| Marketing · Báo cáo | Báo cáo marketing | Báo cáo marketing *(giữ)* | Review, tiếp cận, quảng cáo theo tháng hoặc khoảng ngày | — |
| Marketing · Đánh giá | Tổng quan | **Bảng điểm** | Điểm và số đánh giá mới nhất của mọi cơ sở | "Tổng quan" không nói trang có gì; trang là bảng điểm |
| Marketing · Đánh giá | Chi tiết cơ sở | Chi tiết cơ sở *(giữ)* | Điểm, lịch sử và xếp hạng của một cơ sở | — |
| Marketing · Đánh giá | So sánh cơ sở | **So sánh đánh giá** | Điểm và lượt đánh giá giữa các cơ sở theo ngày | Trùng "So sánh khách sạn" của Vận hành |
| Marketing · Kênh | Google Maps | Google Maps *(giữ)* | Lượt xem, gọi, chỉ đường trên Google Maps | Tiêu đề "Kênh" đã tách khỏi điểm đánh giá Google Maps; chú thích nói rõ |
| Marketing · Kênh | Facebook · Instagram · Google Analytics · TikTok | *(giữ)* | Lượt tiếp cận, tương tác, người theo dõi / Lượt truy cập website | Tên riêng của nền tảng |
| Marketing · Quảng cáo | Facebook Ads · Google Ads | *(giữ)* | Chi tiêu, hiển thị, nhấp, chuyển đổi | Tên riêng |
| — | Cài đặt | Cài đặt *(giữ)* | Cơ sở, đồng bộ, khóa API, phân quyền | — |

**Tên nhóm** giữ nguyên: VẬN HÀNH, NHÂN SỰ, MARKETING; tiêu đề nhỏ giữ: Báo cáo, Đánh giá, Kênh, Quảng cáo.
**Đi kèm:** dòng chữ nhỏ trên thanh tiêu đề của từng trang đổi theo tên mới (ví dụ "KẾT QUẢ HĐKD" → "KẾT QUẢ KINH DOANH", "TỔNG QUAN" → "BẢNG ĐIỂM"), để menu và trang gọi cùng một tên. Đường dẫn trang không đổi.

- [ ] Rà tên từng nhóm và từng mục: ngắn (tối đa khoảng 20 ký tự để không xuống dòng), cùng một kiểu (danh từ, không viết hoa lẫn lộn).
- [ ] Phân biệt các tên dễ lẫn: "Doanh thu & thanh toán" và "Doanh thu theo ngày"; "So sánh khách sạn" (Vận hành) và "So sánh cơ sở" (Marketing); Google Maps (đánh giá) và Google Maps (tiếp cận).
- [ ] Viết chữ chú thích khi rê chuột ở chế độ thu gọn (`data-tip`) cho từng mục.
- [ ] Chốt bảng tên cuối cùng trước khi sửa code.

## Bước 4 · Thiết kế giao diện — `agent-skills:frontend-ui-engineering`

- [x] Dùng màu, cỡ chữ, khoảng cách đang có của dashboard (tím `#5c3899`, nền trắng); không thêm màu mới.
- [x] Đủ các trạng thái của một mục: thường, rê chuột, đang chọn (thêm `aria-current="page"`), đang tập trung bàn phím. Tên mới và chú thích khi rê chuột theo bước 3; dòng chữ trên thanh tiêu đề trang đổi theo.
- [x] Tiêu đề nhóm: mở/đóng được; trang đang xem luôn mở đúng nhóm của nó (Bảng điểm mở MARKETING, Cài đặt không mở nhóm nào). Tài khoản chỉ có một nhóm (`hr`, `mkt`): các mục hiện thẳng, không có nút mở/đóng.
- [x] Chế độ thu gọn: mỗi nhóm một biểu tượng (Vận hành, Nhân sự, Marketing) + Cài đặt; nhóm đang xem tô tím; rê chuột, Tab hoặc bấm vào biểu tượng thì danh sách mục của nhóm hiện bên cạnh (có tiêu đề nhỏ), Esc đóng và trả về biểu tượng.
- [x] Điện thoại: menu trượt ra, có lớp nền tối, mở đúng nhóm của trang đang xem.
- [x] Chụp thử ở 1440px (mở rộng và thu gọn) và 390px (điện thoại) trên bản chạy mẫu. Chưa chụp 768px/1024px; ở màn ≤900px menu hẹp 212px nên tên dài như "Đặt phòng & thanh toán" có thể xuống dòng.
- [ ] Chụp với tài khoản `hr` và `mkt` thật (bản chạy mẫu chỉ có giao diện `admin`).

## Bước 5 · Kiểm tra truy cập — `design:accessibility-review`

- [ ] Đi hết menu chỉ bằng phím Tab, Enter, Space; thứ tự đi đúng thứ tự nhìn.
- [ ] Mục đang chọn có `aria-current="page"`; nút mở/đóng nhóm có `aria-expanded`.
- [ ] Chữ đạt độ tương phản tối thiểu 4,5:1 (chữ xám của tiêu đề nhỏ cần kiểm tra lại).
- [ ] Trình đọc màn hình đọc được tên mục khi menu thu gọn (không chỉ có biểu tượng).

## Bước 6 · Hoàn tất

- [ ] Kiểm tra lại với cả 3 vai trò: mỗi vai trò chỉ thấy đúng phần của mình.
- [ ] Mở thử mọi mục, đường dẫn cũ vẫn chạy.
- [ ] `npx tsc --noEmit`, lint, `npm test` sạch.
- [ ] Commit và push; sau khi deploy, xem lại trên trang thật (nhấn Ctrl+F5 nếu còn kiểu cũ).
