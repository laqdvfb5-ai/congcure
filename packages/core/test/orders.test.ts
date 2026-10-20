import { afterEach, describe, expect, it } from 'vitest';
import { getPool } from '@web12/db';
import {
  completeApiOrder, getOrderForUser, getOrderSecrets, getProduct, getUser, incrementAttempts,
  listLedger, listOrdersForUser, listStalePendingOrders, purchase, refundOrder, setFulfillEnqueuer,
} from '../src/index';
import { makeProduct, makeUser } from './factories';

async function apiProduct(price = 5_000) {
  const s = await getPool().query<{ id: number }>(
    `INSERT INTO suppliers (name, base_url, api_key_enc) VALUES ('mock', 'http://localhost', 'x') RETURNING id`,
  );
  return makeProduct({ type: 'API', price, supplierId: s.rows[0]!.id, supplierSku: 'sku-1' });
}

afterEach(() => setFulfillEnqueuer(null));

describe('purchase STOCK/UNIQUE', () => {
  it('charges the tier price, delivers stock and writes the ledger', async () => {
    const u = await makeUser({ tier: 'CTV', balance: 100_000 });
    const p = await makeProduct({ prices: { priceMember: 10_000, priceCtv: 9_000, priceAgent: 8_000 }, stock: 5 });

    const o = await purchase(u.id, p.id, 3);
    expect(o).toMatchObject({ status: 'COMPLETED', quantity: 3, unitPrice: 9_000, total: 27_000, source: 'WEB' });
    expect(await getOrderSecrets(o.id)).toEqual(['acc0|pass0', 'acc1|pass1', 'acc2|pass2']);
    expect((await getUser(u.id))?.balance).toBe(73_000);
    expect((await getProduct(p.id))?.stock).toBe(2);
    const [entry] = await listLedger(u.id);
    expect(entry).toMatchObject({ type: 'PURCHASE', amount: -27_000, refType: 'order', refId: String(o.id) });
  });

  it('rolls back everything when balance is insufficient', async () => {
    const u = await makeUser({ balance: 5_000 });
    const p = await makeProduct({ price: 10_000, stock: 2 });
    await expect(purchase(u.id, p.id, 1)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await listOrdersForUser(u.id)).toHaveLength(0);
    expect((await getProduct(p.id))?.stock).toBe(2);
  });

  it('rejects out-of-stock, bad quantity, inactive/missing products', async () => {
    const u = await makeUser({ balance: 1_000_000 });
    const p = await makeProduct({ stock: 1 });
    await expect(purchase(u.id, p.id, 2)).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    await expect(purchase(u.id, p.id, 0)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(purchase(u.id, p.id, 101)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(purchase(u.id, 99_999, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await getPool().query('UPDATE products SET active = false WHERE id = $1', [p.id]);
    await expect(purchase(u.id, p.id, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows only quantity 1 for UNIQUE products', async () => {
    const u = await makeUser({ balance: 1_000_000 });
    const p = await makeProduct({ type: 'UNIQUE', stock: 1 });
    await expect(purchase(u.id, p.id, 2)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await purchase(u.id, p.id, 1)).status).toBe('COMPLETED');
    await expect(purchase(u.id, p.id, 1)).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('never sells the same item twice under concurrency', async () => {
    const p = await makeProduct({ price: 1_000, stock: 10 });
    const buyers = await Promise.all(Array.from({ length: 20 }, () => makeUser({ balance: 10_000 })));
    const results = await Promise.allSettled(buyers.map((b) => purchase(b.id, p.id, 1)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'OUT_OF_STOCK' });
    }
    const sold = await getPool().query<{ n: number; distinct_orders: number }>(
      `SELECT count(*)::int AS n, count(DISTINCT order_id)::int AS distinct_orders
       FROM stock_items WHERE product_id = $1 AND status = 'SOLD'`, [p.id],
    );
    expect(sold.rows[0]).toEqual({ n: 10, distinct_orders: 10 });
  });

  it('is idempotent per user + key, including concurrent retries', async () => {
    const u = await makeUser({ balance: 100_000 });
    const p = await makeProduct({ price: 10_000, stock: 5 });
    const [a, b] = await Promise.all([
      purchase(u.id, p.id, 1, { source: 'API', idempotencyKey: 'req-1' }),
      purchase(u.id, p.id, 1, { source: 'API', idempotencyKey: 'req-1' }),
    ]);
    expect(a.id).toBe(b.id);
    expect((await purchase(u.id, p.id, 1, { idempotencyKey: 'req-1' })).id).toBe(a.id);
    expect((await getUser(u.id))?.balance).toBe(90_000);
    expect(await listOrdersForUser(u.id)).toHaveLength(1);
  });

  it('hides other users\' orders', async () => {
    const u = await makeUser({ balance: 100_000 });
    const other = await makeUser();
    const p = await makeProduct({ stock: 1 });
    const o = await purchase(u.id, p.id, 1);
    expect((await getOrderForUser(o.id, u.id)).id).toBe(o.id);
    await expect(getOrderForUser(o.id, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('purchase API', () => {
  it('creates a PENDING order, charges, and enqueues fulfilment after commit', async () => {
    const queued: number[] = [];
    setFulfillEnqueuer(async (id) => { queued.push(id); });
    const u = await makeUser({ balance: 20_000 });
    const p = await apiProduct(5_000);

    const o = await purchase(u.id, p.id, 2);
    expect(o).toMatchObject({ status: 'PENDING', total: 10_000 });
    expect(queued).toEqual([o.id]);
    expect((await getUser(u.id))?.balance).toBe(10_000);
  });

  it('still succeeds when the enqueuer fails (sweeper retries later)', async () => {
    setFulfillEnqueuer(async () => { throw new Error('queue down'); });
    const u = await makeUser({ balance: 20_000 });
    const p = await apiProduct();
    const o = await purchase(u.id, p.id, 1);
    expect(o.status).toBe('PENDING');
    await getPool().query(`UPDATE orders SET updated_at = now() - interval '10 minutes' WHERE id = $1`, [o.id]);
    expect(await listStalePendingOrders(120)).toEqual([o.id]);
  });

  it('completes with supplier secrets exactly once', async () => {
    const u = await makeUser({ balance: 20_000 });
    const p = await apiProduct();
    const o = await purchase(u.id, p.id, 2);
    expect(await completeApiOrder(o.id, ['s1', 's2'], 'SUP-1')).toBe(true);
    expect(await completeApiOrder(o.id, ['s3'], 'SUP-2')).toBe(false);
    expect(await getOrderSecrets(o.id)).toEqual(['s1', 's2']);
    expect(await refundOrder(o.id, 'late failure')).toBe(false);
    expect((await getOrderForUser(o.id, u.id)).supplierRef).toBe('SUP-1');
  });

  it('refunds exactly once, even concurrently', async () => {
    const u = await makeUser({ balance: 20_000 });
    const p = await apiProduct(5_000);
    const o = await purchase(u.id, p.id, 1);
    const results = await Promise.all([refundOrder(o.id, 'supplier error'), refundOrder(o.id, 'supplier error')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await getUser(u.id))?.balance).toBe(20_000);
    const refunded = await getOrderForUser(o.id, u.id);
    expect(refunded).toMatchObject({ status: 'REFUNDED', error: 'supplier error' });
    expect((await listLedger(u.id)).map((e) => e.type)).toEqual(['REFUND', 'PURCHASE']);
  });

  it('counts attempts', async () => {
    const u = await makeUser({ balance: 20_000 });
    const o = await purchase(u.id, (await apiProduct()).id, 1);
    expect(await incrementAttempts(o.id)).toBe(1);
    expect(await incrementAttempts(o.id)).toBe(2);
  });
});
