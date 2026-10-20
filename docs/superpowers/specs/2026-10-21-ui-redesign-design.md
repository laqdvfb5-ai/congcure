# Giao diện congcure: thiết kế lại (bản 2)

Ngày: 2026-10-21 · Trạng thái: **chờ chủ shop duyệt mockup**.
- Mockup: `docs/design/congcure-mockup.html` (mở bằng trình duyệt; nút "Tối / Sáng" trên header để xem chế độ tối).
- Ảnh chụp: `docs/design/screens/`.

Bản 1 bị từ chối vì quá sơ sài: banner chỉ có một chữ, không có hình ảnh, chưa có chất của cả hai trang tham chiếu. Bản 2 dựa trên việc đo đạc trực tiếp hai trang.

## 1. Phân tích tham chiếu

### generaladmission.house (font, màu, cách dàn trang)

Đo bằng Playwright trên web thật:

- **Chữ:**
  - Một font (ABC Monument Grotesk), **một độ đậm duy nhất là 500**.
  - Thang cỡ: 12 / 14 / 16 / 20 / 24 / 36 / 72px.
  - Khoảng cách chữ **−5%** ở mọi cỡ; khoảng cách dòng **0.9**.
  - Chữ in hoa chỉ dùng cho nhãn 12px, nút 24px và tiêu đề 72px.
- **Màu:** chỉ đen `#000`, trắng ngà `#FEFEFD`, xám `#D1D1D1` (mục chưa chọn, chữ phụ cỡ lớn). Giao diện không có màu nhấn. Màu đỏ đo được thực chất là lớp lưới thiết kế bị ẩn.
- **Lưới:** 24 cột, lề 16px, khe giữa 8px; đường kẻ mảnh chia các panel.
- **Đặc trưng:**
  - Ảnh xếp chồng kiểu cắt dán (collage) là **nguồn màu duy nhất**.
  - Chữ khổng lồ đè lên ảnh, dùng `mix-blend-mode: difference` (chữ trắng tự đảo màu).
  - Lớp chữ nền "G.A.House® / General Admission" lặp lại màu xám.
  - Vòng chữ xoay tròn, nét vẽ tay.
  - Bộ lọc "All⁽¹⁵⁾ Flower Shop⁽¹⁴⁾": mục chưa chọn màu xám, số lượng viết nhỏ phía trên.
  - Lưới sản phẩm có chú thích nhỏ: tên bên trái, giá bên phải.
  - Nút "ADD TO CART": khung chữ nhật kèm ô mũi tên vát góc.
  - Panel trượt từ phải, có chữ "CLOSE" xoay dọc.

### mixmmo.com (cấu trúc)

- Thanh trên cùng: giờ làm việc · Chính sách · FAQ · Liên hệ.
- Header: logo, ô tìm kiếm lớn, ví, tài khoản. Menu: Trang chủ · Sản phẩm · Nạp tiền · Lịch sử · Tài liệu API, kèm Telegram.
- Banner, rồi đến **thẻ công cụ** (Lấy mã 2FA…), rồi **thanh danh mục**.
- Mỗi danh mục là một khối các **dòng sản phẩm**: tên, định dạng giao hàng, "Kho hàng: N", giá, MUA NGAY. Cuối khối có nút "Xem thêm".
- MUA NGAY mở cửa sổ mua nhanh (kiểu theme CMSNT).

## 2. Quyết định thiết kế

- **Font:**
  - **Geist 500** cho mọi chữ: so mẫu tiếng Việt với 8 font miễn phí, đây là font gần Monument Grotesk nhất.
  - **Geist Mono** cho tài khoản, mã, nội dung chuyển khoản. Giá dùng Geist với số cùng độ rộng (`tabular-nums`).
  - Cả hai có bộ ký tự `vietnamese`.
- **Khoảng cách dòng cho tiếng Việt:** tiêu đề in hoa nhiều dòng dùng **1.08–1.12**, không dùng 0.9. Ở 0.9, dấu chồng như Ổ, Ố, Ả chọc lên dòng trên (đã kiểm chứng bằng bảng mẫu). Chữ thân bài dùng 1.25–1.3.
- **Màu:**
  - Sáng: nền `#FEFEFD`, chữ `#000`; `#D1D1D1` chỉ cho chữ từ 24px; chữ phụ cỡ nhỏ `#6F6F6C` (tương phản 5:1); đường kẻ `#E4E4E0`.
  - Tối: nền `#0B0B0B`, chữ `#FEFEFD`, xám tối `#3A3A3A`, chữ phụ `#8E8E8A`, đường kẻ `#242424`.
  - Màu trạng thái chỉ là **chấm tròn**: xanh `#00A651` (còn hàng, hoàn thành), vàng `#F2A900` (đang xử lý), đỏ `#FF2D2D` (lỗi, hoàn tiền).
- **Nguồn màu là "ô bìa thương hiệu"** (thay cho ảnh của General Admission):
  - Ô vuông nền màu chính chủ, logo trắng (hoặc đen nếu nền sáng).
  - Logo lấy từ Simple Icons (CC0); 46 nền tảng đã trích sẵn.
  - Hãng đã gỡ logo khỏi Simple Icons (Microsoft/Outlook/Hotmail, OpenAI, Canva, CapCut, LinkedIn, Adobe, AWS) dùng **ô chữ viết tắt** cùng font.
  - Thương hiệu được **tự nhận diện từ tên sản phẩm, rồi tên danh mục** theo bảng từ khóa. Không đổi database. Không khớp từ khóa nào thì dùng ô chữ viết tắt màu trung tính.
- **Trang chủ:**
  - Thanh trên cùng, header (ô tìm kiếm, ví, đơn hàng, tài khoản, nút tối/sáng) và menu, theo bố cục mixmmo nhưng dùng chữ và màu kiểu General Admission.
  - Banner: đoạn giới thiệu bên trái; bên phải là các ô thương hiệu xếp chồng (lấy từ sản phẩm thật, bấm vào được) đè trên lớp chữ nền "Congcure® / Tài khoản số"; vòng chữ xoay; số liệu thật. Chữ khổng lồ "CONGCURE® / TÀI KHOẢN SỐ / GIAO 24/7" dùng hiệu ứng đảo màu đè lên các ô.
  - Ba ô công cụ (01 Lấy mã 2FA · 02 VietQR tự động · 03 API bán lại). Rê chuột vào thì đảo nền.
  - Thanh danh mục dính trên cùng khi cuộn, kiểu bộ lọc của General Admission.
  - Mỗi danh mục: tiêu đề 72px in hoa kèm số lượng nhỏ phía trên, rồi các dòng sản phẩm.
  - Mỗi dòng: ô thương hiệu, tên, định dạng, loại hàng, chấm tồn kho, giá, nút MUA NGAY kiểu "ADD TO CART". Hết hàng thì cả dòng chuyển xám.
- **Mua nhanh:** MUA NGAY mở **panel trượt từ phải**, có chữ "ĐÓNG" xoay dọc. Trong panel: ô thương hiệu, tên, bộ tăng/giảm số lượng, đơn giá, số dư sau khi mua, tổng tiền, nút THANH TOÁN. Không bật JavaScript thì link dẫn tới trang sản phẩm.
- **Trang sản phẩm:** ô bìa lớn bên trái. Bên phải: tên 44px; danh mục và loại hàng màu xám 36px; giá 36px; bảng thông số (định dạng, tồn kho, giao hàng, bảo hành); chọn số lượng kèm tổng tiền; nút MUA NGAY cỡ lớn; bảng giá Thành viên / CTV / Đại lý, đánh dấu "giá của bạn". Cuối trang là sản phẩm cùng danh mục.
- **Trang đơn hàng:** "ĐƠN #0007" cỡ 72px, chấm trạng thái, bốn ô thông tin. Danh sách tài khoản: số thứ tự, font mono, nút Sao chép từng dòng; thêm "Sao chép tất cả" và "Tải .txt". Đơn đang xử lý thì trang tự làm mới.
- **Nạp tiền:**
  - Bên trái: chữ "NẠP TIỀN" lớn, 3 bước, các mức tiền chọn nhanh 50K / 100K / 200K / 500K / 1M / Tùy ý (đổi luôn số tiền trong mã QR).
  - Bên phải: mã QR trong khung, bảng thông tin chuyển khoản có nút Sao chép, nội dung `NAP2` cỡ 36px font mono.
  - Ô "Đang chờ chuyển khoản" nhấp nháy và gọi `GET /api/me/balance` mỗi 4 giây; khi số dư tăng thì báo đã nhận tiền.
- **Các trang khác** dùng cùng hệ thống thiết kế: đăng nhập/đăng ký, tài khoản (khóa API, tài liệu API, lịch sử ví), lịch sử đơn, chính sách, admin.
- **Footer:** 4 cột chữ nhỏ, bên dưới là chữ "CONGCURE®" khổng lồ tràn hết chiều ngang (17.6vw), cuối cùng là thanh trạng thái hệ thống.
- **Mobile:**
  - Thanh trên cùng rút gọn; header còn logo, ví và tối/sáng; ô tìm kiếm full chiều ngang; menu cuộn ngang.
  - Banner: dải ô thương hiệu cuộn ngang, rồi chữ lớn, rồi phần giới thiệu.
  - Dòng sản phẩm còn ô thương hiệu, tên/định dạng/tồn kho, giá và nút mũi tên.
- **Chuyển động:** vòng chữ xoay 26 giây/vòng; ô thương hiệu nhích lên khi rê chuột; panel trượt vào; chấm nhấp nháy khi chờ. Tắt hết khi người dùng bật `prefers-reduced-motion`.

## 3. Tính năng nhỏ kéo theo thiết kế

- Panel mua nhanh: client component dùng `<dialog>`, gọi lại `buyAction` có sẵn.
- Trang `/cong-cu/2fa`: tạo mã TOTP (RFC 6238) ngay trên trình duyệt bằng Web Crypto; secret không gửi về server.
- Sao chép và tải `.txt` trên trang đơn hàng: client component.
- Mức tiền chọn nhanh trên trang nạp tiền (thêm `amount` vào URL VietQR) và `GET /api/me/balance` (đọc phiên đăng nhập, trả `{ balance }`).
- Core: hàm `getShopStats` đã có. Không đổi database.

## 4. Kiểm chứng

- Chụp mọi trang ở chế độ sáng, tối và mobile 390px; tự soát từng ảnh trước khi giao.
- `npm test` và `npm run typecheck` phải sạch.
- Chạy lại luồng mua bằng script gửi form (đăng ký → nạp tiền → mua nhanh → nhận tài khoản).
