# web12 Phase 1 — Part 2: Money (wallet, top-up, catalog, orders)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All money and stock logic in `packages/core`, with concurrency-safe purchase, idempotent top-up webhook, exactly-once refund.

**Architecture:** Every mutation runs in `withTx`. Balance changes go through one function (`applyBalanceChange`) that does a conditional `UPDATE` and writes the ledger row. Stock is claimed with `FOR UPDATE SKIP LOCKED`.

**Tech Stack:** as Part 1.

Prerequisite: Part 1 (`2026-10-16-phase1-part1-foundation.md`) Tasks 1–3 done. Its **Global Constraints** apply here too.

---

### Task 4: Wallet ledger + bank top-up

**Files:**
- Create: `packages/core/src/wallet.ts`, `packages/core/src/topup.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/wallet.test.ts`, `packages/core/test/topup.test.ts`

**Interfaces:**
- Consumes: `withTx`, `getPool`, `Queryable` from `@web12/db`; `AppError`; `makeUser` from `test/factories.ts`.
- Produces:
  - `wallet.ts`:
    - `type LedgerType = 'TOPUP'|'PURCHASE'|'REFUND'|'ADJUST'`
    - `interface LedgerRef { refType?: string; refId?: string | number; note?: string; createdBy?: number }`
    - `interface LedgerEntry { id: number; userId: number; amount: number; balanceAfter: number; type: LedgerType; refType: string | null; refId: string | null; note: string | null; createdBy: number | null; createdAt: Date }`
    - `applyBalanceChange(c: Queryable, userId: number, amount: number, type: LedgerType, ref?: LedgerRef): Promise<number>`. Must be called inside a transaction. Returns the new balance. Throws `INSUFFICIENT_BALANCE` if the result would be negative, or `NOT_FOUND` if the user does not exist.
    - `adjustBalance(userId: number, amount: number, note: string, adminId: number): Promise<number>`
    - `listLedger(userId: number, limit?: number): Promise<LedgerEntry[]>`
  - `topup.ts`:
    - `interface BankWebhookPayload { id: number | string; gateway?: string; transferType: string; transferAmount: number; content: string; referenceCode?: string; transactionDate?: string }` (SePay shape)
    - `type BankTxnStatus = 'MATCHED'|'UNMATCHED'|'IGNORED'`
    - `interface BankTxn { id: number; provider: string; providerTxnId: string; amount: number; content: string; status: BankTxnStatus; userId: number | null; createdAt: Date }`
    - `parseTopupCode(content: string): string | null`
    - `handleBankWebhook(p: BankWebhookPayload, provider?: string): Promise<{ status: BankTxnStatus | 'DUPLICATE'; userId: number | null }>`
    - `assignBankTxn(txnId: number, userId: number, adminId: number): Promise<void>`
    - `listBankTxns(opts?: { status?: BankTxnStatus; limit?: number }): Promise<BankTxn[]>`

- [ ] **Step 1: Write the failing wallet test**

`packages/core/test/wallet.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { getPool, withTx } from '@web12/db';
import { adjustBalance, applyBalanceChange, getUser, listLedger } from '../src/index';
import { makeUser } from './factories';

describe('wallet', () => {
  it('credits and debits with one ledger row each', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    expect(await adjustBalance(u.id, 100_000, 'bonus', admin.id)).toBe(100_000);
    expect(await adjustBalance(u.id, -30_000, 'fix', admin.id)).toBe(70_000);

    const ledger = await listLedger(u.id);
    expect(ledger.map((e) => [e.amount, e.balanceAfter, e.type])).toEqual([
      [-30_000, 70_000, 'ADJUST'],
      [100_000, 100_000, 'ADJUST'],
    ]);
    expect(ledger[0]?.createdBy).toBe(admin.id);
  });

  it('refuses to go negative and leaves no ledger row', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    await expect(adjustBalance(u.id, -1, 'x', admin.id)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await listLedger(u.id)).toHaveLength(0);
    expect((await getUser(u.id))?.balance).toBe(0);
  });

  it('validates amount, note and user', async () => {
    const u = await makeUser();
    await expect(adjustBalance(u.id, 0, 'x', u.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(adjustBalance(u.id, 1.5, 'x', u.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(adjustBalance(u.id, 10, '  ', u.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(withTx((c) => applyBalanceChange(c, 999_999, 10, 'ADJUST'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('stays consistent under concurrent debits', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    await adjustBalance(u.id, 50_000, 'seed', admin.id);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => adjustBalance(u.id, -10_000, 'spend', admin.id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    const sum = await getPool().query<{ s: number }>(
      'SELECT COALESCE(SUM(amount), 0)::bigint AS s FROM ledger_entries WHERE user_id = $1', [u.id],
    );
    expect((await getUser(u.id))?.balance).toBe(0);
    expect(sum.rows[0]?.s).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- wallet`
Expected: FAIL, `adjustBalance` not exported.

- [ ] **Step 3: Implement `packages/core/src/wallet.ts`**

```ts
import { getPool, withTx, type Queryable } from '@web12/db';
import { AppError } from './errors';

export type LedgerType = 'TOPUP' | 'PURCHASE' | 'REFUND' | 'ADJUST';

export interface LedgerRef {
  refType?: string;
  refId?: string | number;
  note?: string;
  createdBy?: number;
}

export interface LedgerEntry {
  id: number;
  userId: number;
  amount: number;
  balanceAfter: number;
  type: LedgerType;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdBy: number | null;
  createdAt: Date;
}

/** Must run inside a transaction. The conditional UPDATE is the overdraft guard. */
export async function applyBalanceChange(
  c: Queryable, userId: number, amount: number, type: LedgerType, ref: LedgerRef = {},
): Promise<number> {
  if (!Number.isSafeInteger(amount) || amount === 0) {
    throw new AppError('INVALID_INPUT', 'Số tiền không hợp lệ');
  }
  const r = await c.query<{ balance: number }>(
    'UPDATE users SET balance = balance + $2 WHERE id = $1 AND balance + $2 >= 0 RETURNING balance',
    [userId, amount],
  );
  if (r.rowCount === 0) {
    const exists = await c.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (exists.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
    throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ');
  }
  const balanceAfter = r.rows[0]!.balance;
  await c.query(
    `INSERT INTO ledger_entries (user_id, amount, balance_after, type, ref_type, ref_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, amount, balanceAfter, type, ref.refType ?? null,
      ref.refId == null ? null : String(ref.refId), ref.note ?? null, ref.createdBy ?? null],
  );
  return balanceAfter;
}

export async function adjustBalance(userId: number, amount: number, note: string, adminId: number): Promise<number> {
  if (!note.trim()) throw new AppError('INVALID_INPUT', 'Vui lòng nhập lý do');
  return withTx((c) => applyBalanceChange(c, userId, amount, 'ADJUST', { refType: 'admin', note: note.trim(), createdBy: adminId }));
}

export async function listLedger(userId: number, limit = 50): Promise<LedgerEntry[]> {
  const r = await getPool().query<LedgerEntry>(
    `SELECT id, user_id AS "userId", amount, balance_after AS "balanceAfter", type, ref_type AS "refType",
            ref_id AS "refId", note, created_by AS "createdBy", created_at AS "createdAt"
     FROM ledger_entries WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );
  return r.rows;
}
```

Add `export * from './wallet';` to `packages/core/src/index.ts`.

- [ ] **Step 4: Run wallet tests to verify they pass**

Run: `npm test -- wallet`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing top-up test**

`packages/core/test/topup.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  assignBankTxn, getUser, handleBankWebhook, listBankTxns, listLedger, parseTopupCode,
  type BankWebhookPayload,
} from '../src/index';
import { makeUser } from './factories';

const payload = (over: Partial<BankWebhookPayload>): BankWebhookPayload => ({
  id: 1, gateway: 'MBBank', transferType: 'in', transferAmount: 100_000, content: '', ...over,
});

describe('topup', () => {
  it('parses codes from messy bank content', () => {
    expect(parseTopupCode('CT DEN:123 NAP42 FT2410')).toBe('NAP42');
    expect(parseTopupCode('nap 7 chuyen tien')).toBe('NAP7');
    expect(parseTopupCode('NAP15FT99')).toBe('NAP15');
    expect(parseTopupCode('no code here')).toBeNull();
  });

  it('credits the matched user exactly once, even when delivered concurrently', async () => {
    const u = await makeUser();
    const p = payload({ id: 555, content: `IBFT ${u.topupCode} thanh toan` });
    const results = await Promise.all([handleBankWebhook(p), handleBankWebhook(p), handleBankWebhook(p)]);
    expect(results.filter((r) => r.status === 'MATCHED')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'DUPLICATE')).toHaveLength(2);
    expect((await getUser(u.id))?.balance).toBe(100_000);
    const ledger = await listLedger(u.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.type).toBe('TOPUP');
  });

  it('records unmatched and outgoing transfers without crediting', async () => {
    expect(await handleBankWebhook(payload({ id: 2, content: 'random' }))).toEqual({ status: 'UNMATCHED', userId: null });
    expect((await handleBankWebhook(payload({ id: 3, transferType: 'out', content: 'NAP1' }))).status).toBe('IGNORED');
    expect((await listBankTxns({ status: 'UNMATCHED' })).map((t) => t.providerTxnId)).toEqual(['2']);
  });

  it('rejects malformed payloads', async () => {
    await expect(handleBankWebhook(payload({ transferAmount: -5 }))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(handleBankWebhook({ ...payload({}), id: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('lets an admin assign an unmatched transfer once', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    await handleBankWebhook(payload({ id: 9, transferAmount: 50_000, content: 'quen ghi noi dung' }));
    const [txn] = await listBankTxns({ status: 'UNMATCHED' });
    await assignBankTxn(txn!.id, u.id, admin.id);
    expect((await getUser(u.id))?.balance).toBe(50_000);
    await expect(assignBankTxn(txn!.id, u.id, admin.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await getUser(u.id))?.balance).toBe(50_000);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- topup`
Expected: FAIL, `parseTopupCode` not exported.

- [ ] **Step 7: Implement `packages/core/src/topup.ts`**

```ts
import { getPool, withTx } from '@web12/db';
import { AppError } from './errors';
import { applyBalanceChange } from './wallet';

/** SePay webhook body (fields we use). */
export interface BankWebhookPayload {
  id: number | string;
  gateway?: string;
  transferType: string;
  transferAmount: number;
  content: string;
  referenceCode?: string;
  transactionDate?: string;
}

export type BankTxnStatus = 'MATCHED' | 'UNMATCHED' | 'IGNORED';

export interface BankTxn {
  id: number;
  provider: string;
  providerTxnId: string;
  amount: number;
  content: string;
  status: BankTxnStatus;
  userId: number | null;
  createdAt: Date;
}

export function parseTopupCode(content: string): string | null {
  const m = /NAP\s?(\d+)/i.exec(content);
  return m ? `NAP${m[1]}` : null;
}

export async function handleBankWebhook(
  p: BankWebhookPayload, provider = 'sepay',
): Promise<{ status: BankTxnStatus | 'DUPLICATE'; userId: number | null }> {
  const txnId = String(p.id ?? '').trim();
  if (!txnId) throw new AppError('INVALID_INPUT', 'Thiếu mã giao dịch');
  if (!Number.isSafeInteger(p.transferAmount) || p.transferAmount < 0) {
    throw new AppError('INVALID_INPUT', 'Số tiền không hợp lệ');
  }

  return withTx(async (c) => {
    const incoming = p.transferType === 'in' && p.transferAmount > 0;
    const code = incoming ? parseTopupCode(p.content ?? '') : null;
    const user = code
      ? (await c.query<{ id: number }>('SELECT id FROM users WHERE topup_code = $1', [code])).rows[0]
      : undefined;
    const status: BankTxnStatus = !incoming ? 'IGNORED' : user ? 'MATCHED' : 'UNMATCHED';

    // The unique (provider, provider_txn_id) index makes concurrent duplicates wait, then no-op.
    const ins = await c.query<{ id: number }>(
      `INSERT INTO bank_transactions (provider, provider_txn_id, amount, content, raw_payload, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider, provider_txn_id) DO NOTHING RETURNING id`,
      [provider, txnId, p.transferAmount, p.content ?? '', JSON.stringify(p), status, user?.id ?? null],
    );
    if (ins.rowCount === 0) return { status: 'DUPLICATE' as const, userId: null };

    if (status === 'MATCHED' && user) {
      await applyBalanceChange(c, user.id, p.transferAmount, 'TOPUP', {
        refType: 'bank_txn', refId: ins.rows[0]!.id, note: p.content,
      });
    }
    return { status, userId: user?.id ?? null };
  });
}

export async function assignBankTxn(txnId: number, userId: number, adminId: number): Promise<void> {
  await withTx(async (c) => {
    const r = await c.query<{ amount: number }>(
      `UPDATE bank_transactions SET status = 'MATCHED', user_id = $2
       WHERE id = $1 AND status = 'UNMATCHED' RETURNING amount`,
      [txnId, userId],
    );
    if (r.rowCount === 0) throw new AppError('CONFLICT', 'Giao dịch đã được xử lý hoặc không tồn tại');
    await applyBalanceChange(c, userId, r.rows[0]!.amount, 'TOPUP', {
      refType: 'bank_txn', refId: txnId, note: 'Gán thủ công', createdBy: adminId,
    });
  });
}

export async function listBankTxns(opts: { status?: BankTxnStatus; limit?: number } = {}): Promise<BankTxn[]> {
  const r = await getPool().query<BankTxn>(
    `SELECT id, provider, provider_txn_id AS "providerTxnId", amount, content, status,
            user_id AS "userId", created_at AS "createdAt"
     FROM bank_transactions WHERE ($1::text IS NULL OR status = $1)
     ORDER BY id DESC LIMIT $2`,
    [opts.status ?? null, opts.limit ?? 100],
  );
  return r.rows;
}
```

Add `export * from './topup';` to `packages/core/src/index.ts`.

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS (crypto, auth, wallet, topup).

- [ ] **Step 9: Typecheck + commit**

Run: `npm run typecheck -w @web12/core` → no errors.

```bash
git add -A
git commit -m "feat(core): wallet ledger, idempotent bank top-up webhook, manual assignment"
```


---

### Task 5: Catalog (categories, products, tier pricing, stock import)

**Files:**
- Create: `packages/core/src/slug.ts`, `packages/core/src/pricing.ts`, `packages/core/src/catalog.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/test/factories.ts`
- Test: `packages/core/test/catalog.test.ts`

**Interfaces:**
- Consumes: `getPool`, `withTx`; `AppError`, `isUniqueViolation`, `encryptSecret`; `Tier`.
- Produces:
  - `slug.ts`: `slugify(s: string): string` (strips Vietnamese diacritics, `đ`→`d`).
  - `pricing.ts`: `type PriceFields = { priceMember: number; priceCtv: number; priceAgent: number }`, `priceForTier(p: PriceFields, tier: Tier): number`
  - `catalog.ts`:
    - `type ProductType = 'STOCK'|'UNIQUE'|'API'`
    - `interface Category { id: number; name: string; slug: string; parentId: number | null; sortOrder: number }`
    - `interface Product extends PriceFields { id: number; categoryId: number; name: string; slug: string; description: string; images: string[]; attributes: Record<string, string>; type: ProductType; active: boolean; supplierId: number | null; supplierSku: string | null; createdAt: Date; stock: number | null }`. `stock` is the AVAILABLE count for STOCK/UNIQUE and `null` for API.
    - `interface ProductInput extends PriceFields { categoryId: number; name: string; slug?: string; description?: string; images?: string[]; attributes?: Record<string, string>; type: ProductType; active?: boolean; supplierId?: number | null; supplierSku?: string | null }`
    - `createCategory({ name, slug?, parentId?, sortOrder? }): Promise<Category>`, `listCategories(): Promise<Category[]>`, `getCategoryBySlug(slug): Promise<Category | null>`
    - `createProduct(input: ProductInput): Promise<Product>`, `updateProduct(id: number, input: ProductInput): Promise<Product>`
    - `getProduct(id): Promise<Product | null>`, `getProductBySlug(slug): Promise<Product | null>`
    - `listProducts(opts?: { categoryId?: number; activeOnly?: boolean }): Promise<Product[]>` (`activeOnly` defaults to `true`)
    - `addStock(productId: number, lines: string[]): Promise<number>`. Trims lines, drops empty ones, encrypts the rest. Returns the inserted count.
  - `test/factories.ts` adds `makeCategory(): Promise<Category>` and `makeProduct(opts?: { type?: ProductType; price?: number; prices?: PriceFields; stock?: number; supplierId?: number; supplierSku?: string }): Promise<Product>`. With `stock: n`, it adds n lines named `acc{i}|pass{i}`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { getPool } from '@web12/db';
import {
  addStock, createCategory, createProduct, decryptSecret, getCategoryBySlug, getProductBySlug,
  listCategories, listProducts, priceForTier, slugify, updateProduct,
} from '../src/index';
import { makeCategory, makeProduct } from './factories';

describe('catalog', () => {
  it('slugifies Vietnamese', () => {
    expect(slugify('Tài khoản Netflix Đặc biệt!')).toBe('tai-khoan-netflix-dac-biet');
  });

  it('picks the price for each tier', () => {
    const p = { priceMember: 100, priceCtv: 90, priceAgent: 80 };
    expect(priceForTier(p, 'MEMBER')).toBe(100);
    expect(priceForTier(p, 'CTV')).toBe(90);
    expect(priceForTier(p, 'AGENT')).toBe(80);
  });

  it('creates categories with unique slugs', async () => {
    const c = await createCategory({ name: 'Mạng xã hội' });
    expect(c.slug).toBe('mang-xa-hoi');
    expect((await getCategoryBySlug('mang-xa-hoi'))?.id).toBe(c.id);
    await expect(createCategory({ name: 'Mạng xã hội' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await listCategories()).toHaveLength(1);
  });

  it('creates products, imports encrypted stock and counts availability', async () => {
    const cat = await makeCategory();
    const p = await createProduct({
      categoryId: cat.id, name: 'Gmail cổ', type: 'STOCK',
      priceMember: 10_000, priceCtv: 9_000, priceAgent: 8_000,
      attributes: { region: 'US' },
    });
    expect(p.slug).toBe('gmail-co');
    expect(p.stock).toBe(0);

    expect(await addStock(p.id, ['a@x.com|1', '  ', 'b@x.com|2  ', ''])).toBe(2);
    const fetched = await getProductBySlug('gmail-co');
    expect(fetched?.stock).toBe(2);
    expect(fetched?.attributes).toEqual({ region: 'US' });

    const raw = await getPool().query<{ secret_enc: string }>('SELECT secret_enc FROM stock_items ORDER BY id');
    expect(raw.rows.map((r) => decryptSecret(r.secret_enc))).toEqual(['a@x.com|1', 'b@x.com|2']);
  });

  it('enforces UNIQUE and API stock rules', async () => {
    const uniq = await makeProduct({ type: 'UNIQUE' });
    await expect(addStock(uniq.id, ['a', 'b'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await addStock(uniq.id, ['only-one'])).toBe(1);
    await expect(addStock(uniq.id, ['again'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const cat = await makeCategory();
    await expect(createProduct({
      categoryId: cat.id, name: 'Bad API', type: 'API', priceMember: 1, priceCtv: 1, priceAgent: 1,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('validates prices and updates products', async () => {
    const cat = await makeCategory();
    const base = { categoryId: cat.id, name: 'X', type: 'STOCK' as const, priceMember: 10, priceCtv: 10, priceAgent: 10 };
    await expect(createProduct({ ...base, priceCtv: -1 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createProduct({ ...base, name: ' ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const p = await createProduct(base);
    const u = await updateProduct(p.id, { ...base, name: 'X mới', slug: p.slug, priceMember: 20, active: false });
    expect(u.name).toBe('X mới');
    expect(u.priceMember).toBe(20);
    expect(await listProducts()).toHaveLength(0);
    expect(await listProducts({ activeOnly: false })).toHaveLength(1);
    await expect(updateProduct(9999, base)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('filters by category and reports null stock for API products', async () => {
    const p1 = await makeProduct({ stock: 3 });
    await makeProduct();
    const list = await listProducts({ categoryId: p1.categoryId });
    expect(list.map((p) => p.id)).toEqual([p1.id]);
    expect(list[0]?.stock).toBe(3);
  });
});
```

- [ ] **Step 2: Extend `packages/core/test/factories.ts`**

Replace the file with:
```ts
import { getPool } from '@web12/db';
import {
  addStock, createCategory, createProduct, getUser, registerUser,
  type Category, type PriceFields, type Product, type ProductType, type Role, type Tier, type User,
} from '../src/index';

let seq = 0;

export async function makeUser(
  opts: { tier?: Tier; role?: Role; balance?: number; password?: string } = {},
): Promise<User> {
  seq++;
  const u = await registerUser({
    email: `user${seq}_${Date.now()}@test.local`,
    password: opts.password ?? 'password123',
    name: `User ${seq}`,
  });
  await getPool().query('UPDATE users SET tier = $2, role = $3, balance = $4 WHERE id = $1', [
    u.id, opts.tier ?? 'MEMBER', opts.role ?? 'CUSTOMER', opts.balance ?? 0,
  ]);
  return (await getUser(u.id))!;
}

export async function makeCategory(): Promise<Category> {
  seq++;
  return createCategory({ name: `Category ${seq}`, slug: `category-${seq}-${Date.now()}` });
}

export async function makeProduct(
  opts: { type?: ProductType; price?: number; prices?: PriceFields; stock?: number; supplierId?: number; supplierSku?: string } = {},
): Promise<Product> {
  seq++;
  const cat = await makeCategory();
  const price = opts.price ?? 10_000;
  const p = await createProduct({
    categoryId: cat.id,
    name: `Product ${seq}`,
    slug: `product-${seq}-${Date.now()}`,
    type: opts.type ?? 'STOCK',
    ...(opts.prices ?? { priceMember: price, priceCtv: price, priceAgent: price }),
    supplierId: opts.supplierId ?? null,
    supplierSku: opts.supplierSku ?? null,
  });
  if (opts.stock) {
    await addStock(p.id, Array.from({ length: opts.stock }, (_, i) => `acc${i}|pass${i}`));
    return { ...p, stock: opts.stock };
  }
  return p;
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- catalog`
Expected: FAIL, `slugify` not exported.

- [ ] **Step 4: Implement `slug.ts` and `pricing.ts`**

`packages/core/src/slug.ts`:
```ts
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

`packages/core/src/pricing.ts`:
```ts
import type { Tier } from './types';

export type PriceFields = { priceMember: number; priceCtv: number; priceAgent: number };

export function priceForTier(p: PriceFields, tier: Tier): number {
  switch (tier) {
    case 'AGENT': return p.priceAgent;
    case 'CTV': return p.priceCtv;
    default: return p.priceMember;
  }
}
```

- [ ] **Step 5: Implement `packages/core/src/catalog.ts`**

```ts
import { getPool } from '@web12/db';
import { encryptSecret } from './crypto';
import { AppError, isUniqueViolation } from './errors';
import type { PriceFields } from './pricing';
import { slugify } from './slug';

export type ProductType = 'STOCK' | 'UNIQUE' | 'API';
const PRODUCT_TYPES: ProductType[] = ['STOCK', 'UNIQUE', 'API'];

export interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
}

export interface Product extends PriceFields {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  description: string;
  images: string[];
  attributes: Record<string, string>;
  type: ProductType;
  active: boolean;
  supplierId: number | null;
  supplierSku: string | null;
  createdAt: Date;
  stock: number | null;
}

export interface ProductInput extends PriceFields {
  categoryId: number;
  name: string;
  slug?: string;
  description?: string;
  images?: string[];
  attributes?: Record<string, string>;
  type: ProductType;
  active?: boolean;
  supplierId?: number | null;
  supplierSku?: string | null;
}

const CATEGORY_COLS = `id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder"`;

const PRODUCT_COLS = `p.id, p.category_id AS "categoryId", p.name, p.slug, p.description, p.images, p.attributes,
  p.type, p.price_member AS "priceMember", p.price_ctv AS "priceCtv", p.price_agent AS "priceAgent",
  p.active, p.supplier_id AS "supplierId", p.supplier_sku AS "supplierSku", p.created_at AS "createdAt",
  CASE WHEN p.type = 'API' THEN NULL ELSE
    (SELECT count(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'AVAILABLE')::int END AS stock`;

export async function createCategory(input: { name: string; slug?: string; parentId?: number | null; sortOrder?: number }): Promise<Category> {
  const name = input.name.trim();
  const slug = slugify(input.slug?.trim() || name);
  if (!name || !slug) throw new AppError('INVALID_INPUT', 'Tên danh mục không hợp lệ');
  try {
    const r = await getPool().query<Category>(
      `INSERT INTO categories (name, slug, parent_id, sort_order) VALUES ($1, $2, $3, $4) RETURNING ${CATEGORY_COLS}`,
      [name, slug, input.parentId ?? null, input.sortOrder ?? 0],
    );
    return r.rows[0]!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Slug danh mục đã tồn tại');
    throw e;
  }
}

export async function listCategories(): Promise<Category[]> {
  const r = await getPool().query<Category>(`SELECT ${CATEGORY_COLS} FROM categories ORDER BY sort_order, name`);
  return r.rows;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const r = await getPool().query<Category>(`SELECT ${CATEGORY_COLS} FROM categories WHERE slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

function normalizeProductInput(input: ProductInput) {
  const name = input.name.trim();
  const slug = slugify(input.slug?.trim() || name);
  if (!name || !slug) throw new AppError('INVALID_INPUT', 'Tên sản phẩm không hợp lệ');
  if (!PRODUCT_TYPES.includes(input.type)) throw new AppError('INVALID_INPUT', 'Loại sản phẩm không hợp lệ');
  for (const v of [input.priceMember, input.priceCtv, input.priceAgent]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new AppError('INVALID_INPUT', 'Giá không hợp lệ');
  }
  const supplierSku = input.supplierSku?.trim() || null;
  if (input.type === 'API' && (!input.supplierId || !supplierSku)) {
    throw new AppError('INVALID_INPUT', 'Sản phẩm API cần nhà cung cấp và mã SKU');
  }
  return [
    input.categoryId, name, slug, input.description?.trim() ?? '', input.images ?? [],
    JSON.stringify(input.attributes ?? {}), input.type, input.priceMember, input.priceCtv, input.priceAgent,
    input.active ?? true, input.type === 'API' ? input.supplierId : null, input.type === 'API' ? supplierSku : null,
  ];
}

async function writeProduct(sql: string, params: unknown[]): Promise<number | null> {
  try {
    const r = await getPool().query<{ id: number }>(sql, params);
    return r.rows[0]?.id ?? null;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Slug sản phẩm đã tồn tại');
    throw e;
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const id = await writeProduct(
    `INSERT INTO products (category_id, name, slug, description, images, attributes, type,
       price_member, price_ctv, price_agent, active, supplier_id, supplier_sku)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    normalizeProductInput(input),
  );
  return (await getProduct(id!))!;
}

export async function updateProduct(id: number, input: ProductInput): Promise<Product> {
  const updated = await writeProduct(
    `UPDATE products SET category_id = $1, name = $2, slug = $3, description = $4, images = $5, attributes = $6,
       type = $7, price_member = $8, price_ctv = $9, price_agent = $10, active = $11, supplier_id = $12, supplier_sku = $13
     WHERE id = $14 RETURNING id`,
    [...normalizeProductInput(input), id],
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm');
  return (await getProduct(id))!;
}

export async function getProduct(id: number): Promise<Product | null> {
  const r = await getPool().query<Product>(`SELECT ${PRODUCT_COLS} FROM products p WHERE p.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const r = await getPool().query<Product>(`SELECT ${PRODUCT_COLS} FROM products p WHERE p.slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

export async function listProducts(opts: { categoryId?: number; activeOnly?: boolean } = {}): Promise<Product[]> {
  const r = await getPool().query<Product>(
    `SELECT ${PRODUCT_COLS} FROM products p
     WHERE ($1::bigint IS NULL OR p.category_id = $1) AND (NOT $2 OR p.active)
     ORDER BY p.id DESC`,
    [opts.categoryId ?? null, opts.activeOnly ?? true],
  );
  return r.rows;
}

export async function addStock(productId: number, lines: string[]): Promise<number> {
  const product = await getProduct(productId);
  if (!product) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm');
  if (product.type === 'API') throw new AppError('INVALID_INPUT', 'Sản phẩm API không nhập kho');

  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return 0;
  if (product.type === 'UNIQUE') {
    const existing = await getPool().query('SELECT 1 FROM stock_items WHERE product_id = $1 LIMIT 1', [productId]);
    if (clean.length > 1 || existing.rowCount) {
      throw new AppError('INVALID_INPUT', 'Sản phẩm UNIQUE chỉ có đúng 1 tài khoản');
    }
  }
  const r = await getPool().query(
    'INSERT INTO stock_items (product_id, secret_enc) SELECT $1, unnest($2::text[])',
    [productId, clean.map(encryptSecret)],
  );
  return r.rowCount ?? 0;
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from './slug';
export * from './pricing';
export * from './catalog';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all files so far).

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck -w @web12/core` → no errors.

```bash
git add -A
git commit -m "feat(core): categories, products with tier pricing, encrypted stock import"
```


---

### Task 6: Orders (purchase, API-order completion, exactly-once refund)

**Files:**
- Create: `packages/core/src/fulfill-queue.ts`, `packages/core/src/orders.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/orders.test.ts`

**Interfaces:**
- Consumes: `withTx`, `getPool`, `Queryable`; `applyBalanceChange` (Task 4); `priceForTier`, `getProduct` (Task 5); `decryptSecret`, `encryptSecret`; `makeUser`, `makeProduct` factories.
- Produces:
  - `fulfill-queue.ts` (pluggable so core does not depend on pg-boss; Part 3 plugs pg-boss in):
    - `type FulfillEnqueuer = (orderId: number) => Promise<void>`
    - `setFulfillEnqueuer(fn: FulfillEnqueuer | null): void`
    - `enqueueFulfill(orderId: number): Promise<void>`. It never throws: errors are logged, and the sweeper in Part 3 re-enqueues the order.
  - `orders.ts`:
    - `type OrderStatus = 'PENDING'|'COMPLETED'|'REFUNDED'`, `type OrderSource = 'WEB'|'API'`
    - `interface Order { id: number; userId: number; productId: number; productName: string; productType: ProductType; quantity: number; unitPrice: number; total: number; status: OrderStatus; source: OrderSource; idempotencyKey: string | null; supplierRef: string | null; error: string | null; attempts: number; createdAt: Date; updatedAt: Date }`
    - `purchase(userId: number, productId: number, quantity: number, opts?: { source?: OrderSource; idempotencyKey?: string | null }): Promise<Order>`
    - `completeApiOrder(orderId: number, secrets: string[], supplierRef: string): Promise<boolean>`. Returns false if the order was no longer PENDING.
    - `refundOrder(orderId: number, reason: string): Promise<boolean>`. Returns false if the order was no longer PENDING.
    - `getOrder(id: number): Promise<Order | null>`, `getOrderForUser(id: number, userId: number): Promise<Order>` (throws `NOT_FOUND` if missing or owned by someone else)
    - `listOrdersForUser(userId: number, limit?: number): Promise<Order[]>`, `listAllOrders(opts?: { status?: OrderStatus; limit?: number }): Promise<Order[]>`
    - `getOrderSecrets(orderId: number): Promise<string[]>` (decrypted, in insertion order)
    - `incrementAttempts(orderId: number): Promise<number>`. Returns the new attempt count.
    - `listStalePendingOrders(olderThanSeconds: number): Promise<number[]>`. Returns ids of PENDING orders whose `updated_at` is older than the given age.

- [ ] **Step 1: Write the failing test**

`packages/core/test/orders.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- orders`
Expected: FAIL, `purchase` not exported.

- [ ] **Step 3: Implement `packages/core/src/fulfill-queue.ts`**

```ts
export type FulfillEnqueuer = (orderId: number) => Promise<void>;

let enqueuer: FulfillEnqueuer | null = null;

export function setFulfillEnqueuer(fn: FulfillEnqueuer | null): void {
  enqueuer = fn;
}

/** Never throws: a failed enqueue is recovered by the worker's stale-order sweeper. */
export async function enqueueFulfill(orderId: number): Promise<void> {
  if (!enqueuer) return;
  try {
    await enqueuer(orderId);
  } catch (err) {
    console.error(`enqueueFulfill(${orderId}) failed; sweeper will retry`, err);
  }
}
```

- [ ] **Step 4: Implement `packages/core/src/orders.ts`**

```ts
import { getPool, withTx, type Queryable } from '@web12/db';
import type { ProductType } from './catalog';
import { decryptSecret, encryptSecret } from './crypto';
import { AppError, isUniqueViolation } from './errors';
import { enqueueFulfill } from './fulfill-queue';
import { priceForTier, type PriceFields } from './pricing';
import type { Tier } from './types';
import { applyBalanceChange } from './wallet';

export type OrderStatus = 'PENDING' | 'COMPLETED' | 'REFUNDED';
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
  idempotencyKey: string | null;
  supplierRef: string | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const ORDER_SELECT = `SELECT o.id, o.user_id AS "userId", o.product_id AS "productId", p.name AS "productName",
  p.type AS "productType", o.quantity, o.unit_price AS "unitPrice", o.total, o.status, o.source,
  o.idempotency_key AS "idempotencyKey", o.supplier_ref AS "supplierRef", o.error, o.attempts,
  o.created_at AS "createdAt", o.updated_at AS "updatedAt"
  FROM orders o JOIN products p ON p.id = o.product_id`;

async function findByKey(c: Queryable, userId: number, key: string): Promise<Order | null> {
  const r = await c.query<Order>(`${ORDER_SELECT} WHERE o.user_id = $1 AND o.idempotency_key = $2`, [userId, key]);
  return r.rows[0] ?? null;
}

export async function purchase(
  userId: number, productId: number, quantity: number,
  opts: { source?: OrderSource; idempotencyKey?: string | null } = {},
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
      if (product.type === 'UNIQUE' && quantity !== 1) {
        throw new AppError('INVALID_INPUT', 'Sản phẩm này chỉ mua được số lượng 1');
      }

      const unitPrice = priceForTier(product, user.tier);
      const total = unitPrice * quantity;
      const isApi = product.type === 'API';

      let itemIds: number[] = [];
      if (!isApi) {
        const items = await c.query<{ id: number }>(
          `SELECT id FROM stock_items WHERE product_id = $1 AND status = 'AVAILABLE'
           ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
          [productId, quantity],
        );
        if (items.rows.length < quantity) throw new AppError('OUT_OF_STOCK', 'Không đủ hàng');
        itemIds = items.rows.map((r) => r.id);
      }

      const order = await c.query<{ id: number }>(
        `INSERT INTO orders (user_id, product_id, quantity, unit_price, total, status, source, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [userId, productId, quantity, unitPrice, total, isApi ? 'PENDING' : 'COMPLETED', opts.source ?? 'WEB', key],
      );
      const orderId = order.rows[0]!.id;

      if (total > 0) {
        await applyBalanceChange(c, userId, -total, 'PURCHASE', { refType: 'order', refId: orderId });
      }
      if (itemIds.length) {
        await c.query(
          `UPDATE stock_items SET status = 'SOLD', order_id = $1, sold_at = now() WHERE id = ANY($2::bigint[])`,
          [orderId, itemIds],
        );
      }
      return { id: orderId, isApi };
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
       WHERE id = $1 AND status = 'PENDING' RETURNING product_id AS "productId"`,
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
```

Add to `packages/core/src/index.ts`:
```ts
export * from './fulfill-queue';
export * from './orders';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all files). If the concurrency test flakes with fewer than 10 sales, that means `SKIP LOCKED` skipped rows locked by buyers whose transactions later rolled back. That cannot happen here because every buyer can afford the item. Treat a flake as a real bug and investigate.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck -w @web12/core` → no errors.

```bash
git add -A
git commit -m "feat(core): purchase with SKIP LOCKED stock claim, idempotency, exactly-once refund"
```
