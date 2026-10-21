import {
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { PageHeading } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata = { title: "Chính sách & hỗ trợ" };
const policies = [
  {
    icon: PackageCheck,
    title: "Giao hàng tự động",
    body: "Đơn hàng được xử lý tự động sau khi thanh toán bằng ví. Thông tin tài khoản sẽ hiển thị khi giao hàng hoàn tất. Bạn có thể xem lại trong mục Đơn hàng.",
  },
  {
    icon: RotateCcw,
    title: "Hoàn tiền & hỗ trợ",
    body: "Nếu đơn hàng không thể hoàn tất, số tiền đã thanh toán được hoàn lại vào ví. Nếu tài khoản có lỗi khi nhận, liên hệ hỗ trợ trong 24 giờ, kèm mã đơn để được kiểm tra.",
  },
  {
    icon: ShieldCheck,
    title: "Bảo mật tài khoản",
    body: "Thông tin tài khoản đã mua được mã hóa khi lưu trữ. Giữ kín mật khẩu và khóa API của bạn; thu hồi ngay khóa API không còn sử dụng.",
  },
];
const faq = [
  [
    "Nạp tiền bao lâu thì vào ví?",
    "Tiền thường được ghi nhận sau khi ngân hàng gửi thông báo giao dịch. Giữ đúng nội dung NAP của bạn khi chuyển khoản. Nếu chưa nhận được tiền, liên hệ cửa hàng kèm mã giao dịch.",
  ],
  [
    "Ghi sai nội dung chuyển khoản thì sao?",
    "Gửi ảnh giao dịch, số tiền và email tài khoản cho hỗ trợ Telegram. Cửa hàng sẽ đối chiếu và ghi nhận giao dịch cho bạn.",
  ],
  [
    "Đơn hàng đang xử lý, tôi cần làm gì?",
    "Giữ trang chi tiết đơn hàng mở để theo dõi trạng thái. Khi giao xong, thông tin tài khoản sẽ xuất hiện. Không đặt lại cùng đơn khi chưa rõ kết quả.",
  ],
  [
    "Làm thế nào để dùng API đại lý?",
    "Đăng nhập, mở mục Tài khoản & API rồi tạo khóa riêng. Các endpoint và mẫu yêu cầu nằm ngay trong trang này.",
  ],
  [
    "Làm sao để nhận giá CTV hoặc Đại lý?",
    "Liên hệ hỗ trợ để trao đổi nhu cầu và nâng cấp tài khoản. Giá theo cấp được áp dụng tự động khi bạn mua hàng.",
  ],
];
export default function PolicyPage() {
  return (
    <div className="policy-layout">
      <PageHeading
        eyebrow="THÔNG TIN CỬA HÀNG"
        title="Chính sách & hỗ trợ"
        description="Thông tin về giao hàng, thanh toán và tài khoản của bạn."
      />
      <section className="policy-grid">
        {policies.map(({ icon: Icon, title, body }) => (
          <div className="policy-item" key={title}>
            <Icon size={25} strokeWidth={1.5} />
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
        ))}
      </section>
      <section id="faq">
        <h2>Câu hỏi thường gặp</h2>
        {faq.map(([q, a]) => (
          <details className="faq-item" key={q}>
            <summary>
              {q}
              <Plus size={18} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <div className="catalog-support">
        <div>
          <span className="support-mark">?</span>
          <div>
            <strong>Trao đổi trực tiếp với cửa hàng</strong>
            <p>{site.hours}</p>
          </div>
        </div>
        <a href={site.telegram.url} target="_blank" rel="noreferrer">
          {site.telegram.label}
          <ArrowUpRight size={16} />
        </a>
      </div>
    </div>
  );
}
