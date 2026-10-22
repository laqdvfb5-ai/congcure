import { getPool, withTx } from '@web12/db';
import { AppError } from './errors';
import { applyBalanceChange } from './wallet';
import { parseBankPaymentCode, receiveBankPayment } from './bank-payments';
import { enqueueFulfill } from './fulfill-queue';

/** SePay webhook body (fields we use). */
export interface BankWebhookPayload {
  id: number | string;
  gateway?: string;
  transferType: string;
  transferAmount: number;
  content: string;
  referenceCode?: string;
  transactionDate?: string;
  accountNumber?: string;
}

export type BankTxnStatus = 'MATCHED' | 'UNMATCHED' | 'IGNORED';

export interface BankTxn {
  id: number;
  provider: string;
  providerTxnId: string;
  amount: number;
  content: string;
  status: BankTxnStatus;
  userId: number | null;
  createdAt: Date;
}

export function parseTopupCode(content: string): string | null {
  const m = /NAP\s?(\d+)/i.exec(content);
  return m ? `NAP${m[1]}` : null;
}

export async function handleBankWebhook(
  p: BankWebhookPayload, provider = 'sepay',
): Promise<{ status: BankTxnStatus | 'DUPLICATE'; userId: number | null }> {
  const txnId = String(p.id ?? '').trim();
  if (!txnId) throw new AppError('INVALID_INPUT', 'Thiếu mã giao dịch');
  if (!Number.isSafeInteger(p.transferAmount) || p.transferAmount < 0) {
    throw new AppError('INVALID_INPUT', 'Số tiền không hợp lệ');
  }

  const result = await withTx(async (c) => {
    const incoming = p.transferType === 'in' && p.transferAmount > 0;
    const content = typeof p.content === 'string' ? p.content : '';
    const paymentCode = incoming ? parseBankPaymentCode(content) : null;
    const hasPaymentCode = /DH[A-F0-9]{16}/i.test(content);
    const code = incoming && !hasPaymentCode ? parseTopupCode(content) : null;
    const user = code
      ? (await c.query<{ id: number }>('SELECT id FROM users WHERE topup_code = $1', [code])).rows[0]
      : undefined;
    const status: BankTxnStatus = !incoming ? 'IGNORED' : user ? 'MATCHED' : 'UNMATCHED';

    // The unique (provider, provider_txn_id) index makes concurrent duplicates wait, then no-op.
    const ins = await c.query<{ id: number }>(
      `INSERT INTO bank_transactions (provider, provider_txn_id, amount, content, raw_payload, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider, provider_txn_id) DO NOTHING RETURNING id`,
      [provider, txnId, p.transferAmount, p.content ?? '', JSON.stringify(p), status, user?.id ?? null],
    );
    if (ins.rowCount === 0) return { status: 'DUPLICATE' as const, userId: null };

    if (paymentCode) {
      const payment = await receiveBankPayment(c, paymentCode, p.accountNumber ?? '', p.transferAmount, ins.rows[0]!.id);
      if (payment) return { status: 'MATCHED' as const, ...payment };
    }

    if (status === 'MATCHED' && user) {
      await applyBalanceChange(c, user.id, p.transferAmount, 'TOPUP', {
        refType: 'bank_txn', refId: ins.rows[0]!.id, note: p.content,
      });
    }
    return { status, userId: user?.id ?? null };
  });
  if ('orderId' in result && result.orderId) await enqueueFulfill(result.orderId);
  return { status: result.status, userId: result.userId };
}

export async function assignBankTxn(txnId: number, userId: number, adminId: number): Promise<void> {
  await withTx(async (c) => {
    const r = await c.query<{ amount: number }>(
      `UPDATE bank_transactions SET status = 'MATCHED', user_id = $2
       WHERE id = $1 AND status = 'UNMATCHED' RETURNING amount`,
      [txnId, userId],
    );
    if (r.rowCount === 0) throw new AppError('CONFLICT', 'Giao dịch đã được xử lý hoặc không tồn tại');
    await applyBalanceChange(c, userId, r.rows[0]!.amount, 'TOPUP', {
      refType: 'bank_txn', refId: txnId, note: 'Gán thủ công', createdBy: adminId,
    });
  });
}

export async function listBankTxns(opts: { status?: BankTxnStatus; limit?: number } = {}): Promise<BankTxn[]> {
  const r = await getPool().query<BankTxn>(
    `SELECT id, provider, provider_txn_id AS "providerTxnId", amount, content, status,
            user_id AS "userId", created_at AS "createdAt"
     FROM bank_transactions WHERE ($1::text IS NULL OR status = $1)
     ORDER BY id DESC LIMIT $2`,
    [opts.status ?? null, opts.limit ?? 100],
  );
  return r.rows;
}
