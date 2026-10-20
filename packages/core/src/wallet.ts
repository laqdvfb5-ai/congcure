import { getPool, withTx, type Queryable } from '@web12/db';
import { AppError } from './errors';

export type LedgerType = 'TOPUP' | 'PURCHASE' | 'REFUND' | 'ADJUST';

export interface LedgerRef {
  refType?: string;
  refId?: string | number;
  note?: string;
  createdBy?: number;
}

export interface LedgerEntry {
  id: number;
  userId: number;
  amount: number;
  balanceAfter: number;
  type: LedgerType;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdBy: number | null;
  createdAt: Date;
}

/** Must run inside a transaction. The conditional UPDATE is the overdraft guard. */
export async function applyBalanceChange(
  c: Queryable, userId: number, amount: number, type: LedgerType, ref: LedgerRef = {},
): Promise<number> {
  if (!Number.isSafeInteger(amount) || amount === 0) {
    throw new AppError('INVALID_INPUT', 'Số tiền không hợp lệ');
  }
  const r = await c.query<{ balance: number }>(
    'UPDATE users SET balance = balance + $2 WHERE id = $1 AND balance + $2 >= 0 RETURNING balance',
    [userId, amount],
  );
  if (r.rowCount === 0) {
    const exists = await c.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (exists.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
    throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ');
  }
  const balanceAfter = r.rows[0]!.balance;
  await c.query(
    `INSERT INTO ledger_entries (user_id, amount, balance_after, type, ref_type, ref_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, amount, balanceAfter, type, ref.refType ?? null,
      ref.refId == null ? null : String(ref.refId), ref.note ?? null, ref.createdBy ?? null],
  );
  return balanceAfter;
}

export async function adjustBalance(userId: number, amount: number, note: string, adminId: number): Promise<number> {
  if (!note.trim()) throw new AppError('INVALID_INPUT', 'Vui lòng nhập lý do');
  return withTx((c) => applyBalanceChange(c, userId, amount, 'ADJUST', { refType: 'admin', note: note.trim(), createdBy: adminId }));
}

export async function listLedger(userId: number, limit = 50): Promise<LedgerEntry[]> {
  const r = await getPool().query<LedgerEntry>(
    `SELECT id, user_id AS "userId", amount, balance_after AS "balanceAfter", type, ref_type AS "refType",
            ref_id AS "refId", note, created_by AS "createdBy", created_at AS "createdAt"
     FROM ledger_entries WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );
  return r.rows;
}
