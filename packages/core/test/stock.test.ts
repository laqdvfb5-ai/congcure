import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupplier, getAdapterForSupplier, getProductBySlug, listProducts, updateSupplier } from '../src/index';
import { makeProduct } from './factories';

let server: http.Server;
let baseUrl: string;
let supplierId: number;
let listCalls: number;
let detailCalls: Map<string, number>;
let failCatalog: boolean;
let quantity: number;

beforeEach(async () => {
  listCalls = 0; detailCalls = new Map(); failCatalog = false; quantity = 7;
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://test');
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') return send(405, {});
    if (!['k', 'rotated'].includes(String(req.headers['x-api-key']))) return send(401, { success: false });
    if (url.pathname === '/api/seller/v1/products') {
      listCalls++;
      if (failCatalog) return send(503, { success: false });
      return send(200, { success: true, data: [
        { id: 1, name: 'Available', price: 999_999, stock: quantity },
        { id: 2, name: 'Sold out', price: 1, stock: 0 },
        { id: 3, name: 'Unknown', price: 1, stock: null },
        { id: 4, name: 'Invalid negative', price: 1, stock: -1 },
        { id: 5, name: 'Invalid fraction', price: 1, stock: 2.5 },
      ], meta: { totalPages: 1 } });
    }
    if (url.pathname.startsWith('/api/seller/v1/products/')) {
      const sku = url.pathname.split('/').pop()!;
      detailCalls.set(sku, (detailCalls.get(sku) ?? 0) + 1);
      if (sku === '6') return send(200, { success: true, data: { id: 6, name: 'Extra page', price: 1, stock: 13 } });
      if (sku === '8') return send(500, { success: false, message: 'private provider diagnostic' });
      return send(404, { success: false, error: { code: 'PRODUCT_NOT_AVAILABLE' } });
    }
    if (url.pathname === '/api/products') {
      listCalls++;
      return send(200, { products: [{ sku: 'one', name: 'Generic', price: 1, stock: 12 }] });
    }
    send(404, {});
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/seller/v1`;
  supplierId = (await createSupplier({ name: 'Inventory', baseUrl, apiKey: 'k', adapter: 'shoptaikhoan' })).id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

const apiProduct = (sku: string) => makeProduct({ type: 'API', supplierId, supplierSku: sku });
const live = () => listProducts({ includeSupplierStock: true });

describe('live supplier inventory', () => {
  it('combines local and supplier stock, coalesces concurrent refreshes and preserves retail prices', async () => {
    const local = await makeProduct({ stock: 3 });
    const available = await apiProduct('1');
    const soldOut = await apiProduct('2');
    expect((await listProducts()).find(p => p.id === available.id)?.stock).toBeNull();
    expect(listCalls).toBe(0);
    const [first, second] = await Promise.all([live(), live()]);
    expect(first).toEqual(second);
    expect(first.find(p => p.id === local.id)?.stock).toBe(3);
    expect(first.find(p => p.id === available.id)).toMatchObject({ stock: 7, priceMember: 10_000 });
    expect(first.find(p => p.id === soldOut.id)?.stock).toBe(0);
    expect((await getProductBySlug(available.slug, { includeSupplierStock: true }))?.stock).toBe(7);
    expect(listCalls).toBe(1);
  });

  it('looks up missing SKUs once and keeps unknown/unavailable/invalid inventory distinct from zero', async () => {
    for (const sku of ['3', '4', '5', '6', '6', '7', '8']) await apiProduct(sku);
    const result = await live();
    expect(result.filter(p => p.supplierSku === '6').map(p => p.stock)).toEqual([13, 13]);
    for (const p of result.filter(p => p.supplierSku !== '6')) expect(p.stock).toBeNull();
    expect(detailCalls.get('6')).toBe(1);
    await live();
    expect(detailCalls.get('7')).toBe(1);
    expect(detailCalls.get('8')).toBe(1);
    expect(listCalls).toBe(1);
  });

  it('recovers after a failed catalog request without reporting false zero stock', async () => {
    await apiProduct('1');
    failCatalog = true;
    expect((await live())[0]?.stock).toBeNull();
    expect((await live())[0]?.stock).toBeNull();
    expect(listCalls).toBe(1);
    failCatalog = false; quantity = 19;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6000);
    expect((await live())[0]?.stock).toBe(19);
    expect(listCalls).toBe(2);
  });

  it('expires stock after 30 seconds and refreshes immediately after credential changes', async () => {
    await apiProduct('1');
    expect((await live())[0]?.stock).toBe(7);
    quantity = 22;
    expect((await live())[0]?.stock).toBe(7);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    expect((await live())[0]?.stock).toBe(22);
    quantity = 5;
    await updateSupplier(supplierId, { name: 'Inventory', baseUrl, apiKey: 'rotated', active: true });
    expect((await live())[0]?.stock).toBe(5);
    expect(listCalls).toBe(3);
    await updateSupplier(supplierId, { name: 'Inventory', baseUrl, active: false });
    expect((await live())[0]?.stock).toBeNull();
    expect(listCalls).toBe(3);
  });

  it('supports generic catalogs without guessing counts for missing products', async () => {
    const supplier = await createSupplier({ name: 'Generic', baseUrl: new URL(baseUrl).origin, apiKey: 'k' });
    const available = await makeProduct({ type: 'API', supplierId: supplier.id, supplierSku: 'one' });
    const unknown = await makeProduct({ type: 'API', supplierId: supplier.id, supplierSku: 'missing' });
    const result = await live();
    expect(result.find(p => p.id === available.id)?.stock).toBe(12);
    expect(result.find(p => p.id === unknown.id)?.stock).toBeNull();
    expect(listCalls).toBe(1);
  });

  it('honors the inventory request abort signal', async () => {
    const adapter = await getAdapterForSupplier(supplierId);
    await expect(adapter.listProducts({ signal: AbortSignal.abort() })).rejects.toMatchObject({ transient: true });
    expect(listCalls).toBe(0);
  });
});
