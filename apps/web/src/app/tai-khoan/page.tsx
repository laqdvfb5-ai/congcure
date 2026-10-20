import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatDate, formatVnd, TIER_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { createApiKeyAction, revokeApiKeyAction } from './actions';

const LEDGER_LABEL = { TOPUP: 'Nạp tiền', PURCHASE: 'Mua hàng', REFUND: 'Hoàn tiền', ADJUST: 'Điều chỉnh' } as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [keys, ledger] = await Promise.all([core.listApiKeys(user.id), core.listLedger(user.id, 50)]);

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">{user.name}</h1>
        <p className="text-sm text-gray-600">{user.email} · Cấp: {TIER_LABEL[user.tier]} · Số dư: {formatVnd(user.balance)}</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Khóa API (dành cho đại lý)</h2>
        <Flash searchParams={sp} />
        {sp.newKey && (
          <div className="rounded bg-yellow-50 p-3 text-sm">
            Khóa mới. Hãy lưu lại ngay, khóa sẽ không hiển thị lần nữa:
            <div className="mt-1 break-all font-mono font-semibold">{sp.newKey}</div>
          </div>
        )}
        <form action={createApiKeyAction} className="flex gap-2">
          <input name="name" placeholder="Tên khóa (vd: bot của tôi)" className="input" />
          <button className="btn whitespace-nowrap">Tạo khóa</button>
        </form>
        <table className="table">
          <thead><tr><th>Tên</th><th>Tiền tố</th><th>Dùng lần cuối</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="font-mono">{k.prefix}…</td>
                <td>{k.lastUsedAt ? formatDate(k.lastUsedAt) : '-'}</td>
                <td>
                  {k.revokedAt ? <span className="text-gray-400">Đã thu hồi</span> : (
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <button className="text-red-600">Thu hồi</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500">
          Tài liệu: gửi header <code>X-API-Key</code> tới <code>/api/v1/products</code>, <code>/api/v1/balance</code>,
          <code> POST /api/v1/orders</code> ({'{ productId, quantity }'}, header <code>Idempotency-Key</code> tùy chọn),
          <code> GET /api/v1/orders/:id</code>.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Lịch sử ví</h2>
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Loại</th><th>Số tiền</th><th>Số dư sau</th><th>Ghi chú</th></tr></thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.createdAt)}</td>
                <td>{LEDGER_LABEL[e.type]}</td>
                <td className={e.amount > 0 ? 'text-green-700' : 'text-red-600'}>{e.amount > 0 ? '+' : ''}{formatVnd(e.amount)}</td>
                <td>{formatVnd(e.balanceAfter)}</td>
                <td className="text-gray-500">{e.refType === 'order' ? `Đơn #${e.refId}` : e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
