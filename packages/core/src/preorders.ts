import { getPool, withTx } from '@web12/db';
import { getProduct } from './catalog';
import { encryptSecret } from './crypto';
import { AppError } from './errors';
import { completeApiOrder, getOrder } from './orders';
import { withSupplierStock } from './stock';
import { getAdapterForSupplier, SupplierError } from './suppliers/index';

// Serialize manual and automatic fulfillment, including the external purchase.
// A separate committed marker survives a crash or ambiguous supplier response.
export async function fulfillPreorder(orderId: number): Promise<'completed' | 'waiting' | 'skipped'> {
  return withTx(async c => {
    const lock = await c.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1::bigint) AS locked', [orderId]);
    if (!lock.rows[0]!.locked) return 'skipped';
    const order = await getOrder(orderId);
    if (!order || order.status !== 'PREORDER' || order.productType !== 'API') return 'skipped';
    await getPool().query('UPDATE orders SET updated_at = now() WHERE id = $1', [orderId]);
    try {
      const product = await getProduct(order.productId);
      if (!product?.active || !product.supplierId || !product.supplierSku) return 'waiting';
      if (!order.supplierAttempted) {
        const [live] = await withSupplierStock([product]);
        if (live?.stock == null || live.stock < order.quantity) return 'waiting';
      }
      const adapter = await getAdapterForSupplier(product.supplierId);
      await getPool().query('UPDATE orders SET supplier_attempted = true, attempts = attempts + 1 WHERE id = $1', [orderId]);
      const result = await adapter.placeOrder({
        ref: `web12-${orderId}-${new Date(order.createdAt).getTime()}`,
        sku: product.supplierSku, quantity: order.quantity,
      });
      if (result.status === 'processing') throw new SupplierError('Nhà cung cấp đang xử lý', true);
      if (result.secrets.length !== order.quantity) throw new SupplierError('Nguồn trả thiếu tài khoản, cần đối soát trước khi giao tay', true);
      return await completeApiOrder(orderId, result.secrets, result.supplierRef) ? 'completed' : 'skipped';
    } catch (error) {
      // Only an explicit rejection of a first attempt makes manual fulfillment safe.
      const safe = !order.supplierAttempted && error instanceof SupplierError && !error.transient;
      await getPool().query(`UPDATE orders SET error = $2,
        supplier_attempted = CASE WHEN $3 THEN false ELSE supplier_attempted END WHERE id = $1`,
      [orderId, error instanceof Error ? error.message : String(error), safe]);
      return 'waiting';
    }
  });
}

export async function listDuePreorders(): Promise<number[]> {
  const result = await getPool().query<{ id: number }>(`SELECT o.id FROM orders o JOIN products p ON p.id = o.product_id
    WHERE o.status = 'PREORDER' AND p.type = 'API' AND o.updated_at < now() - interval '60 seconds'
    ORDER BY o.updated_at, o.id LIMIT 100`);
  return result.rows.map(r => r.id);
}

/** Empty accounts means allocate existing local inventory. Otherwise deliver entered accounts. */
export async function fulfillPreorderManually(orderId: number, actorId: number, accounts: string[] = []): Promise<void> {
  await withTx(async c => {
    const actor = (await c.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [actorId])).rows[0];
    if (!actor || !['ADMIN', 'STAFF'].includes(actor.role)) throw new AppError('FORBIDDEN', 'Không có quyền giao hàng');
    const lock = await c.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1::bigint) AS locked', [orderId]);
    if (!lock.rows[0]!.locked) throw new AppError('CONFLICT', 'Đơn đang được xử lý tự động. Vui lòng thử lại sau.');
    const order = (await c.query<{ productId: number; quantity: number; status: string; attempted: boolean }>(
      'SELECT product_id AS "productId", quantity, status, supplier_attempted AS attempted FROM orders WHERE id = $1 FOR UPDATE', [orderId],
    )).rows[0];
    if (!order || order.status !== 'PREORDER') throw new AppError('CONFLICT', 'Đơn không còn ở trạng thái chờ hàng');
    if (order.attempted) throw new AppError('CONFLICT', 'Nguồn đã nhận yêu cầu mua. Cần xác định kết quả từ nguồn trước khi giao tay.');
    const clean = accounts.map(s => s.trim()).filter(Boolean);
    if (clean.length) {
      if (clean.length !== order.quantity) throw new AppError('INVALID_INPUT', `Cần nhập đúng ${order.quantity} tài khoản, mỗi dòng một tài khoản`);
      await c.query(`INSERT INTO stock_items (product_id, secret_enc, status, order_id, sold_at)
        SELECT $1, s, 'SOLD', $3, now() FROM unnest($2::text[]) AS t(s)`, [order.productId, clean.map(encryptSecret), orderId]);
    } else {
      const stock = await c.query<{ id: number }>(`SELECT id FROM stock_items WHERE product_id = $1 AND status = 'AVAILABLE'
        ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [order.productId, order.quantity]);
      if (stock.rows.length !== order.quantity) throw new AppError('OUT_OF_STOCK', 'Kho chưa đủ hàng. Nhập kho hoặc nhập tài khoản để giao trực tiếp.');
      await c.query(`UPDATE stock_items SET status = 'SOLD', order_id = $1, sold_at = now() WHERE id = ANY($2::bigint[])`, [orderId, stock.rows.map(r => r.id)]);
    }
    await c.query(`UPDATE orders SET status = 'COMPLETED', fulfilled_by = $2, error = NULL, updated_at = now() WHERE id = $1`, [orderId, actorId]);
  });
}
