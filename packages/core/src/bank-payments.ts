import { randomBytes } from 'node:crypto';
import { getPool, withTx, type Queryable } from '@web12/db';
import type { ProductType } from './catalog';
import { AppError } from './errors';
import { createPaidOrder } from './orders';
import { priceForTier, type PriceFields } from './pricing';
import type { Tier } from './types';
import { applyBalanceChange } from './wallet';

export type BankPaymentStatus = 'PENDING' | 'PAID' | 'CREDITED' | 'EXPIRED' | 'CANCELLED';
export interface BankPayment {
  id: number; code: string; userId: number; productId: number; productName: string; productSlug: string;
  quantity: number; unitPrice: number; total: number; receivedAmount: number; creditedAmount: number;
  status: BankPaymentStatus; orderId: number | null; bankId: string; bankAccount: string;
  bankAccountName: string; expiresAt: Date; createdAt: Date;
}
interface LockedPayment extends BankPayment {
  productType: ProductType; supplierId: number | null; supplierSku: string | null;
}
const SELECT = `SELECT b.id, b.code, b.user_id AS "userId", b.product_id AS "productId",
  b.product_name AS "productName", p.slug AS "productSlug", b.product_type AS "productType",
  b.supplier_id AS "supplierId", b.supplier_sku AS "supplierSku", b.quantity, b.unit_price AS "unitPrice",
  b.total, b.received_amount AS "receivedAmount", b.credited_amount AS "creditedAmount", b.status,
  b.order_id AS "orderId", b.bank_id AS "bankId", b.bank_account AS "bankAccount",
  b.bank_account_name AS "bankAccountName", b.expires_at AS "expiresAt", b.created_at AS "createdAt"
  FROM bank_payments b JOIN products p ON p.id = b.product_id`;

export function parseBankPaymentCode(content: string): string | null {
  const codes = [...new Set(content.toUpperCase().match(/DH[A-F0-9]{16}(?![A-Z0-9])/g))];
  return codes.length === 1 ? codes[0]! : null;
}

export async function createBankPayment(userId: number, productId: number, quantity: number, input: {
  requestKey: string; bankId: string; bankAccount: string; bankAccountName: string;
}): Promise<BankPayment> {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new AppError('INVALID_INPUT', 'Số lượng phải từ 1 đến 100');
  }
  if (!input.requestKey || input.requestKey.length > 100) throw new AppError('INVALID_INPUT', 'Mã yêu cầu không hợp lệ');
  if (!/^[A-Za-z0-9]+$/.test(input.bankId) || !/^\d{4,30}$/.test(input.bankAccount) || /^0+$/.test(input.bankAccount)) {
    throw new AppError('INVALID_INPUT', 'Chưa cấu hình ngân hàng nhận thanh toán');
  }
  const code = await withTx(async c => {
    // Serialize creation per user so retries and the pending-payment limit are atomic.
    const user = (await c.query<{ tier: Tier }>('SELECT tier FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
    const previous = (await c.query<BankPayment>(`${SELECT} WHERE b.user_id = $1 AND b.request_key = $2`, [userId, input.requestKey])).rows[0];
    if (previous) {
      if (previous.productId !== productId || previous.quantity !== quantity) throw new AppError('CONFLICT', 'Yêu cầu thanh toán đã thay đổi. Vui lòng tải lại trang.');
      return previous.code;
    }
    const pending = await c.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM bank_payments WHERE user_id = $1 AND status = 'PENDING' AND expires_at > now()`, [userId],
    );
    if (pending.rows[0]!.count >= 5) throw new AppError('RATE_LIMITED', 'Bạn có 5 thanh toán đang chờ. Vui lòng hoàn tất hoặc hủy bớt.');
    const product = (await c.query<PriceFields & {
      name: string; type: ProductType; active: boolean; supplierId: number | null; supplierSku: string | null;
    }>(`SELECT name, type, active, supplier_id AS "supplierId", supplier_sku AS "supplierSku",
      price_member AS "priceMember", price_ctv AS "priceCtv", price_agent AS "priceAgent" FROM products WHERE id = $1`, [productId])).rows[0];
    if (!product?.active) throw new AppError('NOT_FOUND', 'Sản phẩm không tồn tại');
    if (product.type === 'UNIQUE' && quantity !== 1) throw new AppError('INVALID_INPUT', 'Sản phẩm này chỉ mua được số lượng 1');
    if (product.type === 'API') {
      const supplier = (await c.query<{ active: boolean; adapter: string }>('SELECT active, adapter FROM suppliers WHERE id = $1', [product.supplierId])).rows[0];
      if (!supplier?.active) throw new AppError('OUT_OF_STOCK', 'Sản phẩm tạm ngừng bán');
      if (supplier.adapter === 'shoptaikhoan' && quantity > 50) throw new AppError('INVALID_INPUT', 'Sản phẩm này mua tối đa 50 tài khoản mỗi đơn');
    } else {
      const stock = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM stock_items WHERE product_id = $1 AND status = 'AVAILABLE'`, [productId]);
      if (stock.rows[0]!.count < quantity) throw new AppError('OUT_OF_STOCK', 'Không đủ hàng');
    }
    const price = priceForTier(product, user.tier);
    if (!Number.isSafeInteger(price * quantity) || price <= 0 || price * quantity > 100_000_000) {
      throw new AppError('INVALID_INPUT', 'Số tiền chuyển khoản phải từ 1đ đến 100.000.000đ');
    }
    const code = 'DH' + randomBytes(8).toString('hex').toUpperCase();
    await c.query(`INSERT INTO bank_payments
      (code,user_id,product_id,product_name,product_type,supplier_id,supplier_sku,quantity,unit_price,total,request_key,bank_id,bank_account,bank_account_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [code,userId,productId,product.name,product.type,product.supplierId,product.supplierSku,quantity,price,price*quantity,input.requestKey,input.bankId,input.bankAccount,input.bankAccountName]);
    return code;
  });
  return getBankPaymentForUser(code, userId);
}

async function credit(c: Queryable, payment: LockedPayment, amount: number, note: string): Promise<void> {
  if (amount <= 0) return;
  await applyBalanceChange(c, payment.userId, amount, 'TOPUP', { refType: 'bank_payment', refId: payment.id, note });
  await c.query('UPDATE bank_payments SET credited_amount = credited_amount + $2 WHERE id = $1', [payment.id, amount]);
}

async function endPending(c: Queryable, payment: LockedPayment, status: 'CREDITED' | 'EXPIRED' | 'CANCELLED') {
  await credit(c, payment, payment.receivedAmount - payment.creditedAmount, `Chuyển tiền thanh toán ${payment.code} vào ví`);
  await c.query('UPDATE bank_payments SET status = $2, updated_at = now() WHERE id = $1', [payment.id, status]);
}

export async function expireBankPayments(): Promise<void> {
  await withTx(async c => {
    const payments = await c.query<LockedPayment>(`${SELECT}
      WHERE b.status = 'PENDING' AND b.expires_at <= now() ORDER BY b.id LIMIT 100 FOR UPDATE OF b SKIP LOCKED`);
    for (const payment of payments.rows) await endPending(c, payment, 'EXPIRED');
  });
}

export async function getBankPaymentForUser(code: string, userId: number): Promise<BankPayment> {
  return withTx(async c => {
    const read = () => c.query<LockedPayment>(`${SELECT} WHERE b.code = $1 AND b.user_id = $2 FOR UPDATE OF b`, [code, userId]);
    let payment = (await read()).rows[0];
    if (!payment) throw new AppError('NOT_FOUND', 'Không tìm thấy thanh toán');
    if (payment.status === 'PENDING' && new Date(payment.expiresAt).getTime() <= Date.now()) {
      await endPending(c, payment, 'EXPIRED');
      payment = (await read()).rows[0]!;
    }
    return payment;
  });
}

export async function listBankPaymentsForUser(userId: number): Promise<BankPayment[]> {
  return (await getPool().query<BankPayment>(`${SELECT} WHERE b.user_id = $1 AND b.status <> 'PAID' ORDER BY b.id DESC LIMIT 20`, [userId])).rows;
}

export async function cancelBankPayment(code: string, userId: number): Promise<void> {
  await withTx(async c => {
    const payment = (await c.query<LockedPayment>(`${SELECT} WHERE b.code = $1 AND b.user_id = $2 FOR UPDATE OF b`, [code, userId])).rows[0];
    if (!payment) throw new AppError('NOT_FOUND', 'Không tìm thấy thanh toán');
    if (payment.status === 'PAID') throw new AppError('CONFLICT', 'Thanh toán đã hoàn tất');
    if (payment.status === 'PENDING') await endPending(c, payment, 'CANCELLED');
  });
}

/** Called only after authenticating the webhook, inside its bank-transaction transaction. */
export async function receiveBankPayment(c: Queryable, code: string, account: string, amount: number, bankTxnId: number): Promise<{ userId: number; orderId?: number } | null> {
  const payment = (await c.query<LockedPayment>(`${SELECT} WHERE b.code = $1 FOR UPDATE OF b`, [code])).rows[0];
  if (!payment || payment.bankAccount !== account) return null;
  const received = payment.receivedAmount + amount;
  if (!Number.isSafeInteger(received)) throw new AppError('INVALID_INPUT', 'Tổng tiền không hợp lệ');
  await c.query('UPDATE bank_transactions SET payment_id = $2, user_id = $3, status = \'MATCHED\' WHERE id = $1', [bankTxnId, payment.id, payment.userId]);
  await c.query('UPDATE bank_payments SET received_amount = $2, updated_at = now() WHERE id = $1', [payment.id, received]);
  payment.receivedAmount = received;
  if (payment.status !== 'PENDING') {
    await credit(c, payment, amount, `Chuyển khoản bổ sung cho ${payment.code}`);
    return { userId: payment.userId };
  }
  if (new Date(payment.expiresAt).getTime() <= Date.now()) {
    await endPending(c, payment, 'EXPIRED');
    return { userId: payment.userId };
  }
  if (received < payment.total) return { userId: payment.userId };

  const product = (await c.query<{ type: ProductType; active: boolean; supplierId: number | null; supplierSku: string | null }>(
    `SELECT type, active, supplier_id AS "supplierId", supplier_sku AS "supplierSku" FROM products WHERE id = $1 FOR SHARE`, [payment.productId],
  )).rows[0];
  if (!product?.active || product.type !== payment.productType || product.supplierId !== payment.supplierId || product.supplierSku !== payment.supplierSku) {
    await endPending(c, payment, 'CREDITED');
    return { userId: payment.userId };
  }
  // Keep the receipt even when stock has sold out; roll back only order allocation.
  await c.query('SAVEPOINT allocate_order');
  let order;
  try {
    order = await createPaidOrder(c, {
      userId: payment.userId, productId: payment.productId, productType: payment.productType,
      quantity: payment.quantity, unitPrice: payment.unitPrice, source: 'WEB',
      key: null, paymentMethod: 'BANK',
    });
  } catch (error) {
    await c.query('ROLLBACK TO SAVEPOINT allocate_order');
    if (!(error instanceof AppError) || error.code !== 'OUT_OF_STOCK') throw error;
    await endPending(c, payment, 'CREDITED');
    return { userId: payment.userId };
  }
  await c.query('RELEASE SAVEPOINT allocate_order');
  await c.query(`UPDATE bank_payments SET status = 'PAID', order_id = $2, updated_at = now() WHERE id = $1`, [payment.id, order.id]);
  await credit(c, payment, received - payment.total, `Tiền dư thanh toán ${payment.code}`);
  return { userId: payment.userId, ...(order.isApi ? { orderId: order.id } : {}) };
}
