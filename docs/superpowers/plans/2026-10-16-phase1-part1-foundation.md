# web12 Phase 1 — Part 1: Foundation (workspace, DB, crypto, auth)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo skeleton with a local Postgres, SQL migrations, and `packages/core` crypto + auth tested against a real DB.

**Architecture:** npm workspaces. `packages/db` owns the pg pool, transactions, migrations and the embedded-postgres dev server. `packages/core` owns all business logic and is tested with vitest against the `web12_test` database. Packages export TypeScript source directly (no build step); Next.js transpiles them, the worker runs via `tsx`.

**Tech Stack:** Node ≥22.12 (dev machine: v25), TypeScript 5.9.3, pg 8.23.x, embedded-postgres 18.4.0-beta.17, vitest 5.0.x, tsx 4.23.x.

Plan series (execute in order):
1. Part 1 — this file: Tasks 1–3
2. Part 2 — `2026-10-16-phase1-part2-money.md`: Tasks 4–6 (wallet, top-up, catalog, orders)
3. Part 3 — `2026-10-16-phase1-part3-supplier-worker.md`: Tasks 7–8 (adapter, mock supplier, queue, worker)
4. Part 4 — `2026-10-16-phase1-part4-web.md`: Tasks 9–14 (Next.js app, reseller API, admin, seed, README)

Spec: `docs/superpowers/specs/2026-10-16-account-shop-design.md`

## Global Constraints

- No ORM. Raw SQL via `pg`; numbered `.sql` migrations in `packages/db/migrations/`, tracked in table `_migrations`.
- SQL identifiers snake_case; TS fields camelCase (alias with `AS "camelName"` in SELECTs).
- Money = integer VND, SQL `BIGINT`; TS `number` (BIGINT parsed to number globally in `packages/db/src/pool.ts`).
- All writes to `users.balance`, `ledger_entries`, `stock_items`, `orders`, `bank_transactions` happen only inside `packages/core`.
- Every balance change writes exactly one `ledger_entries` row in the same transaction.
- Secrets (account credentials, supplier API keys) stored AES-256-GCM encrypted with `SECRET_KEY` (32 bytes, base64).
- User-facing error messages are Vietnamese; code/comments English.
- TypeScript strict; module resolution `Bundler`; imports without file extensions; `"type": "module"` everywhere.
- Dev DB: embedded-postgres on port 5433, user/password `postgres`/`postgres`, databases `web12` and `web12_test`.
- Commit after each task. Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Workspace scaffold + `packages/db`

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Create: `packages/db/src/env.ts`, `packages/db/src/pool.ts`, `packages/db/src/tx.ts`, `packages/db/src/migrate.ts`, `packages/db/src/index.ts`
- Create: `packages/db/scripts/start.ts`, `packages/db/scripts/migrate.ts`
- Create: `packages/db/migrations/001_init.sql`

**Interfaces:**
- Produces (import from `@web12/db`):
  - `loadEnv(): void` — loads repo-root `.env` if it exists (does not override already-set vars).
  - `getPool(): pg.Pool` — singleton pool from `process.env.DATABASE_URL` (cached on `globalThis` for Next.js HMR).
  - `closePool(): Promise<void>`
  - `type Queryable = Pick<pg.PoolClient, 'query'>`
  - `withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>` — BEGIN/COMMIT, ROLLBACK on throw.
  - `migrate(pool: pg.Pool): Promise<string[]>` — applies pending migrations, returns applied file names.
  - `ALL_TABLES: string[]` — every app table name (used by tests to truncate).

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "web12",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "db:start": "npm run start -w @web12/db",
    "db:migrate": "npm run migrate -w @web12/db",
    "test": "npm test -w @web12/core",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "@types/node": "^26.6.5",
    "tsx": "^4.23.15",
    "typescript": "5.9.3"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`.gitignore`:
```
node_modules/
.pgdata/
.env
.next/
*.log
```

`.env.example`:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/web12
DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/web12_test
# 32 random bytes, base64. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SECRET_KEY=
WEBHOOK_TOKEN=dev-webhook-token
BANK_ID=MB
BANK_ACCOUNT=0000000000
BANK_ACCOUNT_NAME=SHOP WEB12
MOCK_SUPPLIER_PORT=4100
MOCK_SUPPLIER_KEY=mock-key
```

- [ ] **Step 2: `packages/db` package files**

`packages/db/package.json`:
```json
{
  "name": "@web12/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "start": "tsx scripts/start.ts",
    "migrate": "tsx scripts/migrate.ts",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "pg": "^8.23.1" },
  "devDependencies": {
    "@types/pg": "^8.23.1",
    "embedded-postgres": "18.4.0-beta.17"
  }
}
```

`packages/db/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "scripts"] }
```

- [ ] **Step 3: `packages/db/src/env.ts`**

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Repo-root .env: packages/db/src -> ../../../.env
const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url));

export function loadEnv(): void {
  // process.loadEnvFile does not override variables that are already set.
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
}
```

- [ ] **Step 4: `packages/db/src/pool.ts`**

```ts
import pg from 'pg';

// BIGINT (oid 20) -> number. All money values are < 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

const g = globalThis as typeof globalThis & { __web12Pool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!g.__web12Pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    g.__web12Pool = new pg.Pool({ connectionString, max: 10 });
  }
  return g.__web12Pool;
}

export async function closePool(): Promise<void> {
  if (g.__web12Pool) {
    const p = g.__web12Pool;
    g.__web12Pool = undefined;
    await p.end();
  }
}
```

- [ ] **Step 5: `packages/db/src/tx.ts`**

```ts
import type pg from 'pg';
import { getPool } from './pool';

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 6: `packages/db/src/migrate.ts` and `index.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export const ALL_TABLES = [
  'users', 'sessions', 'api_keys', 'categories', 'suppliers', 'products',
  'orders', 'stock_items', 'ledger_entries', 'bank_transactions',
];

export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
  );
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
```

`packages/db/src/index.ts`:
```ts
export { loadEnv } from './env';
export { getPool, closePool } from './pool';
export { withTx, type Queryable } from './tx';
export { migrate, ALL_TABLES } from './migrate';
```

- [ ] **Step 7: Migration `packages/db/migrations/001_init.sql`**

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN')),
  tier          TEXT NOT NULL DEFAULT 'MEMBER' CHECK (tier IN ('MEMBER', 'CTV', 'AGENT')),
  balance       BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  topup_code    TEXT GENERATED ALWAYS AS ('NAP' || id::text) STORED UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY, -- sha256(token)
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE api_keys (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  parent_id  BIGINT REFERENCES categories(id),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE suppliers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  adapter     TEXT NOT NULL DEFAULT 'generic-rest',
  base_url    TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id           BIGSERIAL PRIMARY KEY,
  category_id  BIGINT NOT NULL REFERENCES categories(id),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  images       TEXT[] NOT NULL DEFAULT '{}',
  attributes   JSONB NOT NULL DEFAULT '{}',
  type         TEXT NOT NULL CHECK (type IN ('STOCK', 'UNIQUE', 'API')),
  price_member BIGINT NOT NULL CHECK (price_member >= 0),
  price_ctv    BIGINT NOT NULL CHECK (price_ctv >= 0),
  price_agent  BIGINT NOT NULL CHECK (price_agent >= 0),
  active       BOOLEAN NOT NULL DEFAULT true,
  supplier_id  BIGINT REFERENCES suppliers(id),
  supplier_sku TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (type <> 'API' OR (supplier_id IS NOT NULL AND supplier_sku IS NOT NULL))
);
CREATE INDEX products_category_idx ON products(category_id);

CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price      BIGINT NOT NULL,
  total           BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'REFUNDED')),
  source          TEXT NOT NULL CHECK (source IN ('WEB', 'API')),
  idempotency_key TEXT,
  supplier_ref    TEXT,
  error           TEXT,
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_idx ON orders(user_id, id DESC);
CREATE INDEX orders_pending_idx ON orders(updated_at) WHERE status = 'PENDING';

CREATE TABLE stock_items (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  secret_enc TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD')),
  order_id   BIGINT REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at    TIMESTAMPTZ
);
CREATE INDEX stock_items_available_idx ON stock_items(product_id, id) WHERE status = 'AVAILABLE';
CREATE INDEX stock_items_order_idx ON stock_items(order_id);

CREATE TABLE ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  amount        BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('TOPUP', 'PURCHASE', 'REFUND', 'ADJUST')),
  ref_type      TEXT,
  ref_id        TEXT,
  note          TEXT,
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON ledger_entries(user_id, id DESC);

CREATE TABLE bank_transactions (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,
  provider_txn_id TEXT NOT NULL,
  amount          BIGINT NOT NULL,
  content         TEXT NOT NULL,
  raw_payload     JSONB NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('MATCHED', 'UNMATCHED', 'IGNORED')),
  user_id         BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_txn_id)
);
```

- [ ] **Step 8: Scripts**

`packages/db/scripts/start.ts`:
```ts
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../../../.pgdata', import.meta.url));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
for (const name of ['web12', 'web12_test']) {
  try {
    await pg.createDatabase(name);
  } catch {
    // already exists
  }
}
console.log('Postgres running on localhost:5433 (Ctrl+C to stop)');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
```

`packages/db/scripts/migrate.ts`:
```ts
import { closePool, getPool, loadEnv, migrate } from '../src/index';

loadEnv();
const applied = await migrate(getPool());
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to migrate');
await closePool();
```

- [ ] **Step 9: Install, start DB, migrate**

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste into SECRET_KEY in .env
npm install
npm run db:start        # separate terminal, leave running
npm run db:migrate
```
Expected: `Applied: 001_init.sql`. Run `npm run db:migrate` again → `Nothing to migrate`.

If `embedded-postgres` constructor options differ in the installed version, check `node_modules/embedded-postgres/README.md` and adjust `start.ts` only.

- [ ] **Step 10: Typecheck + commit**

Run: `npm run typecheck -w @web12/db` → no errors.

```bash
git add -A
git commit -m "feat(db): workspace scaffold, pg pool, migrations, embedded postgres"
```


---

### Task 2: `packages/core` scaffold, test harness, errors, crypto

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/test/global-setup.ts`, `packages/core/test/setup.ts`
- Create: `packages/core/src/errors.ts`, `packages/core/src/crypto.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/crypto.test.ts`

**Interfaces:**
- Consumes: `@web12/db` (`loadEnv`, `getPool`, `closePool`, `migrate`, `ALL_TABLES`).
- Produces (from `@web12/core`):
  - `type ErrorCode = 'INVALID_INPUT'|'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'OUT_OF_STOCK'|'INSUFFICIENT_BALANCE'|'RATE_LIMITED'`
  - `class AppError extends Error { code: ErrorCode; status: number }`. `status` is the HTTP status for the code.
  - `isAppError(e: unknown): e is AppError`, `isUniqueViolation(e: unknown): boolean`
  - `encryptSecret(plain: string): string`, `decryptSecret(enc: string): string`
  - `hashPassword(pw: string): Promise<string>`, `verifyPassword(pw: string, stored: string): Promise<boolean>`
  - `sha256(s: string): string` (hex), `randomToken(bytes?: number): string` (base64url), `safeEqual(a: string, b: string): boolean`
- Test harness: every test starts with a migrated, truncated `web12_test` DB; `process.env.DATABASE_URL` points at it.

- [ ] **Step 1: Package files**

`packages/core/package.json`:
```json
{
  "name": "@web12/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@web12/db": "*" },
  "devDependencies": { "vitest": "^5.0.5", "pg": "^8.23.1", "@types/pg": "^8.23.1" }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "vitest.config.ts"] }
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
```

- [ ] **Step 2: Test harness**

`packages/core/test/global-setup.ts` rebuilds the test schema once per run:
```ts
import pg from 'pg';
import { loadEnv, migrate } from '@web12/db';

export default async function setup() {
  loadEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set (copy .env.example to .env)');
  const pool = new pg.Pool({ connectionString: url });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await pool.end();
}
```

`packages/core/test/setup.ts` runs in each test worker:
```ts
import { afterAll, beforeEach } from 'vitest';
import { ALL_TABLES, closePool, getPool, loadEnv } from '@web12/db';

loadEnv();
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64');
process.env.WEBHOOK_TOKEN ||= 'test-webhook-token';

beforeEach(async () => {
  await getPool().query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 3: Write the failing crypto test**

`packages/core/test/crypto.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  AppError, decryptSecret, encryptSecret, hashPassword, isAppError,
  randomToken, safeEqual, sha256, verifyPassword,
} from '../src/index';

describe('crypto', () => {
  it('round-trips secrets and uses a fresh IV each time', () => {
    const plain = 'user@mail.com|p@ss:word|2FA';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptSecret('hello').split(':');
    parts[3] = Buffer.from('HELLO').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('password123');
    expect(h.startsWith('scrypt:')).toBe(true);
    expect(await verifyPassword('password123', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('has token helpers', () => {
    expect(sha256('a')).toHaveLength(64);
    expect(randomToken()).not.toBe(randomToken());
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('AppError maps codes to HTTP status', () => {
    const e = new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ');
    expect(e.status).toBe(402);
    expect(isAppError(e)).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test` (DB must be running via `npm run db:start`)
Expected: FAIL, cannot resolve `../src/index`.

- [ ] **Step 5: Implement `packages/core/src/errors.ts`**

```ts
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_BALANCE'
  | 'RATE_LIMITED';

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  INSUFFICIENT_BALANCE: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Postgres unique_violation */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === '23505';
}
```

- [ ] **Step 6: Implement `packages/core/src/crypto.ts`**

```ts
import {
  createCipheriv, createDecipheriv, createHash, randomBytes,
  scrypt as scryptCb, timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

function secretKey(): Buffer {
  const raw = process.env.SECRET_KEY;
  if (!raw) throw new Error('SECRET_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('SECRET_KEY must be 32 bytes, base64-encoded');
  return key;
}

/** Format: v1:<iv b64>:<tag b64>:<ciphertext b64> */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string): string {
  const [version, iv, tag, ct] = enc.split(':');
  if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Invalid secret format');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split(':');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison; hashing first makes lengths equal. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
```

`packages/core/src/index.ts`:
```ts
export * from './errors';
export * from './crypto';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm install && npm test`
Expected: PASS, 5 tests in `crypto.test.ts`.

- [ ] **Step 8: Typecheck + commit**

Run: `npm run typecheck -w @web12/core` → no errors.

```bash
git add -A
git commit -m "feat(core): test harness, AppError, AES-GCM + scrypt crypto"
```


---

### Task 3: Auth (users, sessions, API keys) + test factories

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/auth.ts`, `packages/core/src/users.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/factories.ts`
- Test: `packages/core/test/auth.test.ts`

**Interfaces:**
- Consumes: `getPool` from `@web12/db`; `AppError`, `isUniqueViolation`, `hashPassword`, `verifyPassword`, `sha256`, `randomToken` from Task 2.
- Produces:
  - `types.ts`: `type Role = 'CUSTOMER'|'STAFF'|'ADMIN'`, `type Tier = 'MEMBER'|'CTV'|'AGENT'`,
    `interface User { id: number; email: string; name: string; role: Role; tier: Tier; balance: number; topupCode: string; createdAt: Date }`,
    `interface ApiKey { id: number; name: string; prefix: string; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }`
  - `auth.ts`: `registerUser({ email, password, name }): Promise<User>`, `login(email, password): Promise<{ token: string; user: User }>`,
    `getSessionUser(token: string): Promise<User | null>`, `logout(token: string): Promise<void>`, `SESSION_DAYS = 30`,
    `createApiKey(userId: number, name: string): Promise<{ key: string; apiKey: ApiKey }>`, `listApiKeys(userId): Promise<ApiKey[]>`,
    `revokeApiKey(userId: number, id: number): Promise<void>`, `getUserByApiKey(key: string): Promise<User | null>`
  - `users.ts`: `USER_COLS` (SQL select list aliased to `User`), `getUser(id): Promise<User | null>`, `listUsers({ q?, limit? }): Promise<User[]>`,
    `setUserTier(id, tier): Promise<void>`, `setUserRole(id, role): Promise<void>`
  - `test/factories.ts`: `makeUser(opts?: { tier?: Tier; role?: Role; balance?: number; password?: string }): Promise<User>`.
    It sets the balance directly (no ledger row), so tests that check the ledger invariant must fund users through wallet functions instead.

- [ ] **Step 1: Write the failing test**

`packages/core/test/auth.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  createApiKey, getSessionUser, getUserByApiKey, listApiKeys, login, logout,
  registerUser, revokeApiKey, setUserTier, getUser,
} from '../src/index';

describe('auth', () => {
  it('registers, logs in and resolves the session', async () => {
    const u = await registerUser({ email: ' An@Example.com ', password: 'password123', name: 'An' });
    expect(u.email).toBe('an@example.com');
    expect(u.role).toBe('CUSTOMER');
    expect(u.tier).toBe('MEMBER');
    expect(u.balance).toBe(0);
    expect(u.topupCode).toBe(`NAP${u.id}`);

    const { token, user } = await login('an@example.com', 'password123');
    expect(user.id).toBe(u.id);
    expect((await getSessionUser(token))?.id).toBe(u.id);

    await logout(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it('rejects duplicate email, weak password and bad credentials', async () => {
    await registerUser({ email: 'a@b.co', password: 'password123', name: 'A' });
    await expect(registerUser({ email: 'A@B.co', password: 'password123', name: 'A' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(registerUser({ email: 'x@b.co', password: 'short', name: 'X' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(registerUser({ email: 'not-an-email', password: 'password123', name: 'X' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(login('a@b.co', 'wrongpass')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(login('nobody@b.co', 'password123')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await getSessionUser('random-token')).toBeNull();
  });

  it('creates, uses and revokes API keys', async () => {
    const u = await registerUser({ email: 'r@b.co', password: 'password123', name: 'R' });
    const { key, apiKey } = await createApiKey(u.id, 'bot');
    expect(key.startsWith('sk_')).toBe(true);
    expect(apiKey.prefix).toBe(key.slice(0, 10));

    expect((await getUserByApiKey(key))?.id).toBe(u.id);
    const [listed] = await listApiKeys(u.id);
    expect(listed?.lastUsedAt).not.toBeNull();

    await revokeApiKey(u.id, apiKey.id);
    expect(await getUserByApiKey(key)).toBeNull();
    await expect(revokeApiKey(u.id, apiKey.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await getUserByApiKey('sk_doesnotexist')).toBeNull();
  });

  it('changes tier', async () => {
    const u = await registerUser({ email: 't@b.co', password: 'password123', name: 'T' });
    await setUserTier(u.id, 'AGENT');
    expect((await getUser(u.id))?.tier).toBe('AGENT');
    await expect(setUserTier(u.id, 'BOSS' as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `registerUser` is not exported.

- [ ] **Step 3: Implement `packages/core/src/types.ts`**

```ts
export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type Tier = 'MEMBER' | 'CTV' | 'AGENT';

export const ROLES: Role[] = ['CUSTOMER', 'STAFF', 'ADMIN'];
export const TIERS: Tier[] = ['MEMBER', 'CTV', 'AGENT'];

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  tier: Tier;
  balance: number;
  topupCode: string;
  createdAt: Date;
}

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}
```

- [ ] **Step 4: Implement `packages/core/src/users.ts`**

```ts
import { getPool } from '@web12/db';
import { AppError } from './errors';
import { ROLES, TIERS, type Role, type Tier, type User } from './types';

export const USER_COLS = `u.id, u.email, u.name, u.role, u.tier, u.balance,
  u.topup_code AS "topupCode", u.created_at AS "createdAt"`;

export async function getUser(id: number): Promise<User | null> {
  const r = await getPool().query<User>(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function listUsers(opts: { q?: string; limit?: number } = {}): Promise<User[]> {
  const q = opts.q?.trim();
  const r = await getPool().query<User>(
    `SELECT ${USER_COLS} FROM users u
     WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
     ORDER BY u.id DESC LIMIT $2`,
    [q || null, opts.limit ?? 100],
  );
  return r.rows;
}

export async function setUserTier(id: number, tier: Tier): Promise<void> {
  if (!TIERS.includes(tier)) throw new AppError('INVALID_INPUT', 'Cấp không hợp lệ');
  const r = await getPool().query('UPDATE users SET tier = $2 WHERE id = $1', [id, tier]);
  if (r.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
}

export async function setUserRole(id: number, role: Role): Promise<void> {
  if (!ROLES.includes(role)) throw new AppError('INVALID_INPUT', 'Vai trò không hợp lệ');
  const r = await getPool().query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
  if (r.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
}
```

- [ ] **Step 5: Implement `packages/core/src/auth.ts`**

```ts
import { getPool } from '@web12/db';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto';
import { AppError, isUniqueViolation } from './errors';
import type { ApiKey, User } from './types';
import { getUser, USER_COLS } from './users';

export const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(input: { email: string; password: string; name: string }): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) throw new AppError('INVALID_INPUT', 'Email không hợp lệ');
  if (input.password.length < 8) throw new AppError('INVALID_INPUT', 'Mật khẩu tối thiểu 8 ký tự');
  if (!name) throw new AppError('INVALID_INPUT', 'Vui lòng nhập tên');

  const hash = await hashPassword(input.password);
  try {
    const r = await getPool().query<{ id: number }>(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hash, name],
    );
    return (await getUser(r.rows[0]!.id))!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Email đã được đăng ký');
    throw e;
  }
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const r = await getPool().query<{ id: number; passwordHash: string }>(
    'SELECT id, password_hash AS "passwordHash" FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const row = r.rows[0];
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AppError('UNAUTHORIZED', 'Sai email hoặc mật khẩu');
  }
  const token = randomToken();
  await getPool().query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), row.id, SESSION_DAYS],
  );
  return { token, user: (await getUser(row.id))! };
}

export async function getSessionUser(token: string): Promise<User | null> {
  if (!token) return null;
  const r = await getPool().query<User>(
    `SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return r.rows[0] ?? null;
}

export async function logout(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
}

const API_KEY_COLS = `id, name, prefix, last_used_at AS "lastUsedAt", revoked_at AS "revokedAt", created_at AS "createdAt"`;

export async function createApiKey(userId: number, name: string): Promise<{ key: string; apiKey: ApiKey }> {
  const label = name.trim() || 'default';
  const key = `sk_${randomToken(24)}`;
  const r = await getPool().query<ApiKey>(
    `INSERT INTO api_keys (user_id, name, prefix, key_hash) VALUES ($1, $2, $3, $4) RETURNING ${API_KEY_COLS}`,
    [userId, label, key.slice(0, 10), sha256(key)],
  );
  return { key, apiKey: r.rows[0]! };
}

export async function listApiKeys(userId: number): Promise<ApiKey[]> {
  const r = await getPool().query<ApiKey>(
    `SELECT ${API_KEY_COLS} FROM api_keys WHERE user_id = $1 ORDER BY id DESC`,
    [userId],
  );
  return r.rows;
}

export async function revokeApiKey(userId: number, id: number): Promise<void> {
  const r = await getPool().query(
    'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [id, userId],
  );
  if (r.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy khóa API');
}

export async function getUserByApiKey(key: string): Promise<User | null> {
  if (!key) return null;
  const r = await getPool().query<{ userId: number }>(
    `UPDATE api_keys SET last_used_at = now()
     WHERE key_hash = $1 AND revoked_at IS NULL RETURNING user_id AS "userId"`,
    [sha256(key)],
  );
  const row = r.rows[0];
  return row ? getUser(row.userId) : null;
}
```

Update `packages/core/src/index.ts`:
```ts
export * from './errors';
export * from './crypto';
export * from './types';
export * from './users';
export * from './auth';
```

- [ ] **Step 6: Write `packages/core/test/factories.ts`**

```ts
import { getPool } from '@web12/db';
import { getUser, registerUser, type Role, type Tier, type User } from '../src/index';

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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests in `crypto.test.ts` and `auth.test.ts`.

- [ ] **Step 8: Typecheck + commit**

Run: `npm run typecheck -w @web12/core` → no errors.

```bash
git add -A
git commit -m "feat(core): user registration, sessions, API keys, admin user ops"
```
