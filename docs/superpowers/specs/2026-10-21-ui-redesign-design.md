# Giao diện congcure: thiết kế lại

Ngày: 2026-10-21 · Trạng thái: đã duyệt hướng làm; làm header, trang chủ và trang sản phẩm trước để chủ shop duyệt bằng ảnh chụp.

## Tham chiếu

- **Cấu trúc trang** lấy theo mixmmo.com:
  - Thanh trên cùng: giờ làm việc, chính sách, FAQ, liên hệ.
  - Header: logo, ô tìm kiếm lớn, số dư, tài khoản. Menu ngang: Trang chủ, Sản phẩm, Nạp tiền, Lịch sử, Tài liệu API, kèm link Telegram.
  - Banner, rồi đến hàng nút danh mục dạng viên thuốc (pill).
  - Mỗi danh mục là một khối: thanh tiêu đề, bên dưới là các **dòng** sản phẩm. Mỗi dòng có tên, định dạng giao hàng, nhãn "Kho hàng: N", ô giá và nút MUA NGAY. Cuối khối có nút "Xem thêm".
- **Font và màu** lấy theo generaladmission.house (đo trực tiếp trên web thật):
  - Nền `#FEFEFD`, chữ `#000`, màu nhấn duy nhất `#FF0000`, viền `#D1D1D1`.
  - Font grotesk, tiêu đề in hoa cỡ lớn dàn sát; font mono cho nhãn.
  - Nút bo tròn hẳn (pill), không đổ bóng.

## Quyết định

- **Tên shop:** `congcure`. Logo là chữ `CONGCURE®`. Mọi thông tin của shop (tên, khẩu hiệu, giờ làm việc, Telegram) nằm trong `apps/web/src/lib/site.ts`.
- **Font:**
  - Inter Tight cho chữ chính, thay Monument Grotesk (font trả phí).
  - JetBrains Mono cho giá, tồn kho, mã đơn, định dạng tài khoản và nhãn.
  - Cả hai tải qua `next/font/google`, có bộ ký tự tiếng Việt (`vietnamese`).
- **Màu:** khai báo bằng biến CSS (`--bg`, `--fg`, `--muted`, `--line`, `--accent`).
  - Sáng: `#FEFEFD` / `#000` / `#6B6B6B` / `#D1D1D1` / `#FF0000`.
  - Tối: `#0B0B0B` / `#FEFEFD` / `#9A9A9A` / `#2A2A2A` / `#FF2A2A`.
- **Chế độ tối:**
  - Gắn class `dark` trên thẻ `<html>`; Tailwind v4 dùng `@custom-variant dark`.
  - Nút chuyển sáng/tối ở header. Lựa chọn lưu trong `localStorage`; lần đầu vào thì theo cài đặt hệ thống.
  - Một đoạn script nhỏ chạy trong `<head>` để trang không bị nháy sai màu lúc mới tải.
- **Thành phần:**
  - Nút chính nền đen chữ trắng, rê chuột vào chuyển đỏ. Nút phụ chỉ có viền.
  - Nhãn tồn kho dạng viên, viền chữ mono. Giá chữ đỏ, font mono.
  - Tiêu đề khối danh mục: chữ in hoa cỡ lớn, kẻ một vạch dưới.
- **Banner:** chữ `CONGCURE®` in hoa rất lớn, câu khẩu hiệu, ba ô số liệu: số sản phẩm đang bán, số đơn đã giao, "Tự động 24/7".
- **Tìm kiếm ở header:** gửi `GET /?q=`. Trang chủ lọc sản phẩm theo tên (không phân biệt dấu). Trang tìm kiếm riêng để sang phần "tính năng cho khách".
- **Mobile:** menu gập dùng `<details>`, không cần JavaScript. Dòng sản phẩm xếp dọc, giá và nút nằm dưới tên.
- **Trang chủ:** mỗi danh mục hiện tối đa 5 sản phẩm. "Xem thêm" dẫn tới `/danh-muc/[slug]`, trang này dùng cùng kiểu dòng sản phẩm.

## Phạm vi đợt này

Layout (thanh trên, header, footer), trang chủ, trang danh mục, trang sản phẩm, nút chuyển sáng/tối. Các trang còn lại (đơn hàng, nạp tiền, tài khoản, đăng nhập, admin) tự đổi theo vì dùng chung các class `.btn`, `.card`, `.input`, `.table`; sẽ chỉnh chi tiết sau khi chủ shop duyệt ảnh chụp.
