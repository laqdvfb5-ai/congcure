import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatVnd, TIER_LABEL } from '@/lib/format';
import { adjustBalanceAction, setRoleAction, setTierAction } from '../actions';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const users = await core.listUsers({ q: sp.q });
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Người dùng</h1>
      <Flash searchParams={sp} />
      <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Tìm email / tên" className="input" /><button className="btn-secondary">Tìm</button></form>
      <table className="table">
        <thead><tr><th>#</th><th>Email / Tên</th><th>Số dư</th><th>Cấp</th><th>Vai trò</th><th>Cộng/trừ tiền (ADMIN)</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.email}<div className="text-xs text-muted">{u.name} · {u.topupCode}</div></td>
              <td>{formatVnd(u.balance)}</td>
              <td>
                <form action={setTierAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="tier" defaultValue={u.tier} className="input py-1">
                    {core.TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                  </select>
                  <button className="btn-secondary py-1">Lưu</button>
                </form>
              </td>
              <td>
                <form action={setRoleAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input py-1">
                    {core.ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn-secondary py-1">Lưu</button>
                </form>
              </td>
              <td>
                <form action={adjustBalanceAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <input name="amount" placeholder="+50000 / -20000" className="input w-28 py-1" required />
                  <input name="note" placeholder="Lý do" className="input w-28 py-1" required />
                  <button className="btn-secondary py-1">OK</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
