import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatDate, formatVnd } from '@/lib/format';
import { assignTxnAction } from '../actions';

export default async function AdminBankTxns({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const txns = await core.listBankTxns();
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Giao dịch ngân hàng</h1>
      <Flash searchParams={await searchParams} />
      <table className="table">
        <thead><tr><th>Thời gian</th><th>Mã GD</th><th>Số tiền</th><th>Nội dung</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id}>
              <td>{formatDate(t.createdAt)}</td>
              <td className="font-mono text-xs">{t.providerTxnId}</td>
              <td>{formatVnd(t.amount)}</td>
              <td className="max-w-xs break-words">{t.content}</td>
              <td>
                {t.status === 'UNMATCHED' ? (
                  <form action={assignTxnAction} className="flex gap-1">
                    <input type="hidden" name="txnId" value={t.id} />
                    <input name="user" placeholder="ID hoặc email" className="input w-36 py-1" required />
                    <button className="btn-secondary py-1">Cộng</button>
                  </form>
                ) : t.status === 'MATCHED' ? `Đã cộng → #${t.userId}` : 'Bỏ qua'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
