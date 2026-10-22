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

## Thanh toán trực tiếp bằng ngân hàng

Trang sản phẩm và cửa sổ mua nhanh có hai lựa chọn: thanh toán bằng ví, hoặc thanh toán ngay bằng QR ngân hàng. Giá luôn được tính ở server theo cấp tài khoản; bảng so sánh ba cấp giá không còn hiển thị trên trang sản phẩm.

QR trực tiếp sử dụng mã `DH` riêng cho mỗi thanh toán, có hiệu lực 15 phút và giữ nguyên báo giá. Chỉ tạo đơn khi webhook đã xác thực, khớp mã, khớp tài khoản nhận và nhận đủ tổng tiền. Kho không được giữ trước khi nhận đủ tiền. Các khoản chuyển thiếu được cộng dồn; tiền dư, chuyển muộn, hủy hoặc không còn hàng được ghi nhận vào ví qua sổ cái. Đơn ngân hàng không trừ số dư ví. Đơn API lỗi vẫn hoàn tiền vào ví như đơn ví.

Worker thu hồi các thanh toán hết hạn và trả tiền chuyển thiếu vào ví. Mã giao dịch ngân hàng được chống trùng trong cùng transaction với việc ghi nhận thanh toán và tạo đơn. Hàng đợi lỗi sẽ được stale-order sweeper thử lại. Màn hình `/thanh-toan/<code>` và API trạng thái yêu cầu đúng chủ tài khoản.

Webhook SePay phải nhận cả mã `NAP` (nạp ví) và `DH` (thanh toán đơn). Khi không cấu hình bộ lọc mã trên SePay, server tự phân biệt hai luồng. Nếu bật bộ lọc tiền tố, thêm mẫu `DH` với 16 ký tự chữ/số cùng mẫu `NAP` hiện có.

Triển khai cần chạy migration `002_bank_payments.sql` trước khi khởi động bản web và worker mới. Không dùng webhook giả trên production để thử thanh toán: nó có thể tạo đơn và gọi mua hàng thật. Kiểm tra tự động dùng database test và sản phẩm kho giả.

## Đặt trước khi hết hàng

Sản phẩm có tồn kho bằng 0 hiển thị nút **Đặt trước** ở danh sách và trang chi tiết. Khách thanh toán bằng ví hoặc QR như bình thường; đơn đã thanh toán có trạng thái `PREORDER` (Đặt trước · Chờ hàng). QR chưa nhận đủ tiền chưa tạo đơn. Tồn kho chưa xác định (`null`) không tự coi là hết hàng.

Worker kiểm tra đơn đặt trước nguồn API mỗi phút, chỉ gọi mua khi xác nhận đủ hàng; kết quả tồn kho được cache tối đa 30 giây. Đơn thiếu hàng hoặc lỗi nguồn tiếp tục chờ, không tự hoàn tiền sau 5 lần thử. Mỗi lần thử lại dùng cùng mã chống mua trùng. Cần giữ worker hoạt động; không cần cron hệ điều hành riêng.

Trong `/admin/don-hang`, chọn **Đặt trước · Chờ hàng**. Admin/staff có thể nhập đúng số tài khoản (mỗi dòng một tài khoản) để giao trực tiếp cho đơn API hoặc kho riêng; để trống sẽ lấy từ kho đã nhập. Đơn kho riêng chỉ giao khi admin thao tác. Giao hàng không trừ tiền lần nữa. Hệ thống ghi người giao, mã hóa tài khoản và khóa xử lý để tránh worker/admin giao trùng. Nếu nguồn đã nhận yêu cầu nhưng chưa xác định kết quả, giao tay bị khóa để tránh mua/giao hai lần; worker tiếp tục kiểm tra cùng mã đơn.

Trước khi chạy bản mới: `npm run db:migrate` để áp dụng `003_preorders.sql`, sau đó khởi động lại web và worker.

## API đại lý

Header `X-API-Key: sk_...`, tạo khóa ở `/tai-khoan`. Giới hạn 60 request/phút.

- `GET /api/v1/products`: giá theo cấp của bạn
- `GET /api/v1/balance`
- `POST /api/v1/orders`, body `{ "productId": 1, "quantity": 2 }`, header `Idempotency-Key` tùy chọn
- `GET /api/v1/orders/:id`

Lỗi trả về dạng `{ "error": { "code", "message" } }`.

## Nguồn hàng shoptaikhoan.store

1. Đăng nhập shoptaikhoan.store → **Quản lý API key** → tạo key, rồi nạp tiền vào ví bên đó.
2. Vào `/admin/nha-cung-cap` → Thêm nhà cung cấp: chọn adapter `shoptaikhoan`, để trống Base URL, dán API key.
3. Bấm **Xem sản phẩm nguồn** để thấy ID, giá vốn và tồn kho bên nguồn.
4. Tạo sản phẩm loại **Nguồn API**: chọn nhà cung cấp đó, điền ID vào ô "SKU bên nguồn", rồi đặt giá bán.

Khi khách mua, worker gọi API nguồn (mỗi đơn có `Idempotency-Key` riêng nên không bị mua trùng) và giao tài khoản ngay. Nếu nguồn hết hàng hoặc hết số dư, đơn tự hoàn tiền và lý do hiện ở `/admin/don-hang`. Mỗi đơn tối đa 50 món, theo giới hạn của nguồn.

## Tồn kho

Danh sách sản phẩm, trang chi tiết và API đại lý lấy tồn kho theo SKU. Riêng ShopTaiKhoan, số lượng hiển thị được đọc từ trường tồn kho trên trang sản phẩm công khai, vì Seller API chỉ trả kho nội bộ và có thể khác số lượng website. SKU được đối chiếu qua JSON-LD trước khi nhận số lượng; không gửi API key khi đọc trang công khai. Các adapter khác dùng danh mục API của nguồn.

Kết quả từ nguồn được lưu đệm 30 giây; các lượt đọc đồng thời dùng chung một yêu cầu. Giá bán vẫn lấy từ cấu hình sản phẩm của cửa hàng. Việc đặt đơn vẫn dùng Seller API; tồn kho website không đồng nghĩa với việc sản phẩm đã được cho phép mua qua API.

Số 0 chỉ dùng khi có số lượng xác nhận hết hàng. Nếu không đọc được dữ liệu, trang nguồn chưa tải xong, SKU không khớp hoặc định dạng số lượng không hợp lệ, giao diện hiện `Chưa cập nhật` và API đại lý trả `stock: null`. Bộ lọc `Còn hàng` chỉ chọn sản phẩm có số lượng đã xác định lớn hơn 0.

## Ảnh sản phẩm

Trong form tạo/sửa sản phẩm, chọn ảnh từ máy tính (JPG, PNG hoặc WebP, tối đa 5 MB/ảnh và 8 ảnh/sản phẩm), chọn ảnh chính rồi lưu sản phẩm. Ảnh được xử lý thành WebP, cạnh dài tối đa 1600px. URL ảnh cũ vẫn dùng được.

Ảnh tải lên được lưu tại `apps/web/.uploads/products` khi chạy bằng lệnh workspace. Có thể đặt `PRODUCT_IMAGE_DIR` thành đường dẫn tuyệt đối đến thư mục lưu trữ bền vững. Khi triển khai hoặc sao lưu, giữ thư mục này cùng database; không đặt nó trong thư mục build tạm. Xóa ảnh khỏi form chỉ bỏ ảnh khỏi sản phẩm, không xóa file đang lưu.

## Kiểm tra giao diện

Giao diện có mua nhanh, chọn số tiền VietQR, cập nhật ví/đơn hàng, công cụ 2FA và chế độ sáng/tối.

```bash
npm test
npx playwright install chromium
npm run test:e2e -w @web12/web
```

Test giao diện tự chạy web ở cổng 3002, tạo dữ liệu riêng trong `DATABASE_URL_TEST` và giả lập ảnh QR. Không gọi mua hàng từ nguồn thật. Cần chạy `db:start` trước. Có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` nếu dùng Chrome đã cài trên máy.

Để chạy một bản xem trước song song trên PowerShell:

```powershell
$env:WEB12_DIST_DIR = '.next/preview'
npm exec -w @web12/web -- next dev -p 3001
```

## Production

- Đặt `DATABASE_URL` trỏ tới Postgres thật, rồi chạy `npm run db:migrate`.
- Chạy `npm run build -w @web12/web && npm run start -w @web12/web`, cùng với `npm run worker`.
- Bắt buộc HTTPS. Phải đặt `SECRET_KEY` và `WEBHOOK_TOKEN` riêng, và sao lưu `SECRET_KEY`: mất khóa này thì không giải mã được tài khoản trong kho.
