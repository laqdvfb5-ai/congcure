# web12: Shop bán tài khoản

Monorepo Node.js/TypeScript:
- `apps/web`: Next.js (giao diện khách, admin, API đại lý `/api/v1`, webhook ngân hàng)
- `apps/worker`: xử lý đơn hàng lấy từ nguồn API (pg-boss)
- `apps/mock-supplier`: web nguồn giả lập để test
- `packages/core`: toàn bộ nghiệp vụ (ví, sổ cái, đơn hàng, kho, nạp tiền, adapter nguồn)
- `packages/db`: kết nối Postgres, migration SQL

Thiết kế: `docs/superpowers/specs/2026-10-16-account-shop-design.md`

## Chạy lần đầu (máy dev)

Yêu cầu Node ≥ 22.12. Không cần cài Postgres, vì dự án dùng embedded-postgres.

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # dán vào SECRET_KEY trong .env
```

Mở 4 terminal:
```bash
npm run db:start        # 1. Postgres (cổng 5433)
npm run db:seed         # chạy 1 lần: migrate + dữ liệu mẫu
npm run mock:supplier   # 2. web nguồn giả lập (cổng 4100)
npm run worker          # 3. worker xử lý đơn API
npm run dev             # 4. web: http://localhost:3000
```

Tài khoản mẫu:
- `admin@shop.local` / `admin12345` (ADMIN)
- `khach@shop.local` / `khach12345` (500.000đ)
- `daily@shop.local` / `daily12345` (Đại lý, 2.000.000đ)

## Lệnh hữu ích

| Lệnh | Việc |
|---|---|
| `npm test` | Test nghiệp vụ trên DB `web12_test` (cần `db:start`) |
| `npm run typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `npm run db:migrate` | Chạy migration mới |
| `npm run fake:topup -- NAP2 100000` | Giả lập ngân hàng báo có tiền |
| `npm run api:smoke -- <API_KEY>` | Gọi thử API đại lý |

## Webhook ngân hàng (SePay)

- URL: `POST https://<domain>/api/webhooks/bank`
- Header: `Authorization: Apikey <WEBHOOK_TOKEN>`
- Nội dung chuyển khoản của khách: `NAP<id>`, hiển thị ở trang `/nap-tien`.
- Giao dịch không khớp được ai sẽ nằm ở `/admin/giao-dich` để admin gán tay.

## API đại lý

Header `X-API-Key: sk_...`, tạo khóa ở `/tai-khoan`. Giới hạn 60 request/phút.

- `GET /api/v1/products`: giá theo cấp của bạn
- `GET /api/v1/balance`
- `POST /api/v1/orders`, body `{ "productId": 1, "quantity": 2 }`, header `Idempotency-Key` tùy chọn
- `GET /api/v1/orders/:id`

Lỗi trả về dạng `{ "error": { "code", "message" } }`.

## Production

- Đặt `DATABASE_URL` trỏ tới Postgres thật, rồi chạy `npm run db:migrate`.
- Chạy `npm run build -w @web12/web && npm run start -w @web12/web`, cùng với `npm run worker`.
- Bắt buộc HTTPS. Phải đặt `SECRET_KEY` và `WEBHOOK_TOKEN` riêng, và sao lưu `SECRET_KEY`: mất khóa này thì không giải mã được tài khoản trong kho.
