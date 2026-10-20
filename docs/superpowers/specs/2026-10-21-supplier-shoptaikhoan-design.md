# Nguồn hàng: adapter shoptaikhoan.store + worker Telegram (backlog)

Ngày: 2026-10-21 · Trạng thái: phần A đã duyệt, đang làm. Phần B là backlog.

## A. Adapter `shoptaikhoan` (Seller API)

Nguồn đầu tiên là shoptaikhoan.store (bot Telegram của họ: `@shoptaikhoanstorebot`). Họ có REST API, tài liệu ở https://shoptaikhoan.store/shop/api-docs:

- Base URL: `https://api.shoptaikhoan.store/api/seller/v1`
- Xác thực: header `X-API-Key`
- Endpoint:
  - `GET /auth`: số dư và trạng thái ví
  - `GET /products?q=&page=&limit≤100`: trả `{ success, data: [{ id, name, price, currency, stock, … }], meta: { page, totalPages } }`
  - `POST /orders`, body `{ productId, quantity: 1..50 }`, header tùy chọn `Idempotency-Key` (1–128 ký tự `[A-Za-z0-9._:-]`). Đơn mới trả `201`, gửi lại cùng key trả `200`. Tài khoản nằm ở `data.products: string[]`; dữ liệu đầy đủ ở `data.order` (`orderCode`, `payment.status`, `delivery.status`, `delivery.result.accounts`).
  - `GET /orders/:orderCode`
- Lỗi trả `{ success: false, message, error: { code } }`. Giới hạn: `POST /orders` tối đa 20 lần/phút/key.

### Hành vi

- Thêm adapter `shoptaikhoan` vào `SUPPLIER_ADAPTERS`. Trang admin "Nhà cung cấp" có ô chọn adapter khi tạo mới.
- `supplierSku` của sản phẩm = `id` sản phẩm bên nguồn (số).
- `placeOrder({ ref, sku, quantity })`:
  - `quantity > 50` hoặc `sku` không phải số nguyên dương → lỗi vĩnh viễn.
  - Gọi `POST /orders` với `Idempotency-Key: ref`.
  - `supplierRef = data.order.orderCode`. Có tài khoản trong `data.products` (dự phòng: `data.order.delivery.result.accounts`) và `delivery.status = success` → `completed`.
  - Có `orderCode` nhưng chưa giao xong → `processing`. Lần thử lại tiếp theo gửi lại cùng key, nguồn trả về trạng thái hiện tại.
- `listProducts()`: lấy lần lượt từng trang (`limit=100`) đến hết `totalPages`, tối đa 20 trang. Map sang `{ sku: String(id), name, price, stock }`.
- Phân loại lỗi:

  | Mã lỗi | Loại | Hiện cho khách/admin |
  |---|---|---|
  | `INSUFFICIENT_STOCK`, `PRODUCT_NOT_AVAILABLE`, `WALLET_CURRENCY_MISMATCH`, `VALIDATION_ERROR` | vĩnh viễn → hoàn tiền | message của nguồn |
  | `INSUFFICIENT_BALANCE`, `WALLET_INACTIVE` | vĩnh viễn → hoàn tiền | "Nguồn hết số dư / ví nguồn bị khóa" |
  | `UNAUTHORIZED` | vĩnh viễn | "API key nguồn không hợp lệ" |
  | `RATE_LIMITED`, `REQUEST_IN_PROGRESS`, `IDEMPOTENCY_CONFLICT`, `PURCHASE_DISABLED`, `INTERNAL_ERROR`, HTTP 5xx, lỗi mạng hoặc timeout | tạm thời → thử lại | |
  | HTTP 4xx khác | vĩnh viễn | |

- **Mã chống mua trùng** (sửa lỗi tiềm ẩn ở mọi adapter): `ref = web12-<orderId>-<createdAt epoch ms>`. Lý do: sau khi reset database, `orderId` lặp lại, nguồn sẽ trả lại đơn cũ.
- **Admin "Xem sản phẩm nguồn"**: trang `/admin/nha-cung-cap/[id]/san-pham` gọi `listProducts()` rồi hiện bảng ID, tên, giá vốn, tồn kho. Có ô tìm kiếm (`q`), truyền thẳng qua API nguồn.

### Kiểm tra

- Test tự động chạy với một HTTP server giả lập đúng định dạng API thật: thành công, gửi lại cùng key, từng nhóm mã lỗi, phân trang, trường hợp > 50 món.
- Thử thật với key của chủ shop: chỉ gọi `GET /auth` và `GET /products`. Chỉ mua thật khi chủ shop đồng ý.

## B. Worker Telegram (backlog, chưa làm)

**Vì sao cần:** nhiều nguồn chỉ bán qua bot Telegram, không có API.

**Hướng làm:**
- Adapter `telegram-bot` điều khiển một tài khoản Telegram thật (userbot). Bot Telegram không chat được với bot khác, nên phải dùng tài khoản người dùng.
- Có hai cách: GramJS (MTProto, nhẹ, ổn định) hoặc Playwright điều khiển Telegram Web (đã thử được khi khám phá `@shoptaikhoanstorebot`). Ưu tiên GramJS cho production; Playwright dùng để khám phá bot mới.
- Mỗi bot nguồn mô tả bằng một "kịch bản" khai báo: các bước gửi lệnh hoặc bấm nút theo chữ, rồi regex để bắt tài khoản trong tin nhắn hoặc file `.txt`, kèm các mẫu tin nhắn báo hết hàng hoặc hết số dư.
- Mỗi tài khoản Telegram chỉ xử lý một đơn tại một thời điểm (hàng đợi riêng, `concurrency = 1`), để không lẫn tin trả lời giữa các đơn.
- Kết quả không chắc chắn, ví dụ quá thời gian chờ sau khi đã bấm mua → **không tự hoàn tiền**. Đơn chuyển sang trạng thái chờ admin xác nhận, vì có thể nguồn đã trừ tiền.
- Dùng tài khoản Telegram phụ riêng cho worker, không dùng tài khoản chính.

**Cần trước khi thiết kế chi tiết:** danh sách 2–3 bot nguồn cụ thể. Khám phá từng bot bằng Playwright, rồi chốt định dạng kịch bản chung.
