import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '@web12/db';
import {
  addStock, createBankPayment, createSupplier, fulfillApiOrder, fulfillPreorderManually,
  getBankPaymentForUser, getOrder, getOrderSecrets, getProduct, getUser,
  handleBankWebhook, listDuePreorders, listLedger, purchase,
} from '../src/index';
import { makeProduct, makeUser } from './factories';

let server: http.Server | undefined;
afterEach(async () => { if (server) { await new Promise<void>(r => server!.close(() => r())); server = undefined; } });

async function apiFixture(stock: () => number, place: (res: http.ServerResponse) => void) {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') res.end(JSON.stringify({ products: [{ sku: 'one', stock: stock(), name: 'One', price: 10000 }] }));
    else place(res);
  });
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
  const supplier = await createSupplier({ name: 'Test', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, apiKey: 'test' });
  const product = await makeProduct({ type: 'API', supplierId: supplier.id, supplierSku: 'one' });
  const user = await makeUser({ balance: 50000 });
  const order = await purchase(user.id, product.id, 1, { preorder: true });
  return { order, user, product };
}

describe('preorders', () => {
  it('charges once, waits without stock and permits only staff to deliver the exact quantity', async () => {
    const user = await makeUser({ balance: 50000 });
    const admin = await makeUser({ role: 'ADMIN' });
    const product = await makeProduct();
    const buy = () => purchase(user.id, product.id, 2, { preorder: true, idempotencyKey: 'same' });
    const [a, b] = await Promise.all([buy(), buy()]);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('PREORDER');
    expect((await getUser(user.id))?.balance).toBe(30000);
    expect(await listLedger(user.id)).toHaveLength(1);
    await expect(fulfillPreorderManually(a.id, user.id, ['a', 'b'])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(fulfillPreorderManually(a.id, admin.id, ['a'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await getOrderSecrets(a.id)).toEqual([]);
    const results = await Promise.allSettled([1, 2].map(() => fulfillPreorderManually(a.id, admin.id, ['a', 'b'])));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await getOrderSecrets(a.id)).toEqual(['a', 'b']);
    expect((await getOrder(a.id))?.status).toBe('COMPLETED');
    expect(await listLedger(user.id)).toHaveLength(1);
  });

  it('rolls back when the wallet is insufficient and preserves normal out-of-stock behavior', async () => {
    const user = await makeUser();
    const product = await makeProduct();
    await expect(purchase(user.id, product.id, 1, { preorder: true })).rejects.toBeDefined();
    expect((await getPool().query('SELECT id FROM orders')).rowCount).toBe(0);
    await expect(purchase(user.id, product.id, 1)).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('allocates local stock on admin request without selling an account twice', async () => {
    const user = await makeUser({ balance: 50000 });
    const admin = await makeUser({ role: 'ADMIN' });
    const product = await makeProduct();
    const a = await purchase(user.id, product.id, 1, { preorder: true });
    const b = await purchase(user.id, product.id, 1, { preorder: true });
    await addStock(product.id, ['local|secret']);
    const results = await Promise.allSettled([a, b].map(o => fulfillPreorderManually(o.id, admin.id)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getProduct(product.id))?.stock).toBe(0);
  });

  it('creates a bank preorder only after full payment, with duplicate receipts and no wallet debit', async () => {
    const user = await makeUser({ balance: 1234 });
    const product = await makeProduct();
    const payment = await createBankPayment(user.id, product.id, 1, {
      preorder: true, requestKey: 'bank-preorder', bankId: 'MB', bankAccount: '1234567890', bankAccountName: 'TEST',
    });
    const payload = { id: 'preorder-receipt', transferType: 'in', transferAmount: 10000, content: payment.code, accountNumber: payment.bankAccount };
    expect(payment.orderId).toBeNull();
    await Promise.all([handleBankWebhook(payload), handleBankWebhook(payload)]);
    const paid = await getBankPaymentForUser(payment.code, user.id);
    expect(paid.status).toBe('PAID');
    expect(await getOrder(paid.orderId!)).toMatchObject({ status: 'PREORDER', paymentMethod: 'BANK' });
    expect((await getUser(user.id))?.balance).toBe(1234);
    expect(await listLedger(user.id)).toHaveLength(0);
  });

  it('keeps API orders waiting with no purchase when stock is zero, and allows manual delivery', async () => {
    let calls = 0;
    const { order, user } = await apiFixture(() => 0, res => { calls++; res.end('{}'); });
    for (let i = 0; i < 6; i++) expect(await fulfillApiOrder(order.id)).toBe('waiting');
    expect(calls).toBe(0);
    expect((await getUser(user.id))?.balance).toBe(40000);
    const admin = await makeUser({ role: 'ADMIN' });
    await fulfillPreorderManually(order.id, admin.id, ['manual|secret']);
    expect(await fulfillApiOrder(order.id)).toBe('skipped');
  });

  it('delivers API stock once despite concurrent workers and manual fulfillment', async () => {
    let calls = 0;
    let release!: () => void;
    let started!: () => void;
    const begun = new Promise<void>(r => { started = r; });
    const { order } = await apiFixture(() => 10, res => {
      calls++; started();
      release = () => res.end(JSON.stringify({ status: 'completed', id: 'supplier-1', accounts: ['api|secret'] }));
    });
    const admin = await makeUser({ role: 'ADMIN' });
    const automatic = fulfillApiOrder(order.id);
    await begun;
    try {
      expect(await fulfillApiOrder(order.id)).toBe('skipped');
      await expect(fulfillPreorderManually(order.id, admin.id, ['manual'])).rejects.toMatchObject({ code: 'CONFLICT' });
    } finally { release(); }
    expect(await automatic).toBe('completed');
    expect(calls).toBe(1);
    expect(await getOrderSecrets(order.id)).toEqual(['api|secret']);
  });

  it('automatically delivers after a sold-out supplier restocks and the stock cache expires', async () => {
    let stock = 0;
    let calls = 0;
    const { order } = await apiFixture(() => stock, res => {
      calls++;
      res.end(JSON.stringify({ status: 'completed', id: 'restocked', accounts: ['restocked|secret'] }));
    });
    expect(await fulfillApiOrder(order.id)).toBe('waiting');
    expect(calls).toBe(0);
    stock = 10;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
    try {
      expect(await fulfillApiOrder(order.id)).toBe('completed');
      expect(calls).toBe(1);
      expect(await getOrderSecrets(order.id)).toEqual(['restocked|secret']);
    } finally { clock.mockRestore(); }
  });

  it('keeps ambiguous supplier requests locked against manual delivery and retries with the same reference', async () => {
    const { order } = await apiFixture(() => 10, res => { res.statusCode = 503; res.end('{}'); });
    expect(await fulfillApiOrder(order.id)).toBe('waiting');
    const admin = await makeUser({ role: 'ADMIN' });
    await expect(fulfillPreorderManually(order.id, admin.id, ['manual'])).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await getOrder(order.id)).toMatchObject({ status: 'PREORDER', supplierAttempted: true });
    await getPool().query("UPDATE orders SET updated_at = now() - interval '2 minutes' WHERE id = $1", [order.id]);
    expect(await listDuePreorders()).toContain(order.id);
  });

  it('does not refund a rejected preorder and permits manual delivery after explicit rejection', async () => {
    const { order } = await apiFixture(() => 10, res => { res.statusCode = 400; res.end(JSON.stringify({ error: 'Out of stock' })); });
    expect(await fulfillApiOrder(order.id)).toBe('waiting');
    expect(await getOrder(order.id)).toMatchObject({ status: 'PREORDER', supplierAttempted: false });
    const admin = await makeUser({ role: 'ADMIN' });
    await fulfillPreorderManually(order.id, admin.id, ['manual']);
    expect(await getOrderSecrets(order.id)).toEqual(['manual']);
  });
});
