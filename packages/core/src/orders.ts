import { getPool, withTx, type Queryable } from '@web12/db';
import type { ProductType } from './catalog';
import { decryptSecret, encryptSecret } from './crypto';
import { AppError, isUniqueViolation } from './errors';
import { enqueueFulfill } from './fulfill-queue';
import { priceForTier, type PriceFields } from './pricing';
import type { Tier } from './types';
import { applyBalanceChange } from './wallet';

export type OrderStatus = 'PENDING' | 'PREORDER' | 'COMPLETED' | 'REFUNDED';
export type OrderSource = 'WEB' | 'API';

export interface Order {
  id: number;
  userId: number;
  productId: number;
  productName: string;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  total: number;
  status: OrderStatus;
  source: OrderSource;
  paymentMethod: 'WALLET' | 'BANK';
  idempotencyKey: string | null;
  supplierRef: string | null;
  error: string | null;
  attempts: number;
  supplierAttempted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ORDER_SELECT = `SELECT o.id, o.user_id AS "userId", o.product_id AS "productId", p.name AS "productName",
  p.type AS "productType", o.quantity, o.unit_price AS "unitPrice", o.total, o.status, o.source,
  o.payment_method AS "paymentMethod",
  o.idempotency_key AS "idempotencyKey", o.supplier_ref AS "supplierRef", o.error, o.attempts, o.supplier_attempted AS "supplierAttempted",
  o.created_at AS "createdAt", o.updated_at AS "updatedAt"
  FROM orders o JOIN products p ON p.id = o.product_id`;

async function findByKey(c: Queryable, userId: number, key: string): Promise<Order | null> {
  const r = await c.query<Order>(`${ORDER_SELECT} WHERE o.user_id = $1 AND o.idempotency_key = $2`, [userId, key]);
  return r.rows[0] ?? null;
}

/** Internal transaction helper. BANK callers must confirm and lock the payment first. */
export async function createPaidOrder(c: Queryable, input: {
  userId: number; productId: number; productType: ProductType; quantity: number;
  unitPrice: number; source: OrderSource; key: string | null; paymentMethod: 'WALLET' | 'BANK'; preorder?: boolean;
}): Promise<{ id: number; isApi: boolean }> {
  const total = input.unitPrice * input.quantity;
  if (!Number.isSafeInteger(total) || total < 0) throw new AppError('INVALID_INPUT', 'Số tiền không hợp lệ');
  const isApi = input.productType === 'API';
  let itemIds: number[] = [];
  if (!isApi && !input.preorder) {
    const items = await c.query<{ id: number }>(
      `SELECT id FROM stock_items WHERE product_id = $1 AND status = 'AVAILABLE'
       ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [input.productId, input.quantity],
    );
    if (items.rows.length < input.quantity) throw new AppError('OUT_OF_STOCK', 'Không đủ hàng');
    itemIds = items.rows.map(row => row.id);
  }
  const inserted = await c.query<{ id: number }>(
    `INSERT INTO orders (user_id, product_id, quantity, unit_price, total, status, source, idempotency_key, payment_method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.userId, input.productId, input.quantity, input.unitPrice, total,
      input.preorder ? 'PREORDER' : isApi ? 'PENDING' : 'COMPLETED', input.source, input.key, input.paymentMethod],
  );
  const id = inserted.rows[0]!.id;
  if (total > 0 && input.paymentMethod === 'WALLET') {
    await applyBalanceChange(c, input.userId, -total, 'PURCHASE', { refType: 'order', refId: id });
  }
  if (itemIds.length) {
    await c.query(
      `UPDATE stock_items SET status = 'SOLD', order_id = $1, sold_at = now() WHERE id = ANY($2::bigint[])`,
      [id, itemIds],
    );
  }
  return { id, isApi };
}

export async function purchase(
  userId: number, productId: number, quantity: number,
  opts: { source?: OrderSource; idempotencyKey?: string | null; preorder?: boolean } = {},
): Promise<Order> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new AppError('INVALID_INPUT', 'Số lượng phải từ 1 đến 100');
  }
  const key = opts.idempotencyKey?.trim() || null;
  if (key && key.length > 100) throw new AppError('INVALID_INPUT', 'Idempotency-Key quá dài');
  if (key) {
    const existing = await findByKey(getPool(), userId, key);
    if (existing) return existing;
  }

  let created: { id: number; isApi: boolean };
  try {
    created = await withTx(async (c) => {
      const user = (await c.query<{ tier: Tier }>('SELECT tier FROM users WHERE id = $1', [userId])).rows[0];
      if (!user) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
      const product = (await c.query<PriceFields & { type: ProductType; active: boolean }>(
        `SELECT type, active, price_member AS "priceMember", price_ctv AS "priceCtv", price_agent AS "priceAgent"
         FROM products WHERE id = $1`, [productId],
      )).rows[0];
      if (!product || !product.active) throw new AppError('NOT_FOUND', 'Sản phẩm không tồn tại');
      if (opts.preorder && product.type === 'API') {
        const supplier = (await c.query<{ active: boolean; adapter: string }>(
          'SELECT s.active, s.adapter FROM suppliers s JOIN products p ON p.supplier_id = s.id WHERE p.id = $1', [productId],
        )).rows[0];
        if (!supplier?.active) throw new AppError('OUT_OF_STOCK', 'Sản phẩm tạm ngừng bán');
        if (supplier.adapter === 'shoptaikhoan' && quantity > 50) throw new AppError('INVALID_INPUT', 'Sản phẩm này mua tối đa 50 tài khoản mỗi đơn');
      }
      if (product.type === 'UNIQUE' && quantity !== 1) {
        throw new AppError('INVALID_INPUT', 'Sản phẩm này chỉ mua được số lượng 1');
      }

      const unitPrice = priceForTier(product, user.tier);
      return createPaidOrder(c, {
        userId, productId, productType: product.type, quantity, unitPrice,
        source: opts.source ?? 'WEB', key, paymentMethod: 'WALLET', preorder: opts.preorder,
      });
    });
  } catch (e) {
    // A concurrent request with the same key won the insert race: return its order.
    if (key && isUniqueViolation(e)) {
      const existing = await findByKey(getPool(), userId, key);
      if (existing) return existing;
    }
    throw e;
  }

  if (created.isApi) await enqueueFulfill(created.id);
  return (await getOrder(created.id))!;
}

export async function completeApiOrder(orderId: number, secrets: string[], supplierRef: string): Promise<boolean> {
  return withTx(async (c) => {
    const r = await c.query<{ productId: number }>(
      `UPDATE orders SET status = 'COMPLETED', supplier_ref = $2, error = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('PENDING', 'PREORDER') RETURNING product_id AS "productId"`,
      [orderId, supplierRef],
    );
    const row = r.rows[0];
    if (!row) return false;
    await c.query(
      `INSERT INTO stock_items (product_id, secret_enc, status, order_id, sold_at)
       SELECT $1, s, 'SOLD', $3, now() FROM unnest($2::text[]) WITH ORDINALITY AS t(s, i) ORDER BY i`,
      [row.productId, secrets.map(encryptSecret), orderId],
    );
    return true;
  });
}

export async function refundOrder(orderId: number, reason: string): Promise<boolean> {
  return withTx(async (c) => {
    const r = await c.query<{ userId: number; total: number }>(
      `UPDATE orders SET status = 'REFUNDED', error = $2, updated_at = now()
       WHERE id = $1 AND status = 'PENDING' RETURNING user_id AS "userId", total`,
      [orderId, reason],
    );
    const row = r.rows[0];
    if (!row) return false;
    if (row.total > 0) {
      await applyBalanceChange(c, row.userId, row.total, 'REFUND', { refType: 'order', refId: orderId, note: reason });
    }
    return true;
  });
}

export async function getOrder(id: number): Promise<Order | null> {
  const r = await getPool().query<Order>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function getOrderForUser(id: number, userId: number): Promise<Order> {
  const o = await getOrder(id);
  if (!o || o.userId !== userId) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng');
  return o;
}

export async function listOrdersForUser(userId: number, limit = 50): Promise<Order[]> {
  const r = await getPool().query<Order>(`${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.id DESC LIMIT $2`, [userId, limit]);
  return r.rows;
}

export async function listAllOrders(opts: { status?: OrderStatus; limit?: number } = {}): Promise<Order[]> {
  const r = await getPool().query<Order>(
    `${ORDER_SELECT} WHERE ($1::text IS NULL OR o.status = $1) ORDER BY o.id DESC LIMIT $2`,
    [opts.status ?? null, opts.limit ?? 100],
  );
  return r.rows;
}

export async function getOrderSecrets(orderId: number): Promise<string[]> {
  const r = await getPool().query<{ secretEnc: string }>(
    'SELECT secret_enc AS "secretEnc" FROM stock_items WHERE order_id = $1 ORDER BY id', [orderId],
  );
  return r.rows.map((row) => decryptSecret(row.secretEnc));
}

export async function incrementAttempts(orderId: number): Promise<number> {
  const r = await getPool().query<{ attempts: number }>(
    'UPDATE orders SET attempts = attempts + 1, updated_at = now() WHERE id = $1 RETURNING attempts', [orderId],
  );
  return r.rows[0]?.attempts ?? 0;
}

export async function listStalePendingOrders(olderThanSeconds: number): Promise<number[]> {
  const r = await getPool().query<{ id: number }>(
    `SELECT id FROM orders WHERE status = 'PENDING' AND updated_at < now() - make_interval(secs => $1)
     ORDER BY id LIMIT 100`,
    [olderThanSeconds],
  );
  return r.rows.map((row) => row.id);
}
