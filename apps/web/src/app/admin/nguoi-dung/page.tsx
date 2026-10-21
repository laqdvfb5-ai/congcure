import { Search, Save, Check } from "lucide-react";
import { Flash } from "@/components/Flash";
import { PageHeading, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { formatVnd, TIER_LABEL } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { adjustBalanceAction, setRoleAction, setTierAction } from "../actions";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const [users, staff] = await Promise.all([
    core.listUsers({ q: sp.q }),
    requireStaff(),
  ]);
  const admin = staff.role === "ADMIN";
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / KHÁCH HÀNG"
        title="Người dùng"
        description="Quản lý cấp giá, vai trò và số dư tài khoản."
      />
      <Flash searchParams={sp} />
      <div className="table-surface">
        <form className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Tìm email hoặc tên…"
              aria-label="Tìm người dùng"
            />
          </label>
          <button className="btn-secondary btn-sm">Tìm kiếm</button>
        </form>
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Số dư</th>
                <th>Cấp giá</th>
                <th>Vai trò</th>
                {admin && <th>Điều chỉnh số dư</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="min-w-52">
                    <strong>{u.name}</strong>
                    <div className="text-xs text-muted">{u.email}</div>
                    <div className="text-xs text-muted mt-1">
                      #{u.id} · {u.topupCode}
                    </div>
                  </td>
                  <td className="nowrap">{formatVnd(u.balance)}</td>
                  <td>
                    <form action={setTierAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="tier"
                        defaultValue={u.tier}
                        className="input min-w-28"
                        aria-label={"Cấp của " + u.name}
                      >
                        {core.TIERS.map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <button
                        className="icon-btn"
                        title="Lưu cấp"
                        aria-label={"Lưu cấp của " + u.name}
                      >
                        <Save size={15} />
                      </button>
                    </form>
                  </td>
                  <td>
                    {admin ? (
                      <form action={setRoleAction} className="flex gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="input min-w-28"
                          aria-label={"Vai trò của " + u.name}
                        >
                          {core.ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-btn"
                          title="Lưu vai trò"
                          aria-label={"Lưu vai trò của " + u.name}
                        >
                          <Save size={15} />
                        </button>
                      </form>
                    ) : (
                      u.role
                    )}
                  </td>
                  {admin && (
                    <td>
                      <form
                        action={adjustBalanceAction}
                        className="flex gap-2 min-w-72"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          name="amount"
                          type="number"
                          step={1}
                          placeholder="+50000 / -20000"
                          className="input w-32"
                          required
                          aria-label="Số tiền điều chỉnh"
                        />
                        <input
                          name="note"
                          placeholder="Lý do"
                          className="input w-32"
                          required
                          aria-label="Lý do điều chỉnh"
                        />
                        <button
                          className="icon-btn"
                          title="Áp dụng điều chỉnh"
                          aria-label={"Điều chỉnh số dư của " + u.name}
                        >
                          <Check size={17} />
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <EmptyState title="Không tìm thấy người dùng" />}
        <div className="catalog-foot">Tối đa 100 người dùng gần nhất</div>
      </div>
    </>
  );
}
