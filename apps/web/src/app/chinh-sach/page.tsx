import { site } from '@/lib/site';

export const metadata = { title: `Chính sách · ${site.logo}` };

const POLICIES = [
  ['Giao hàng', 'Tài khoản được giao tự động ngay sau khi thanh toán bằng số dư ví. Bạn xem lại bất kỳ lúc nào trong mục Lịch sử.'],
  ['Hoàn tiền', 'Đơn lấy từ nguồn mà thất bại sẽ được hoàn tiền tự động vào ví. Tài khoản lỗi khi nhận: liên hệ hỗ trợ trong 24 giờ, kèm mã đơn.'],
  ['Bảo mật', 'Thông tin tài khoản đã mua được mã hóa khi lưu trữ. Không chia sẻ mật khẩu và khóa API của bạn cho người khác.'],
];

const FAQ = [
  ['Nạp tiền bao lâu thì vào ví?', 'Thường dưới 1 phút sau khi chuyển khoản đúng nội dung. Ghi sai nội dung thì nhắn hỗ trợ để được cộng tay.'],
  ['Có API cho đại lý không?', 'Có. Tạo khóa ở trang Tài khoản; tài liệu nằm ngay dưới phần khóa API.'],
  ['Giá CTV / Đại lý là gì?', 'Tài khoản cấp CTV và Đại lý được giá thấp hơn. Liên hệ hỗ trợ để nâng cấp.'],
];

export default function PolicyPage() {
  return (
    <div className="space-y-16">
      <section>
        <h1 className="display border-b-2 border-fg pb-2 text-5xl md:text-7xl">Chính sách</h1>
        <div className="grid gap-8 pt-8 md:grid-cols-3">
          {POLICIES.map(([title, body]) => (
            <div key={title}>
              <div className="eyebrow mb-2">{title}</div>
              <p className="leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="faq" className="scroll-mt-6">
        <h2 className="display border-b-2 border-fg pb-2 text-5xl md:text-7xl">FAQ</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="group border-b border-line py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-lg">
              {q}<span className="font-mono transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="pt-3 text-muted">{a}</p>
          </details>
        ))}
        <p className="pt-6 text-sm text-muted">
          Cần thêm hỗ trợ? Nhắn <a href={site.telegram.url} className="link">Telegram {site.telegram.label}</a> · {site.hours}.
        </p>
      </section>
    </div>
  );
}
