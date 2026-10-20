import { core } from '@/lib/core';
import { formatDate, formatVnd } from '@/lib/format';
import { requireUser } from '@/lib/session';

export default async function TopupPage() {
  const user = await requireUser();
  const bankId = process.env.BANK_ID ?? '';
  const account = process.env.BANK_ACCOUNT ?? '';
  const accountName = process.env.BANK_ACCOUNT_NAME ?? '';
  const qr = `https://img.vietqr.io/image/${bankId}-${account}-compact2.png?addInfo=${encodeURIComponent(user.topupCode)}&accountName=${encodeURIComponent(accountName)}`;
  const history = (await core.listLedger(user.id, 20)).filter((e) => e.type === 'TOPUP');

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">Nạp tiền vào ví</h1>
        <p className="text-sm">Số dư hiện tại: <b>{formatVnd(user.balance)}</b></p>
        <img src={qr} alt="VietQR" className="mx-auto w-64" />
        <dl className="grid grid-cols-3 gap-1 text-sm">
          <dt className="text-muted">Ngân hàng</dt><dd className="col-span-2">{bankId}</dd>
          <dt className="text-muted">Số tài khoản</dt><dd className="col-span-2 font-mono">{account}</dd>
          <dt className="text-muted">Chủ tài khoản</dt><dd className="col-span-2">{accountName}</dd>
          <dt className="text-muted">Nội dung</dt><dd className="col-span-2 font-mono text-lg font-semibold text-accent">{user.topupCode}</dd>
        </dl>
        <p className="text-xs text-muted">
          Ghi đúng nội dung chuyển khoản. Tiền được cộng tự động sau khoảng 1 phút.
          Nếu ghi sai nội dung, hãy liên hệ admin để được cộng tay.
        </p>
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold">Lịch sử nạp</h2>
        <table className="table">
          <tbody>
            {history.map((e) => (
              <tr key={e.id}><td>{formatDate(e.createdAt)}</td><td className="text-emerald-600 dark:text-emerald-400">+{formatVnd(e.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && <p className="text-sm text-muted">Chưa có giao dịch nạp.</p>}
      </div>
    </div>
  );
}
