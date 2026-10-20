import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@web12/db';
import { createMockSupplierServer } from '@web12/mock-supplier';
import {
  createGenericRestAdapter, createSupplier, decryptSecret, getAdapterForSupplier, listSuppliers,
  SupplierError, updateSupplier,
} from '../src/index';

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  server = createMockSupplierServer({ apiKey: 'k' });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('generic-rest adapter', () => {
  it('places idempotent orders', async () => {
    const a = createGenericRestAdapter({ baseUrl, apiKey: 'k' });
    const r1 = await a.placeOrder({ ref: 'o1', sku: 'netflix-1m', quantity: 2 });
    const r2 = await a.placeOrder({ ref: 'o1', sku: 'netflix-1m', quantity: 2 });
    expect(r1.status).toBe('completed');
    expect(r2).toEqual(r1);
    if (r1.status === 'completed') expect(r1.secrets).toHaveLength(2);
    expect((await a.listProducts()).map((p) => p.sku)).toContain('netflix-1m');
  });

  it('classifies errors as transient or permanent', async () => {
    const a = createGenericRestAdapter({ baseUrl, apiKey: 'k' });
    await expect(a.placeOrder({ ref: 'f1', sku: 'fail-always', quantity: 1 }))
      .rejects.toMatchObject({ transient: false, message: 'Hết hàng' });
    await expect(a.placeOrder({ ref: 'x1', sku: 'flaky', quantity: 1 })).rejects.toMatchObject({ transient: true });
    await expect(a.placeOrder({ ref: 'x1', sku: 'flaky', quantity: 1 })).rejects.toMatchObject({ transient: true });
    expect((await a.placeOrder({ ref: 'x1', sku: 'flaky', quantity: 1 })).status).toBe('completed');
    expect((await a.placeOrder({ ref: 's1', sku: 'slow', quantity: 1 })).status).toBe('processing');

    const badKey = createGenericRestAdapter({ baseUrl, apiKey: 'wrong' });
    await expect(badKey.placeOrder({ ref: 'b1', sku: 'netflix-1m', quantity: 1 })).rejects.toMatchObject({ transient: false });

    const down = createGenericRestAdapter({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', timeoutMs: 2000 });
    const err = await down.placeOrder({ ref: 'd1', sku: 'netflix-1m', quantity: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(SupplierError);
    expect(err.transient).toBe(true);
  });
});

describe('supplier records', () => {
  it('stores the API key encrypted and builds adapters', async () => {
    const s = await createSupplier({ name: 'Mock', baseUrl: `${baseUrl}/`, apiKey: 'k' });
    expect(s.baseUrl).toBe(baseUrl);
    const raw = await getPool().query<{ api_key_enc: string }>('SELECT api_key_enc FROM suppliers');
    expect(raw.rows[0]?.api_key_enc).not.toBe('k');
    expect(decryptSecret(raw.rows[0]!.api_key_enc)).toBe('k');

    const adapter = await getAdapterForSupplier(s.id);
    expect((await adapter.placeOrder({ ref: 'r9', sku: 'spotify-1m', quantity: 1 })).status).toBe('completed');

    await updateSupplier(s.id, { name: 'Mock 2', baseUrl, active: false });
    expect((await listSuppliers())[0]).toMatchObject({ name: 'Mock 2', active: false });
    await expect(getAdapterForSupplier(s.id)).rejects.toMatchObject({ transient: false });
    expect(decryptSecret((await getPool().query<{ api_key_enc: string }>('SELECT api_key_enc FROM suppliers')).rows[0]!.api_key_enc)).toBe('k');
  });

  it('validates input', async () => {
    await expect(createSupplier({ name: '', baseUrl, apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createSupplier({ name: 'A', baseUrl: 'ftp://x', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createSupplier({ name: 'A', baseUrl, apiKey: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createSupplier({ name: 'A', baseUrl, apiKey: 'k', adapter: 'nope' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
