# web12 — Website bán tài khoản: Thiết kế giai đoạn 1

Ngày: 2026-10-16 · Trạng thái: đã duyệt thiết kế

## 1. Mục tiêu

Shop một chủ (admin + nhân viên) bán tài khoản số, nhiều danh mục. Ba kiểu hàng:

- **STOCK** — kho tài khoản số lượng lớn, giao tự động.
- **UNIQUE** — tài khoản bán lẻ từng cái, có ảnh và thuộc tính.
- **API** — lấy hàng từ web nguồn qua adapter. Chưa có nguồn thật, nên giai đoạn này dùng adapter REST chung và một mock supplier.

Khách thanh toán bằng ví. Ví nạp qua chuyển khoản ngân hàng tự động (VietQR + webhook kiểu SePay/Casso). Shop có API cho đại lý, dùng khóa API riêng cho từng người. Có 3 cấp giá: Thành viên / CTV / Đại lý.

**Giai đoạn 1 xong khi:** chạy được trọn luồng đăng ký → nạp tiền (giả lập webhook) → mua hàng STOCK / UNIQUE / API → xem tài khoản đã nhận. Mua qua API đại lý cũng chạy được. Có trang admin tối thiểu.

**Ngoài phạm vi:** thẻ cào, crypto, marketplace nhiều người bán, adapter cho nhà cung cấp thật, thông báo email/Telegram, giao diện cầu kỳ.

## 2. Kiến trúc (phương án C: monolith có phân lớp)

npm workspaces, TypeScript:

```
apps/web        Next.js (App Router): giao diện khách + admin + /api/v1 (đại lý) + /api/webhooks/bank
apps/worker     Tiến trình Node: chạy job pg-boss (xử lý đơn API nguồn, hoàn tiền)
packages/core   Toàn bộ nghiệp vụ: auth, ví/sổ cái, đơn hàng, kho, giá theo cấp, nạp tiền, adapter nguồn, mã hóa
packages/db     Migration SQL thuần + pool `pg` dùng chung + helper transaction + seed + script chạy embedded-postgres
apps/mock-supplier  Server HTTP nhỏ giả làm web nguồn (các chế độ: ok / chậm / lỗi)
```

**Quy tắc:** route của Next.js và job của worker chỉ làm 3 việc: kiểm tra đầu vào, gọi một hàm trong `core`, rồi định dạng kết quả trả về. Toàn bộ thao tác ghi vào bảng tiền và bảng kho đều nằm trong `core`.

**Cơ sở dữ liệu:** chỉ dùng PostgreSQL. Hàng đợi là pg-boss, chạy trên chính Postgres nên không cần Redis.
- Môi trường dev: gói npm `embedded-postgres` (máy dev không có Postgres/Docker), khởi động bằng script `npm run db:start`.
- Production: Postgres thật, cấu hình qua `DATABASE_URL`.

**Không dùng ORM.** Ghi chú ngày 2026-10-16: tag `latest` của Prisma trên npm đang là bản RC (8.0.0-rc), và phần nghiệp vụ chủ yếu là SQL viết tay (`FOR UPDATE SKIP LOCKED`, update có điều kiện). Vì vậy dùng `pg` + file migration `.sql` đánh số thứ tự, chạy bằng script migrate tự viết (lưu vết trong bảng `_migrations`). Tên bảng và cột dùng snake_case.

**Tiền:** số nguyên VND, cột `BIGINT`. Trong code TypeScript dùng kiểu `number`, vì mọi giá trị đều nhỏ hơn 2^53.

## 3. Mô hình dữ liệu

(Tên trường viết camelCase dưới đây chỉ để dễ đọc; trong SQL là snake_case, ví dụ `password_hash`, `order_id`. Bảng `Order` có tên SQL là `orders`, `User` là `users`.)

- **User**: id, email (duy nhất), passwordHash (scrypt), name, role `CUSTOMER|STAFF|ADMIN`, tier `MEMBER|CTV|AGENT`, balance BigInt ≥ 0, topupCode (duy nhất, ví dụ `NAP12345`), createdAt.
- **Session**: id (token ngẫu nhiên, lưu bản băm), userId, expiresAt. Gửi cho trình duyệt qua cookie httpOnly.
- **ApiKey**: id, userId, prefix (hiển thị), keyHash (sha256, duy nhất), name, lastUsedAt, revokedAt.
- **LedgerEntry**: id, userId, amount (±BigInt), balanceAfter, type `TOPUP|PURCHASE|REFUND|ADJUST`, refType, refId, note, createdBy, createdAt.
- **BankTransaction**: id, provider, providerTxnId, amount, content, rawPayload JSON, status `MATCHED|UNMATCHED|IGNORED`, userId?, createdAt. Ràng buộc duy nhất trên (provider, providerTxnId).
- **Category**: id, name, slug (duy nhất), parentId?, sortOrder.
- **Product**: id, categoryId, name, slug (duy nhất), description, images string[], attributes JSON, type `STOCK|UNIQUE|API`, priceMember, priceCtv, priceAgent (BigInt), active, supplierId?, supplierSku?, createdAt.
- **StockItem**: id, productId, secretEnc (AES-256-GCM), status `AVAILABLE|SOLD`, orderId?, createdAt, soldAt. Index trên (productId, status).
- **Supplier**: id, name, adapter (`generic-rest`), baseUrl, apiKeyEnc, active.
- **Order**: id, userId, productId, quantity, unitPrice, total, status `PENDING|COMPLETED|REFUNDED`, source `WEB|API`, idempotencyKey?, supplierRef?, error?, createdAt, updatedAt. Ràng buộc duy nhất trên (userId, idempotencyKey).

Cách lưu chung cho cả 3 kiểu hàng:
- Sản phẩm UNIQUE có đúng 1 dòng StockItem.
- Tài khoản lấy từ nguồn API cũng được lưu thành StockItem, đặt luôn status `SOLD` và gắn với đơn tương ứng.
- Tài khoản khách đã mua luôn là `StockItem where orderId = order.id`.

Khóa mã hóa đọc từ biến môi trường `SECRET_KEY` (32 byte, dạng base64).

## 4. Các luồng

### 4.1 Mua hàng STOCK / UNIQUE — `core.orders.purchase(userId, productId, qty, {source, idempotencyKey})`
Mọi bước chạy trong một transaction:
1. Nếu có idempotencyKey và đã có đơn với khóa đó → trả lại đơn cũ.
2. Tải sản phẩm (phải đang active), lấy đơn giá theo cấp của khách, tính tổng tiền. UNIQUE bắt buộc qty = 1.
3. `SELECT id FROM "StockItem" WHERE productId=$1 AND status='AVAILABLE' LIMIT $qty FOR UPDATE SKIP LOCKED`. Lấy được ít hơn qty dòng → báo `OUT_OF_STOCK`.
4. `UPDATE "User" SET balance = balance - $total WHERE id=$1 AND balance >= $total RETURNING balance`. Không có dòng nào được cập nhật → báo `INSUFFICIENT_BALANCE`.
5. Tạo Order với trạng thái `COMPLETED`, ghi một dòng LedgerEntry `PURCHASE`, chuyển các dòng hàng sang `SOLD` và gắn orderId.

### 4.2 Mua hàng API nguồn
1. Trong một transaction: thực hiện bước 1, 2 và 4 như mục 4.1, tạo Order `PENDING`, ghi LedgerEntry `PURCHASE`. Job pg-boss `fulfill-api-order {orderId}` được gửi sau khi transaction commit. Nếu gửi job thất bại, một tác vụ quét định kỳ (sweeper) sẽ gửi lại job cho các đơn PENDING quá 2 phút.
2. Worker gọi `adapter.placeOrder({ref: orderId, sku, qty})`. Mã đơn được dùng làm khóa chống trùng ở phía nguồn.
   - Thành công: trong một transaction, chèn các StockItem (`SOLD`, đã mã hóa) rồi cập nhật Order `PENDING→COMPLETED` (có điều kiện trạng thái hiện tại vẫn là PENDING).
   - Lỗi tạm thời (timeout, 5xx): pg-boss thử lại, tối đa 5 lần, thời gian chờ tăng dần.
   - Lỗi hẳn (4xx, hết hàng ở nguồn) hoặc đã thử hết số lần: gọi `core.orders.refund(orderId)`. Hàm này chạy trong một transaction: `UPDATE Order SET status='REFUNDED' WHERE id=$1 AND status='PENDING'`. Chỉ khi có dòng được cập nhật mới cộng lại số dư và ghi LedgerEntry `REFUND`, nhờ đó mỗi đơn chỉ được hoàn tiền một lần.

Interface của adapter nguồn: `placeOrder`, `getOrder`, `listProducts`. Adapter `generic-rest` dùng `baseUrl` và `apiKey` của Supplier.

### 4.3 Nạp tiền
1. Trang `/nap-tien` hiện ảnh VietQR (`img.vietqr.io`), dùng thông tin ngân hàng của shop từ biến môi trường. Nội dung chuyển khoản là `topupCode` của khách.
2. Ngân hàng gửi `POST /api/webhooks/bank` với header `Authorization: Apikey <WEBHOOK_TOKEN>`. Payload theo định dạng SePay (id, transferAmount, content, transferType). Chỉ xử lý giao dịch tiền vào (`transferType = in`).
3. `core.topup.handleBankTxn` chạy trong một transaction:
   - Chèn BankTransaction với `ON CONFLICT DO NOTHING`. Nếu bản ghi đã tồn tại thì trả 200 và dừng.
   - Dùng regex (không phân biệt hoa thường) tìm topupCode trong nội dung chuyển khoản. Tìm được khách → cộng số dư, ghi LedgerEntry `TOPUP`, đặt `MATCHED`. Không tìm được → đặt `UNMATCHED`.
4. Admin có thể gán giao dịch `UNMATCHED` cho một khách. Thao tác này cũng chạy trong transaction với điều kiện status vẫn là `UNMATCHED`.

### 4.4 Admin chỉnh số dư
`core.wallet.adjust(userId, amount, note, adminId)` chạy trong một transaction. Ghi LedgerEntry `ADJUST`. Nếu số dư sau khi chỉnh bị âm thì từ chối.

### 4.5 API cho đại lý
- Xác thực bằng header `X-API-Key`: băm sha256 khóa nhận được rồi tra bảng ApiKey, bỏ qua các khóa đã thu hồi.
- Lỗi trả về dạng JSON `{error: {code, message}}`.
- Các endpoint:
  - `GET /api/v1/products`: danh sách sản phẩm đang bán, giá theo cấp của người gọi, số lượng tồn (với STOCK/UNIQUE).
  - `GET /api/v1/balance`
  - `POST /api/v1/orders {productId, quantity}`: header `Idempotency-Key` không bắt buộc. Trả về đơn hàng, kèm tài khoản nếu đơn đã COMPLETED.
  - `GET /api/v1/orders/:id`: chỉ xem được đơn của chính mình.

## 5. Giao diện (Tailwind, đơn giản)

- **Phía khách:** `/` (danh mục và sản phẩm nổi bật), `/danh-muc/[slug]`, `/san-pham/[slug]` (form mua), `/dang-ky`, `/dang-nhap`, `/nap-tien`, `/don-hang` và `/don-hang/[id]` (hiện tài khoản đã giải mã), `/tai-khoan` (quản lý khóa API, lịch sử ví).
- **Admin** (`/admin`, chỉ STAFF/ADMIN vào được): sản phẩm (tạo/sửa), nhập kho (dán nhiều dòng, mỗi dòng là một tài khoản), danh mục, người dùng (đổi cấp, chỉnh số dư), đơn hàng, giao dịch ngân hàng (gán các giao dịch chưa khớp), nhà cung cấp.

## 6. Bảo mật

- Mật khẩu băm bằng scrypt (`node:crypto`).
- Token phiên và khóa API chỉ lưu bản băm.
- Tài khoản bán ra và khóa API của nhà cung cấp được mã hóa AES-256-GCM.
- Webhook xác thực bằng token, so sánh theo thời gian không đổi.
- Server Action dùng cơ chế chống CSRF sẵn có của Next.js.
- Giới hạn tần suất (rate limit) cho đăng nhập và `/api/v1`, đếm trong bộ nhớ theo IP/khóa API (đủ dùng khi chỉ chạy một tiến trình).

## 7. Test

- Dùng vitest để test `packages/core` trên Postgres thật (embedded-postgres, database riêng cho test, reset trước mỗi file test). Các trường hợp bắt buộc:
  - 20 lượt mua chạy song song tranh nhau 10 dòng hàng → bán đúng 10, không dòng nào bị bán 2 lần.
  - Không đủ tiền → không tạo đơn, kho không thay đổi.
  - Cùng một webhook gửi 3 lần → chỉ cộng tiền 1 lần.
  - Gọi hoàn tiền 2 lần (kể cả chạy song song) → chỉ hoàn 1 lần.
  - Gửi lại cùng idempotency key → trả về cùng một đơn.
  - Số dư luôn bằng tổng các dòng sổ cái của khách đó.
- Có một test cho adapter, chạy với mock supplier.
- Kiểm tra trọn luồng bằng tay, theo script trong README.

## 8. Dữ liệu mẫu (seed)

- 1 admin, 1 khách thường và 1 đại lý, có sẵn số dư.
- 3 danh mục; sản phẩm STOCK có 20 tài khoản trong kho, 1 sản phẩm UNIQUE, và 1 sản phẩm API trỏ tới mock supplier.
