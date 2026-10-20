import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShoptaikhoanAdapter, SupplierError } from '../src/index';

// Fake of https://api.shoptaikhoan.store/api/seller/v1, shaped like the real docs.
const PRODUCTS = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1, slug: `p${i + 1}`, name: `Product ${i + 1}`, price: 1000 * (i + 1), currency: 'VND', stock: 10, quantityPriceTiers: [],
}));
const ERRORS: Record<number, [number, string]> = {
  2: [409, 'INSUFFICIENT_STOCK'],
  3: [402, 'INSUFFICIENT_BALANCE'],
  4: [429, 'RATE_LIMITED'],
  6: [500, 'INTERNAL_ERROR'],
  9: [404, 'PRODUCT_NOT_AVAILABLE'],
};
const seenKeys = new Map<string, { calls: number; body: unknown }>();
let lastIdempotencyKey: string | undefined;

function order(code: string, productId: number, quantity: number, delivered: boolean) {
  const accounts = Array.from({ length: quantity }, (_, i) => `u${productId}-${i + 1}|pw${i + 1}`);
  return {
    orderCode: code,
    payment: { status: 'paid' },
    delivery: { status: delivered ? 'success' : 'processing', result: { accounts: delivered ? accounts : [] } },
    _accounts: accounts,
  };
}

function fail(res: http.ServerResponse, status: number, code: string) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: `msg ${code}`, error: { code } }));
}

const server = http.createServer(async (req, res) => {
  if (req.headers['x-api-key'] !== 'k') return fail(res, 401, 'UNAUTHORIZED');
  const url = new URL(req.url!, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/seller/v1/products') {
    const limit = Number(url.searchParams.get('limit'));
    const page = Number(url.searchParams.get('page'));
    const q = url.searchParams.get('q') ?? '';
    const list = PRODUCTS.filter((p) => p.name.includes(q));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      data: list.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: list.length, totalPages: Math.ceil(list.length / limit) },
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/seller/v1/orders') {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw) as { productId: number; quantity: number };
    const key = req.headers['idempotency-key'] as string | undefined;
    lastIdempotencyKey = key;
    const err = ERRORS[body.productId];
    if (err) return fail(res, err[0], err[1]);
    const prev = key ? seenKeys.get(key) : undefined;
    const calls = (prev?.calls ?? 0) + 1;
    if (key) seenKeys.set(key, { calls, body });
    // product 5: still processing on the first call
    const delivered = body.productId !== 5 || calls > 1;
    const o = order(`ORD-${key}`, body.productId, body.quantity, delivered);
    const data: Record<string, unknown> = { order: o };
    // product 8: accounts only under order.delivery.result.accounts (as objects)
    if (body.productId === 8) {
      o.delivery.result.accounts = [{ user: 'obj-user', password: 'obj-pass' }] as never;
    } else {
      data.products = delivered ? o._accounts : [];
    }
    res.writeHead(prev ? 200 : 201, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ success: true, data }));
  }
  fail(res, 404, 'NOT_FOUND');
});

let baseUrl = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/seller/v1`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const adapter = () => createShoptaikhoanAdapter({ baseUrl, apiKey: 'k' });

describe('shoptaikhoan adapter', () => {
  it('buys with the ref as Idempotency-Key and returns delivered accounts', async () => {
    const r = await adapter().placeOrder({ ref: 'web12-1-1700000000000', sku: '1', quantity: 2 });
    expect(r).toEqual({ status: 'completed', supplierRef: 'ORD-web12-1-1700000000000', secrets: ['u1-1|pw1', 'u1-2|pw2'] });
    expect(lastIdempotencyKey).toBe('web12-1-1700000000000');
    const replay = await adapter().placeOrder({ ref: 'web12-1-1700000000000', sku: '1', quantity: 2 });
    expect(replay).toEqual(r);
  });

  it('reports processing, then completes on retry with the same key', async () => {
    const a = adapter();
    expect((await a.placeOrder({ ref: 'r5', sku: '5', quantity: 1 })).status).toBe('processing');
    expect(await a.placeOrder({ ref: 'r5', sku: '5', quantity: 1 })).toMatchObject({ status: 'completed', secrets: ['u5-1|pw1'] });
  });

  it('falls back to order.delivery.result.accounts and flattens objects', async () => {
    expect(await adapter().placeOrder({ ref: 'r8', sku: '8', quantity: 1 }))
      .toMatchObject({ status: 'completed', secrets: ['obj-user|obj-pass'] });
  });

  it('classifies errors', async () => {
    const err = (sku: string, a = adapter()) => a.placeOrder({ ref: `e${sku}`, sku, quantity: 1 }).catch((e) => e as SupplierError);
    expect(await err('2')).toMatchObject({ transient: false, message: 'msg INSUFFICIENT_STOCK' });
    expect(await err('3')).toMatchObject({ transient: false, message: 'Nguồn hết số dư hoặc ví nguồn bị khóa' });
    expect(await err('9')).toMatchObject({ transient: false });
    expect(await err('4')).toMatchObject({ transient: true });
    expect(await err('6')).toMatchObject({ transient: true });
    expect(await err('1', createShoptaikhoanAdapter({ baseUrl, apiKey: 'bad' })))
      .toMatchObject({ transient: false, message: 'API key nguồn không hợp lệ' });
    const down = createShoptaikhoanAdapter({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', timeoutMs: 2000 });
    expect(await err('1', down)).toMatchObject({ transient: true });
  });

  it('rejects bad sku and quantity above 50 without calling the source', async () => {
    lastIdempotencyKey = undefined;
    await expect(adapter().placeOrder({ ref: 'q', sku: '1', quantity: 51 })).rejects.toMatchObject({ transient: false });
    await expect(adapter().placeOrder({ ref: 'q', sku: 'abc', quantity: 1 })).rejects.toMatchObject({ transient: false });
    expect(lastIdempotencyKey).toBeUndefined();
  });

  it('lists products across pages and passes the search query', async () => {
    const all = await createShoptaikhoanAdapter({ baseUrl, apiKey: 'k', pageSize: 2 }).listProducts();
    expect(all.map((p) => p.sku)).toEqual(['1', '2', '3', '4', '5']);
    expect(all[2]).toEqual({ sku: '3', name: 'Product 3', price: 3000, stock: 10 });
    expect((await adapter().listProducts({ q: 'Product 4' })).map((p) => p.sku)).toEqual(['4']);
  });
});
