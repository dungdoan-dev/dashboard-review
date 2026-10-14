# Reviewdesk

Dashboard Next.js để quản lý nhiều cơ sở, xem điểm sao và số lượng đánh giá Google Maps / Tripadvisor / Agoda / Booking.com / Trip.com / Expedia / Traveloka, lưu lịch sử snapshot và xuất CSV.

## Chạy chế độ demo

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000`. Khi chưa có biến môi trường Supabase, ứng dụng hiển thị dữ liệu minh họa. Thêm/sửa/xóa và ghi snapshot trong chế độ này chỉ thay đổi state trên trình duyệt.

## Kết nối Supabase

1. Tạo project Supabase.
2. Mở SQL Editor và chạy toàn bộ nội dung `supabase/schema.sql`.
3. Sao chép `.env.example` thành `.env.local`.
4. Điền Project URL và Publishable key từ Supabase Dashboard → Connect.
5. Khởi động lại `npm run dev`, đăng ký tài khoản trong giao diện và đăng nhập.

Schema bật RLS cho cả hai bảng. Mỗi location gắn với `auth.uid()`; snapshot chỉ đọc/ghi được nếu người dùng sở hữu location tương ứng. Không đưa `service_role` key vào biến `NEXT_PUBLIC_*` hoặc commit vào Git.

## Chức năng

- Dashboard tổng quan số cơ sở, điểm trung bình theo cơ sở và tổng số đánh giá mỗi nền tảng (Google Maps thang 5, Tripadvisor thang 5, Agoda thang 10, Booking.com thang 10, Trip.com thang 10, Expedia thang 10, Traveloka thang 10).
- Tạo, sửa, xóa cơ sở; lưu link Google Maps, Tripadvisor, Agoda, Booking.com, Trip.com, Expedia và Traveloka.
- **Cào dữ liệu tự động theo từng nguồn**: TripAdvisor, Agoda và Traveloka dùng Apify Actors; Expedia dùng ZenRows; các nền tảng còn lại dùng scraper hiện có. Bấm nút cập nhật trong bảng nền tảng hoặc biểu tượng đồng bộ cạnh cơ sở để lấy điểm và số lượt đánh giá mới nhất.
- Ghi snapshot thủ công với điểm và/hoặc số lượng, giữ nhãn và thời điểm lấy (tự động phân biệt thang 5 và thang 10).
- Tìm kiếm, lọc theo loại hình/nền tảng và xuất CSV.
- Đăng ký/đăng nhập email-password qua Supabase Auth.

## Cào dữ liệu tự động (Dashboard hỗ trợ 7 nền tảng)

Bạn có thể cào dữ liệu qua 2 cách:
1. **Từ giao diện Dashboard**:
   - Trong bảng nền tảng, bấm **Cập nhật** để crawl nền tảng đó.
   - Hoặc bấm biểu tượng đồng bộ cạnh từng cơ sở trong bảng tương ứng.
   - Ứng dụng kích hoạt API `/api/crawl`, gọi dịch vụ scraper tương ứng và ghi snapshot vào Supabase.

2. **Từ dòng lệnh CLI**:
```powershell
# Google Maps
npm run scrape                      # Chạy ẩn Google Maps
npm run scrape:headless             # Chạy ẩn Google Maps
node scraper/gmaps-scraper.mjs --url "https://maps.app.goo.gl/..."  # Mặc định chạy ẩn
node scraper/gmaps-scraper.mjs --headed --url "https://maps.app.goo.gl/..."  # Mở cửa sổ trình duyệt

# Tripadvisor (Dashboard gọi ZenRows Fetch; cần ZENROWS_API_KEY. Các lệnh bên dưới là scraper Puppeteer CLI cũ)
npm run scrape:tripadvisor          # Chạy ẩn Tripadvisor
npm run scrape:tripadvisor:headless # Chạy ẩn Tripadvisor
npm run scrape:tripadvisor:save     # Cào và lưu snapshot vào Supabase
node scraper/tripadvisor-scraper.mjs --headless --url "https://www.tripadvisor.com.vn/Hotel_Review-..."

# Agoda (Thang điểm 10)
npm run scrape:agoda                # Chạy ẩn Agoda
npm run scrape:agoda:headless       # Chạy ngầm Agoda
npm run scrape:agoda:save           # Cào và lưu snapshot vào Supabase
node scraper/agoda-scraper.mjs --headless --url "https://www.agoda.com/vi-vn/yzistel-hoi-an/hotel/hoi-an-vn.html?..."

# Booking.com (Thang điểm 10)
npm run scrape:booking              # Chạy ẩn Booking.com
npm run scrape:booking:headless     # Chạy ngầm Booking.com
npm run scrape:booking:save         # Cào và lưu snapshot vào Supabase
node scraper/booking-scraper.mjs --headless --url "https://www.booking.com/hotel/vn/yzistel.vi.html"

# Trip.com (Thang điểm 10)
npm run scrape:tripcom              # Chạy ẩn Trip.com
npm run scrape:tripcom:headless     # Chạy ngầm Trip.com
npm run scrape:tripcom:save         # Cào và lưu snapshot vào Supabase
node scraper/tripcom-scraper.mjs --headless --url "https://us.trip.com/hotels/detail/?cityId=1775&hotelId=126921251"

# Cào tất cả các nền tảng
npm run scrape:all
```

## Lệnh

```powershell
npm run dev
npm run lint
npm run build
npm run scrape
npm run scrape:tripadvisor
npm run scrape:agoda
npm run scrape:booking
npm run scrape:tripcom
```
