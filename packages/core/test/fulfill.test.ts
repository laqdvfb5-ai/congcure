import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockSupplierServer } from '@web12/mock-supplier';
import {
  createSupplier, fulfillApiOrder, getOrder, getOrderSecrets, getUser, MAX_FULFILL_ATTEMPTS,
  purchase, SupplierError, updateSupplier,
} from '../src/index';
import { makeProduct, makeUser } from './factories';

let server: http.Server;
let baseUrl = '';

// Fresh server per test: order ids restart after TRUNCATE, so refs like web12-1 repeat.
beforeEach(async () => {
  server = createMockSupplierServer({ apiKey: 'k' });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

async function buy(sku: string, qty = 1) {
  const supplier = await createSupplier({ name: 'Mock', baseUrl, apiKey: 'k' });
  const p = await makeProduct({ type: 'API', price: 5_000, supplierId: supplier.id, supplierSku: sku });
  const u = await makeUser({ balance: 50_000 });
  const o = await purchase(u.id, p.id, qty);
  return { o, u, supplier };
}

describe('fulfillApiOrder', () => {
  it('completes and stores supplier accounts', async () => {
    const { o } = await buy('netflix-1m', 2);
    expect(await fulfillApiOrder(o.id)).toBe('completed');
    const done = await getOrder(o.id);
    expect(done?.status).toBe('COMPLETED');
    expect(done?.supplierRef).toBeTruthy();
    expect(await getOrderSecrets(o.id)).toEqual([
      `netflix-1m-web12-${o.id}-1@mock.local|pw1`,
      `netflix-1m-web12-${o.id}-2@mock.local|pw2`,
    ]);
    expect(await fulfillApiOrder(o.id)).toBe('skipped');
  });

  it('refunds permanent failures once', async () => {
    const { o, u } = await buy('fail-always');
    expect(await fulfillApiOrder(o.id)).toBe('refunded');
    expect((await getOrder(o.id))).toMatchObject({ status: 'REFUNDED', error: 'Hết hàng' });
    expect((await getUser(u.id))?.balance).toBe(50_000);
    expect(await fulfillApiOrder(o.id)).toBe('skipped');
    expect((await getUser(u.id))?.balance).toBe(50_000);
  });

  it('throws transient failures for retry, then succeeds', async () => {
    const { o } = await buy('flaky');
    await expect(fulfillApiOrder(o.id)).rejects.toBeInstanceOf(SupplierError);
    await expect(fulfillApiOrder(o.id)).rejects.toBeInstanceOf(SupplierError);
    expect(await fulfillApiOrder(o.id)).toBe('completed');
    expect((await getOrder(o.id))?.attempts).toBe(3);
  });

  it('treats "processing" as transient', async () => {
    const { o } = await buy('slow');
    await expect(fulfillApiOrder(o.id)).rejects.toMatchObject({ transient: true });
    expect(await fulfillApiOrder(o.id)).toBe('completed');
  });

  it('refunds after the attempt limit', async () => {
    const { o, u, supplier } = await buy('netflix-1m');
    await updateSupplier(supplier.id, { name: 'Mock', baseUrl: 'http://127.0.0.1:1', active: true });
    for (let i = 1; i < MAX_FULFILL_ATTEMPTS; i++) {
      await expect(fulfillApiOrder(o.id)).rejects.toMatchObject({ transient: true });
    }
    expect(await fulfillApiOrder(o.id)).toBe('refunded');
    expect((await getUser(u.id))?.balance).toBe(50_000);
  });

  it('refunds when the supplier is disabled', async () => {
    const { o, supplier } = await buy('netflix-1m');
    await updateSupplier(supplier.id, { name: 'Mock', baseUrl, active: false });
    expect(await fulfillApiOrder(o.id)).toBe('refunded');
  });
});
