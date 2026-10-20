# web12 Phase 1 — Part 3: Supplier adapter, mock supplier, queue, worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API-type orders get fulfilled by a background worker that calls the upstream supplier through an adapter, retries transient failures and refunds permanent ones exactly once.

**Architecture:** `packages/core/src/suppliers/` defines the adapter interface plus a `generic-rest` implementation. `apps/mock-supplier` is a tiny `node:http` server with deterministic failure SKUs. It is also exported as a library so core tests can start it on a random port. `core/src/fulfill.ts` holds the fulfilment decision logic. `core/src/queue.ts` wraps pg-boss. `apps/worker` wires the two together and runs a stale-order sweeper.

**Tech Stack:** as Part 1, plus pg-boss 12.38.x (`import { PgBoss } from 'pg-boss'`; handlers receive an array of jobs).

Prerequisite: Parts 1–2 done. Part 1 **Global Constraints** apply.

---

### Task 7: Supplier adapter, supplier records, mock supplier

**Files:**
- Create: `apps/mock-supplier/package.json`, `apps/mock-supplier/tsconfig.json`, `apps/mock-supplier/src/server.ts`, `apps/mock-supplier/src/main.ts`
- Create: `packages/core/src/suppliers/types.ts`, `packages/core/src/suppliers/generic-rest.ts`, `packages/core/src/suppliers/index.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json` (add devDependency `@web12/mock-supplier`)
- Modify: root `package.json` (add script `mock:supplier`)
- Test: `packages/core/test/suppliers.test.ts`

**Interfaces:**
- Consumes: `getPool`; `encryptSecret`, `decryptSecret`; `AppError`.
- Produces:
  - `@web12/mock-supplier`: `createMockSupplierServer(opts: { apiKey: string }): http.Server`. HTTP contract:
    - `GET /api/products` → `200 { products: [{ sku, name, price, stock }] }`
    - `POST /api/orders` with body `{ ref, sku, quantity }` and header `X-API-Key`:
      - The call is idempotent by `ref`: repeating a ref returns the same order.
      - `200 { id, ref, status: 'completed', accounts: string[] }` on success, or `200 { id, ref, status: 'processing' }` while still in progress.
      - Error statuses: `401` bad key, `404` unknown sku, `400 { error }` for SKU `fail-always`.
      - SKU `flaky` returns `503` for the first 2 calls per ref. SKU `slow` returns `processing` on the first call per ref.
      - Normal SKUs: `netflix-1m`, `spotify-1m`.
  - `suppliers/types.ts`:
    - `interface SupplierOrderInput { ref: string; sku: string; quantity: number }`
    - `type SupplierOrderResult = { status: 'completed'; supplierRef: string; secrets: string[] } | { status: 'processing'; supplierRef: string }`
    - `interface SupplierProduct { sku: string; name: string; price: number; stock: number | null }`
    - `interface SupplierAdapter { placeOrder(i: SupplierOrderInput): Promise<SupplierOrderResult>; listProducts(): Promise<SupplierProduct[]> }`
    - `class SupplierError extends Error { transient: boolean }`
  - `suppliers/generic-rest.ts`: `createGenericRestAdapter(cfg: { baseUrl: string; apiKey: string; timeoutMs?: number }): SupplierAdapter`
  - `suppliers/index.ts`:
    - `interface Supplier { id: number; name: string; adapter: string; baseUrl: string; active: boolean; createdAt: Date }`
    - `SUPPLIER_ADAPTERS: string[]` (= `['generic-rest']`)
    - `createSupplier({ name, baseUrl, apiKey, adapter? }): Promise<Supplier>`, `updateSupplier(id, { name, baseUrl, apiKey?, active }): Promise<Supplier>` (an empty or missing `apiKey` keeps the old key)
    - `listSuppliers(): Promise<Supplier[]>`, `getSupplier(id): Promise<Supplier | null>`
    - `getAdapterForSupplier(id: number): Promise<SupplierAdapter>`. Throws `SupplierError(transient=false)` if the supplier is missing or inactive.
    - Re-exports everything from `types.ts` and `generic-rest.ts`.

- [ ] **Step 1: Mock supplier package**

`apps/mock-supplier/package.json`:
```json
{
  "name": "@web12/mock-supplier",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/server.ts" },
  "scripts": {
    "start": "tsx src/main.ts",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@web12/db": "*" }
}
```

`apps/mock-supplier/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`apps/mock-supplier/src/server.ts`:
```ts
import { randomUUID } from 'node:crypto';
import http from 'node:http';

interface MockOrder {
  id: string;
  ref: string;
  sku: string;
  quantity: number;
  calls: number;
  accounts: string[];
}

const PRODUCTS = [
  { sku: 'netflix-1m', name: 'Netflix Premium 1 tháng', price: 45_000, stock: null },
  { sku: 'spotify-1m', name: 'Spotify Premium 1 tháng', price: 25_000, stock: null },
  { sku: 'flaky', name: 'Flaky (503 twice)', price: 1_000, stock: null },
  { sku: 'slow', name: 'Slow (processing once)', price: 1_000, stock: null },
  { sku: 'fail-always', name: 'Always fails (400)', price: 1_000, stock: null },
];

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

export function createMockSupplierServer(opts: { apiKey: string }): http.Server {
  const orders = new Map<string, MockOrder>();
  // 'flaky' failures are counted per ref, before an order record exists.
  const flakyCalls = new Map<string, number>();

  return http.createServer(async (req, res) => {
    if (req.headers['x-api-key'] !== opts.apiKey) return send(res, 401, { error: 'Invalid API key' });

    if (req.method === 'GET' && req.url === '/api/products') return send(res, 200, { products: PRODUCTS });

    if (req.method === 'POST' && req.url === '/api/orders') {
      const body = await readJson(req);
      const ref = String(body.ref ?? '');
      const sku = String(body.sku ?? '');
      const quantity = Number(body.quantity);
      if (!ref || !Number.isInteger(quantity) || quantity < 1) return send(res, 400, { error: 'Bad request' });
      if (!PRODUCTS.some((p) => p.sku === sku)) return send(res, 404, { error: 'Unknown sku' });
      if (sku === 'fail-always') return send(res, 400, { error: 'Hết hàng' });

      if (sku === 'flaky') {
        const n = (flakyCalls.get(ref) ?? 0) + 1;
        flakyCalls.set(ref, n);
        if (n <= 2) return send(res, 503, { error: 'Temporarily unavailable' });
      }

      let order = orders.get(ref);
      if (!order) {
        order = {
          id: randomUUID(), ref, sku, quantity, calls: 0,
          accounts: Array.from({ length: quantity }, (_, i) => `${sku}-${ref}-${i + 1}@mock.local|pw${i + 1}`),
        };
        orders.set(ref, order);
      }
      order.calls++;
      if (sku === 'slow' && order.calls === 1) return send(res, 200, { id: order.id, ref, status: 'processing' });
      return send(res, 200, { id: order.id, ref, status: 'completed', accounts: order.accounts });
    }

    send(res, 404, { error: 'Not found' });
  });
}
```

`apps/mock-supplier/src/main.ts`:
```ts
import { loadEnv } from '@web12/db';
import { createMockSupplierServer } from './server';

loadEnv();
const port = Number(process.env.MOCK_SUPPLIER_PORT ?? 4100);
const apiKey = process.env.MOCK_SUPPLIER_KEY ?? 'mock-key';
createMockSupplierServer({ apiKey }).listen(port, () => {
  console.log(`Mock supplier on http://localhost:${port} (X-API-Key: ${apiKey})`);
});
```

Root `package.json` scripts: add `"mock:supplier": "npm run start -w @web12/mock-supplier"`.
`packages/core/package.json` devDependencies: add `"@web12/mock-supplier": "*"`. Then run `npm install`.

- [ ] **Step 2: Write the failing test**

`packages/core/test/suppliers.test.ts`:
```ts
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- suppliers`
Expected: FAIL, `createGenericRestAdapter` not exported.

- [ ] **Step 4: Implement `packages/core/src/suppliers/types.ts`**

```ts
export interface SupplierOrderInput {
  ref: string;
  sku: string;
  quantity: number;
}

export type SupplierOrderResult =
  | { status: 'completed'; supplierRef: string; secrets: string[] }
  | { status: 'processing'; supplierRef: string };

export interface SupplierProduct {
  sku: string;
  name: string;
  price: number;
  stock: number | null;
}

export interface SupplierAdapter {
  placeOrder(input: SupplierOrderInput): Promise<SupplierOrderResult>;
  listProducts(): Promise<SupplierProduct[]>;
}

/** transient = worth retrying (network, timeout, 5xx, 429). */
export class SupplierError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean) {
    super(message);
    this.name = 'SupplierError';
    this.transient = transient;
  }
}
```

- [ ] **Step 5: Implement `packages/core/src/suppliers/generic-rest.ts`**

```ts
import { SupplierError, type SupplierAdapter, type SupplierOrderResult, type SupplierProduct } from './types';

export function createGenericRestAdapter(cfg: { baseUrl: string; apiKey: string; timeoutMs?: number }): SupplierAdapter {
  const base = cfg.baseUrl.replace(/\/+$/, '');

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
      });
    } catch (err) {
      throw new SupplierError(`Không kết nối được nhà cung cấp: ${(err as Error).message}`, true);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
      throw new SupplierError(message, res.status >= 500 || res.status === 429);
    }
    return body as T;
  }

  return {
    async placeOrder(input) {
      const body = await call<{ id?: string; status?: string; accounts?: unknown }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const supplierRef = String(body.id ?? '');
      if (body.status === 'processing') return { status: 'processing', supplierRef };
      if (body.status === 'completed' && Array.isArray(body.accounts)) {
        return { status: 'completed', supplierRef, secrets: body.accounts.map(String) } satisfies SupplierOrderResult;
      }
      throw new SupplierError('Phản hồi không hợp lệ từ nhà cung cấp', true);
    },

    async listProducts() {
      const body = await call<{ products?: SupplierProduct[] }>('/api/products');
      return body.products ?? [];
    },
  };
}
```

- [ ] **Step 6: Implement `packages/core/src/suppliers/index.ts`**

```ts
import { getPool } from '@web12/db';
import { decryptSecret, encryptSecret } from '../crypto';
import { AppError } from '../errors';
import { createGenericRestAdapter } from './generic-rest';
import { SupplierError, type SupplierAdapter } from './types';

export * from './types';
export * from './generic-rest';

export interface Supplier {
  id: number;
  name: string;
  adapter: string;
  baseUrl: string;
  active: boolean;
  createdAt: Date;
}

export const SUPPLIER_ADAPTERS = ['generic-rest'];

const COLS = `id, name, adapter, base_url AS "baseUrl", active, created_at AS "createdAt"`;

function validate(input: { name: string; baseUrl: string; adapter?: string }) {
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const adapter = input.adapter ?? 'generic-rest';
  if (!name) throw new AppError('INVALID_INPUT', 'Vui lòng nhập tên nhà cung cấp');
  if (!/^https?:\/\/.+/.test(baseUrl)) throw new AppError('INVALID_INPUT', 'URL phải bắt đầu bằng http:// hoặc https://');
  if (!SUPPLIER_ADAPTERS.includes(adapter)) throw new AppError('INVALID_INPUT', 'Adapter không hợp lệ');
  return { name, baseUrl, adapter };
}

export async function createSupplier(input: { name: string; baseUrl: string; apiKey: string; adapter?: string }): Promise<Supplier> {
  const v = validate(input);
  if (!input.apiKey.trim()) throw new AppError('INVALID_INPUT', 'Vui lòng nhập API key');
  const r = await getPool().query<Supplier>(
    `INSERT INTO suppliers (name, adapter, base_url, api_key_enc) VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
    [v.name, v.adapter, v.baseUrl, encryptSecret(input.apiKey.trim())],
  );
  return r.rows[0]!;
}

export async function updateSupplier(
  id: number, input: { name: string; baseUrl: string; apiKey?: string; active: boolean },
): Promise<Supplier> {
  const v = validate(input);
  const key = input.apiKey?.trim();
  const r = await getPool().query<Supplier>(
    `UPDATE suppliers SET name = $2, base_url = $3, active = $4, api_key_enc = COALESCE($5, api_key_enc)
     WHERE id = $1 RETURNING ${COLS}`,
    [id, v.name, v.baseUrl, input.active, key ? encryptSecret(key) : null],
  );
  if (!r.rows[0]) throw new AppError('NOT_FOUND', 'Không tìm thấy nhà cung cấp');
  return r.rows[0];
}

export async function listSuppliers(): Promise<Supplier[]> {
  return (await getPool().query<Supplier>(`SELECT ${COLS} FROM suppliers ORDER BY id`)).rows;
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  return (await getPool().query<Supplier>(`SELECT ${COLS} FROM suppliers WHERE id = $1`, [id])).rows[0] ?? null;
}

export async function getAdapterForSupplier(id: number): Promise<SupplierAdapter> {
  const r = await getPool().query<{ baseUrl: string; apiKeyEnc: string; adapter: string; active: boolean }>(
    'SELECT base_url AS "baseUrl", api_key_enc AS "apiKeyEnc", adapter, active FROM suppliers WHERE id = $1',
    [id],
  );
  const s = r.rows[0];
  if (!s || !s.active) throw new SupplierError('Nhà cung cấp không hoạt động', false);
  switch (s.adapter) {
    case 'generic-rest':
      return createGenericRestAdapter({ baseUrl: s.baseUrl, apiKey: decryptSecret(s.apiKeyEnc) });
    default:
      throw new SupplierError(`Adapter không hỗ trợ: ${s.adapter}`, false);
  }
}
```

Add to `packages/core/src/index.ts`: `export * from './suppliers/index';`

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 8: Typecheck + commit**

Run: `npm run typecheck -w @web12/core && npm run typecheck -w @web12/mock-supplier` → no errors.

```bash
git add -A
git commit -m "feat: supplier adapter interface, generic-rest adapter, mock supplier server"
```


---

### Task 8: Fulfilment logic, pg-boss queue, worker process

**Files:**
- Create: `packages/core/src/fulfill.ts`, `packages/core/src/queue.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json` (add dependency `pg-boss`), `packages/core/test/global-setup.ts`
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/main.ts`
- Modify: root `package.json` (add script `worker`)
- Test: `packages/core/test/fulfill.test.ts`, `packages/core/test/queue.test.ts`

**Interfaces:**
- Consumes: `getOrder`, `getProduct`, `incrementAttempts`, `completeApiOrder`, `refundOrder`, `listStalePendingOrders`, `setFulfillEnqueuer` (Part 2); `getAdapterForSupplier`, `SupplierError` (Task 7).
- Produces:
  - `fulfill.ts`:
    - `MAX_FULFILL_ATTEMPTS = 5`
    - `type FulfillOutcome = 'completed' | 'refunded' | 'skipped'`
    - `fulfillApiOrder(orderId: number): Promise<FulfillOutcome>`. Throws on a transient failure while attempts remain, so the queue retries it. When attempts run out, it refunds instead of throwing.
  - `queue.ts`:
    - `FULFILL_QUEUE = 'fulfill-api-order'`
    - `getBoss(opts?: { supervise?: boolean }): Promise<PgBoss>`. Process-wide singleton (cached on `globalThis`); starts pg-boss and creates the queue.
    - `stopBoss(): Promise<void>`
    - `usePgBossEnqueuer(): void`. Calls `setFulfillEnqueuer` with a function that `boss.send`s `{ orderId }`.
    - `interface FulfillJobData { orderId: number }`

Retry policy: pg-boss retries failed jobs (`retryLimit: 10`, `retryDelay: 5`, `retryBackoff: true`, `retryDelayMax: 120`). Our own `orders.attempts` counter is the real limit: once `attempts >= MAX_FULFILL_ATTEMPTS`, a transient failure refunds instead of throwing. The worker sweeper re-enqueues PENDING orders untouched for 10 minutes, which covers lost enqueues and crashes. Duplicate jobs are harmless: fulfilment checks `status = 'PENDING'`, and the supplier call is idempotent by `ref = "web12-<orderId>"`.

- [ ] **Step 1: Write the failing fulfilment test**

`packages/core/test/fulfill.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- fulfill`
Expected: FAIL, `fulfillApiOrder` not exported.

- [ ] **Step 3: Implement `packages/core/src/fulfill.ts`**

```ts
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
```

Add to `packages/core/src/index.ts`: `export * from './fulfill';`

- [ ] **Step 4: Run fulfilment tests to verify they pass**

Run: `npm test -- fulfill`
Expected: PASS, 6 tests. Note: the 'refunds after the attempt limit' test hits a closed port 5 times, so it takes a couple of seconds.

- [ ] **Step 5: Write the failing queue test**

First make `packages/core/test/global-setup.ts` also reset pg-boss state, so job ids from earlier runs never collide with restarted order ids. Change its DROP line to:
```ts
  await pool.query('DROP SCHEMA IF EXISTS pgboss CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
```

`packages/core/test/queue.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '@web12/db';
import {
  FULFILL_QUEUE, getBoss, purchase, setFulfillEnqueuer, stopBoss, usePgBossEnqueuer,
  type FulfillJobData,
} from '../src/index';
import { makeProduct, makeUser } from './factories';

afterAll(async () => {
  setFulfillEnqueuer(null);
  await stopBoss();
});

describe('pg-boss enqueuer', () => {
  it('enqueues a job for API purchases', async () => {
    usePgBossEnqueuer();
    const s = await getPool().query<{ id: number }>(
      `INSERT INTO suppliers (name, base_url, api_key_enc) VALUES ('m', 'http://x', 'x') RETURNING id`,
    );
    const p = await makeProduct({ type: 'API', supplierId: s.rows[0]!.id, supplierSku: 'netflix-1m' });
    const u = await makeUser({ balance: 100_000 });
    const o = await purchase(u.id, p.id, 1);

    const boss = await getBoss();
    const jobs = await boss.fetch<FulfillJobData>(FULFILL_QUEUE, { batchSize: 10 });
    expect(jobs.map((j) => j.data.orderId)).toContain(o.id);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- queue`
Expected: FAIL, `usePgBossEnqueuer` not exported.

- [ ] **Step 7: Implement `packages/core/src/queue.ts`**

Add the dependency in `packages/core/package.json`: `"pg-boss": "^12.38.0"` under `dependencies`, then run `npm install`.

```ts
import { PgBoss } from 'pg-boss';
import { setFulfillEnqueuer } from './fulfill-queue';

export const FULFILL_QUEUE = 'fulfill-api-order';

export interface FulfillJobData {
  orderId: number;
}

const g = globalThis as typeof globalThis & { __web12Boss?: Promise<PgBoss> };

/** Process-wide pg-boss instance. Only the worker should pass supervise: true (runs maintenance). */
export function getBoss(opts: { supervise?: boolean } = {}): Promise<PgBoss> {
  g.__web12Boss ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    const boss = new PgBoss({ connectionString, supervise: opts.supervise ?? false, schedule: false });
    boss.on('error', (err) => console.error('pg-boss error', err));
    await boss.start();
    await boss.createQueue(FULFILL_QUEUE, {
      retryLimit: 10, retryDelay: 5, retryBackoff: true, retryDelayMax: 120,
    }).catch(() => {}); // already exists
    return boss;
  })().catch((err) => {
    g.__web12Boss = undefined;
    throw err;
  });
  return g.__web12Boss;
}

export async function stopBoss(): Promise<void> {
  const p = g.__web12Boss;
  g.__web12Boss = undefined;
  if (p) await (await p).stop({ graceful: true });
}

export function usePgBossEnqueuer(): void {
  setFulfillEnqueuer(async (orderId) => {
    const boss = await getBoss();
    await boss.send(FULFILL_QUEUE, { orderId } satisfies FulfillJobData);
  });
}
```

If TypeScript rejects `stop({ graceful: true })` or a `createQueue` option, check `node_modules/pg-boss/dist/types.d.ts` (`StopOptions`, `QueueOptions`) and adjust only that call.

Add to `packages/core/src/index.ts`: `export * from './queue';`

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 9: Worker app**

`apps/worker/package.json`:
```json
{
  "name": "@web12/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@web12/core": "*", "@web12/db": "*" }
}
```

`apps/worker/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`apps/worker/src/main.ts`:
```ts
import { closePool, loadEnv } from '@web12/db';
import {
  FULFILL_QUEUE, fulfillApiOrder, getBoss, listStalePendingOrders, stopBoss, type FulfillJobData,
} from '@web12/core';

loadEnv();

const SWEEP_EVERY_MS = 60_000;
const STALE_AFTER_SECONDS = 600;

const boss = await getBoss({ supervise: true });

await boss.work<FulfillJobData>(FULFILL_QUEUE, async ([job]) => {
  if (!job) return;
  const outcome = await fulfillApiOrder(job.data.orderId);
  console.log(`order ${job.data.orderId}: ${outcome}`);
});

async function sweep() {
  try {
    const ids = await listStalePendingOrders(STALE_AFTER_SECONDS);
    for (const orderId of ids) await boss.send(FULFILL_QUEUE, { orderId } satisfies FulfillJobData);
    if (ids.length) console.log(`sweeper re-enqueued ${ids.length} order(s)`);
  } catch (err) {
    console.error('sweeper failed', err);
  }
}
const timer = setInterval(sweep, SWEEP_EVERY_MS);
await sweep();

console.log('Worker started');

async function shutdown() {
  clearInterval(timer);
  await stopBoss();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

Root `package.json` scripts: add `"worker": "npm run start -w @web12/worker"`. Run `npm install`.

- [ ] **Step 10: Manual check of the worker**

With `npm run db:start` running in one terminal:
```bash
npm run db:migrate
npm run mock:supplier     # terminal 2
npm run worker            # terminal 3
```
Expected: the worker prints `Worker started` and no errors. The end-to-end run (purchase → `order N: completed`) is verified in Part 4 after seeding.

- [ ] **Step 11: Typecheck + commit**

Run: `npm run typecheck` → no errors in any workspace.

```bash
git add -A
git commit -m "feat: API order fulfilment with retries/refund, pg-boss queue, worker with sweeper"
```
