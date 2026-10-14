# Reviewdesk

## Cafe và Mart 24h (GrabFood)

Chạy `supabase/migrations/20261014020000_grabfood_metrics.sql` và `20261014040000_grabfood_daily_reports.sql` (cho phép chốt báo cáo ngày có GrabFood) cho database hiện có. Header có 2 bộ lọc: Loại hình (Khách sạn / Cafe / Mart 24h) rồi Cơ sở của loại đó; nền tảng trong bảng và báo cáo theo loại (Khách sạn: các OTA; Cafe: Google, Tripadvisor, GrabFood; Mart 24h: Google, Tripadvisor, GrabFood). Cơ sở loại Cafe và Mart 24h dùng Google Maps, Tripadvisor và GrabFood; bảng GrabFood chỉ hiện với hai loại này. Điểm GrabFood thang 5, lấy từ API công khai của food.grab.com bằng mã cửa hàng cuối URL (không cần token). Báo cáo ngày chưa gồm GrabFood.

Đánh giá GrabFood lấy từ portal merchant (merchant.grab.com). Chạy `supabase/migrations/20261014030000_grab_merchant_accounts.sql`, đặt `GRAB_CREDENTIALS_KEY` (chuỗi ngẫu nhiên ≥16 ký tự, chỉ ở server/`.env`; đổi khóa sẽ làm mật khẩu đã lưu không giải mã được), `SUPABASE_SERVICE_ROLE_KEY`. Nút Cập nhật ở bảng GrabFood cũng dùng tài khoản này (chạy Chrome ngầm trên máy chủ Next.js, nên chỉ hoạt động khi tự host, không phải Vercel). Trong form sửa cơ sở loại Cafe hoặc Mart 24h, nhập tài khoản và mật khẩu Grab: mật khẩu được mã hóa AES-256-GCM ở server, không bao giờ gửi lại về trình duyệt. Trên máy có Chrome chạy `npm run scrape:grab:all` (cần Node ≥ 22.18): mỗi cơ sở dùng tài khoản và profile riêng, chạy ngầm và lưu snapshot. Nếu Grab đòi OTP, chạy `npm run scrape:grab:login -- --all` để đăng nhập tay từng cơ sở một lần.

## Thông báo Tripadvisor

Chạy `supabase/migrations/20261014010000_tripadvisor_notice.sql` trong Supabase SQL Editor cho database hiện có. Lần đồng bộ Tripadvisor tiếp theo sẽ lưu nội dung “Thư từ Tripadvisor” nếu Markdown có mục này. Chốt sổ lại ngày cần xem để nội dung xuất hiện trong mục “Báo cáo từ Tripadvisor” của trang xếp hạng; báo cáo đã chốt trước khi thêm trường này không tự có lại nội dung cũ.

## Đồng bộ tự động trên Vercel (Khách sạn, Cafe, Mart 24h)

Quy tắc chốt sổ: nguồn nào lấy và lưu số liệu thành công thì được chốt sổ ngay; nguồn lỗi bị bỏ qua, lần chạy đó ghi trạng thái "chốt một phần" (hoặc "lỗi" nếu không nguồn nào thành công) và mỗi lỗi được báo vào chuông thông báo trên header (bảng `notifications`, giữ 30 ngày; lỗi khi cào thủ công cũng được ghi vào đây). Chạy thêm `supabase/migrations/20261014060000_notifications_and_partial_sync.sql`.

Mỗi loại hình có lịch, khung giờ và hàng đợi riêng trong Cài đặt (chạy thêm `supabase/migrations/20261014050000_automatic_sync_location_types.sql`). Giải trí là loại thứ 4, chỉ có Google Maps và Tripadvisor (chạy `supabase/migrations/20261014070000_entertainment_location_type.sql`). Cafe và Mart 24h đồng bộ Google Maps, Tripadvisor và GrabFood; GrabFood dùng tài khoản merchant lưu cho từng cơ sở (cần `GRAB_CREDENTIALS_KEY` trên Vercel), tự đăng nhập mỗi lần chạy vì Vercel không giữ phiên; nếu Grab đòi OTP hoặc chặn IP datacenter thì nguồn này lỗi. Nút "Chạy thử" ở mỗi mục kiểm tra từng nguồn mà không lưu hay chốt sổ.

## Đồng bộ khách sạn tự động trên Vercel

1. Chạy `supabase/migrations/20261014000000_automatic_hotel_sync.sql` trong Supabase SQL Editor cho database hiện có. Khi tạo database mới, `supabase/schema.sql` đã chứa các bảng này.
2. Trong Vercel Project Settings → Environment Variables, đặt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` và `CRON_SECRET` (chuỗi ngẫu nhiên ít nhất 16 ký tự). Giữ service role key và cron secret ở phía server; không thêm tiền tố `NEXT_PUBLIC_` cho chúng. Thêm các API key scraper đang dùng nếu cần.
3. Deploy lại lên Vercel. `vercel.json` tạo 24 cron hằng ngày, mỗi cron phụ trách một khung giờ Việt Nam. Trong Cài đặt, bật lịch, chọn khung giờ và sắp xếp các khách sạn trong hàng đợi.

Cron chạy theo giờ Việt Nam và xử lý từng cơ sở theo thứ tự. Mỗi nguồn lấy và lưu số liệu thành công thì được chốt báo cáo ngày ngay; nguồn lỗi không chặn các nguồn khác, xuất hiện trong "Lần chạy gần đây" ở Cài đặt và trong chuông thông báo. Mỗi cơ sở chỉ được thử một lần mỗi ngày, nên nguồn lỗi cần được cập nhật và chốt thủ công nếu muốn có số liệu hôm đó. Một lần chạy Vercel có giới hạn tối đa 5 phút; nếu hàng đợi dài, các cơ sở còn lại được tiếp tục ở lần cron kế tiếp trong cùng ngày. Trên Vercel Hobby, cron có thể gọi bất kỳ lúc nào trong khung giờ đã chọn, không bảo đảm đúng phút đầu giờ.

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
