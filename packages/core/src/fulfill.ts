import { getProduct } from './catalog';
import { completeApiOrder, getOrder, incrementAttempts, refundOrder } from './orders';
import { getAdapterForSupplier, SupplierError } from './suppliers/index';

export const MAX_FULFILL_ATTEMPTS = 5;

export type FulfillOutcome = 'completed' | 'refunded' | 'skipped';

export async function fulfillApiOrder(orderId: number): Promise<FulfillOutcome> {
  const order = await getOrder(orderId);
  if (!order || order.status !== 'PENDING') return 'skipped';

  const attempts = await incrementAttempts(orderId);
  try {
    const product = await getProduct(order.productId);
    if (!product?.supplierId || !product.supplierSku) {
      throw new SupplierError('Sản phẩm chưa cấu hình nhà cung cấp', false);
    }
    const adapter = await getAdapterForSupplier(product.supplierId);
    const result = await adapter.placeOrder({ ref: `web12-${orderId}`, sku: product.supplierSku, quantity: order.quantity });

    if (result.status === 'processing') throw new SupplierError('Nhà cung cấp đang xử lý', true);
    if (result.secrets.length !== order.quantity) {
      throw new SupplierError(`Nhà cung cấp trả ${result.secrets.length}/${order.quantity} tài khoản`, false);
    }
    return (await completeApiOrder(orderId, result.secrets, result.supplierRef)) ? 'completed' : 'skipped';
  } catch (err) {
    const transient = err instanceof SupplierError ? err.transient : true;
    if (transient && attempts < MAX_FULFILL_ATTEMPTS) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    return (await refundOrder(orderId, reason)) ? 'refunded' : 'skipped';
  }
}
