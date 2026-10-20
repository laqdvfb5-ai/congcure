# web12 Phase 1 — Part 4: Web app, reseller API, admin, seed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js app with the customer storefront, wallet top-up, bank webhook, reseller API `/api/v1`, and a minimal admin, plus seed data and a README so the whole flow runs end to end.

**Architecture:** `apps/web` is a Next.js 16 App Router app. Pages are server components. Mutations are server actions that call `@web12/core`. On error they redirect back with `?error=<message>`, so the app needs no client components. Route handlers serve `/api/v1/*` and `/api/webhooks/bank`. No business logic lives in `apps/web`: every handler validates, calls core, then formats the result.

**Tech Stack:** Next.js 16.4.x, React 19.3.x, Tailwind CSS 4.3.x (`@tailwindcss/postcss`), plus Parts 1–3.

Prerequisite: Parts 1–3 done. Part 1 **Global Constraints** apply.

Next.js 16 notes for implementers:
- `cookies()`, `headers()`, `params` and `searchParams` are all async (`await` them).
- Route handler signature: `export async function GET(req: Request, ctx: { params: Promise<{ id: string }> })`.
- Do not create `middleware.ts`. Auth checks live in layouts and pages via `requireUser()` / `requireStaff()`.

---

### Task 9: Next.js scaffold, session helpers, register / login / logout

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/next-env.d.ts`
- Create: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx` (placeholder; replaced in Task 10)
- Create: `apps/web/src/lib/core.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/lib/action-error.ts`, `apps/web/src/lib/rate-limit.ts`
- Create: `apps/web/src/components/Flash.tsx`
- Create: `apps/web/src/app/dang-ky/page.tsx`, `apps/web/src/app/dang-nhap/page.tsx`, `apps/web/src/app/auth-actions.ts`
- Modify: root `package.json` (add script `dev`)

**Interfaces:**
- Consumes: `registerUser`, `login`, `logout`, `getSessionUser`, `SESSION_DAYS`, `usePgBossEnqueuer`, `isAppError` from `@web12/core`.
- Produces (used by every later web task):
  - `@/lib/core`: `core`. This is the `@web12/core` namespace re-exported after `usePgBossEnqueuer()` has run once. Every page and route imports core through `import { core } from '@/lib/core'`.
  - `@/lib/session`: `getCurrentUser(): Promise<User | null>`, `requireUser(): Promise<User>` (redirects to `/dang-nhap`), `requireStaff(): Promise<User>` (redirects to `/` unless STAFF/ADMIN), `setSessionCookie(token)`, `readSessionToken(): Promise<string | undefined>`, `clearSessionCookie()`
  - `@/lib/format`: `formatVnd(n: number): string`, `formatDate(d: Date): string`, `TYPE_LABEL: Record<ProductType, string>`, `STATUS_LABEL: Record<OrderStatus, string>`, `TIER_LABEL: Record<Tier, string>`
  - `@/lib/action-error`: `fail(path: string, err: unknown): never`. It redirects to `path?error=<message>`, showing the `AppError` message or a generic one, and rethrows Next's redirect errors untouched.
  - `@/lib/rate-limit`: `rateLimit(key: string, limit: number, windowMs: number): boolean` (true = allowed)
  - `<Flash searchParams={...} />` shows `?error=` in red and `?ok=` in green.

- [ ] **Step 1: Package and config files**

`apps/web/package.json`:
```json
{
  "name": "@web12/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@web12/core": "*",
    "@web12/db": "*",
    "next": "^16.4.1",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.3",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4.3.3"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": false,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next-env.d.ts`:
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`apps/web/next.config.ts`:
```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// Single .env at the repo root, shared with worker and scripts.
const rootEnv = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ['@web12/core', '@web12/db'],
  serverExternalPackages: ['pg', 'pg-boss'],
};

export default config;
```

`apps/web/postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`apps/web/src/app/globals.css`:
```css
@import "tailwindcss";

@layer components {
  .btn { @apply inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50; }
  .btn-secondary { @apply inline-block rounded border border-gray-300 px-4 py-2 hover:bg-gray-50; }
  .input { @apply w-full rounded border border-gray-300 px-3 py-2; }
  .card { @apply rounded-lg border border-gray-200 bg-white p-4; }
  .table { @apply w-full text-left text-sm; }
  .table th { @apply border-b px-2 py-2 font-medium text-gray-600; }
  .table td { @apply border-b px-2 py-2 align-top; }
}
```

Root `package.json` scripts: add `"dev": "npm run dev -w @web12/web"`. Run `npm install`.

- [ ] **Step 2: Library helpers**

`apps/web/src/lib/core.ts`:
```ts
import * as core from '@web12/core';

// Web process only produces jobs; the worker consumes them.
core.usePgBossEnqueuer();

export { core };
```

`apps/web/src/lib/session.ts`:
```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@web12/core';
import { core } from './core';

const COOKIE = 'sid';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: core.SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await readSessionToken();
  return token ? core.getSessionUser(token) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap');
  return user;
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role === 'CUSTOMER') redirect('/');
  return user;
}
```

`apps/web/src/lib/format.ts`:
```ts
import type { OrderStatus, ProductType, Tier } from '@web12/core';

const vnd = new Intl.NumberFormat('vi-VN');

export function formatVnd(n: number): string {
  return `${vnd.format(n)}đ`;
}

export function formatDate(d: Date): string {
  return new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export const TYPE_LABEL: Record<ProductType, string> = { STOCK: 'Kho', UNIQUE: 'Hàng riêng', API: 'Nguồn API' };
export const STATUS_LABEL: Record<OrderStatus, string> = { PENDING: 'Đang xử lý', COMPLETED: 'Hoàn thành', REFUNDED: 'Đã hoàn tiền' };
export const TIER_LABEL: Record<Tier, string> = { MEMBER: 'Thành viên', CTV: 'CTV', AGENT: 'Đại lý' };
```

`apps/web/src/lib/action-error.ts`:
```ts
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { redirect } from 'next/navigation';
import { isAppError } from '@web12/core';

export function fail(path: string, err: unknown): never {
  if (isRedirectError(err)) throw err;
  if (!isAppError(err)) console.error(err);
  const message = isAppError(err) ? err.message : 'Có lỗi xảy ra, vui lòng thử lại';
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}
```
If the `isRedirectError` import path does not exist in the installed Next version, search for it: `grep -rl "export function isRedirectError" node_modules/next/dist/client/components/`.

`apps/web/src/lib/rate-limit.ts`:
```ts
// Fixed-window, in-memory limiter. Good enough for a single web process.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  b.count++;
  return b.count <= limit;
}
```

`apps/web/src/components/Flash.tsx`:
```tsx
export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  const ok = typeof searchParams.ok === 'string' ? searchParams.ok : null;
  if (!error && !ok) return null;
  return (
    <div className={`mb-4 rounded px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
      {error ?? ok}
    </div>
  );
}
```

- [ ] **Step 3: Layout and placeholder home**

`apps/web/src/app/layout.tsx`:
```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatVnd } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { logoutAction } from './auth-actions';
import './globals.css';

export const metadata = { title: 'Shop tài khoản' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="text-lg font-semibold">Shop tài khoản</Link>
            <div className="flex-1" />
            {user ? (
              <>
                <Link href="/nap-tien" className="font-medium text-blue-700">{formatVnd(user.balance)}</Link>
                <Link href="/don-hang">Đơn hàng</Link>
                <Link href="/tai-khoan">Tài khoản</Link>
                {user.role !== 'CUSTOMER' && <Link href="/admin">Quản trị</Link>}
                <form action={logoutAction}><button className="text-gray-500">Đăng xuất</button></form>
              </>
            ) : (
              <>
                <Link href="/dang-nhap">Đăng nhập</Link>
                <Link href="/dang-ky" className="btn">Đăng ký</Link>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx` (placeholder, replaced in Task 10):
```tsx
export default function Home() {
  return <h1 className="text-xl font-semibold">Shop tài khoản</h1>;
}
```

- [ ] **Step 4: Auth actions and pages**

`apps/web/src/app/auth-actions.ts`:
```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { rateLimit } from '@/lib/rate-limit';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '@/lib/session';

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export async function registerAction(form: FormData) {
  try {
    if (!rateLimit(`register:${await clientIp()}`, 10, 60 * 60_000)) {
      throw new core.AppError('RATE_LIMITED', 'Thử lại sau ít phút');
    }
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    await core.registerUser({ email, password, name: String(form.get('name') ?? '') });
    const { token } = await core.login(email, password);
    await setSessionCookie(token);
  } catch (e) {
    fail('/dang-ky', e);
  }
  redirect('/');
}

export async function loginAction(form: FormData) {
  try {
    if (!rateLimit(`login:${await clientIp()}`, 10, 10 * 60_000)) {
      throw new core.AppError('RATE_LIMITED', 'Đăng nhập sai quá nhiều lần, thử lại sau 10 phút');
    }
    const { token } = await core.login(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
    await setSessionCookie(token);
  } catch (e) {
    fail('/dang-nhap', e);
  }
  redirect('/');
}

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) await core.logout(token);
  await clearSessionCookie();
  redirect('/');
}
```

`apps/web/src/app/dang-ky/page.tsx`:
```tsx
import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { registerAction } from '../auth-actions';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="mb-4 text-xl font-semibold">Đăng ký</h1>
      <Flash searchParams={await searchParams} />
      <form action={registerAction} className="space-y-3">
        <input name="name" placeholder="Tên hiển thị" required className="input" />
        <input name="email" type="email" placeholder="Email" required className="input" />
        <input name="password" type="password" placeholder="Mật khẩu (tối thiểu 8 ký tự)" minLength={8} required className="input" />
        <button className="btn w-full">Tạo tài khoản</button>
      </form>
      <p className="mt-3 text-sm">Đã có tài khoản? <Link href="/dang-nhap" className="text-blue-700">Đăng nhập</Link></p>
    </div>
  );
}
```

`apps/web/src/app/dang-nhap/page.tsx`:
```tsx
import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { loginAction } from '../auth-actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="mb-4 text-xl font-semibold">Đăng nhập</h1>
      <Flash searchParams={await searchParams} />
      <form action={loginAction} className="space-y-3">
        <input name="email" type="email" placeholder="Email" required className="input" />
        <input name="password" type="password" placeholder="Mật khẩu" required className="input" />
        <button className="btn w-full">Đăng nhập</button>
      </form>
      <p className="mt-3 text-sm">Chưa có tài khoản? <Link href="/dang-ky" className="text-blue-700">Đăng ký</Link></p>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run (DB running): `npm run dev`, then open http://localhost:3000.
Expected:
1. Register at `/dang-ky` → redirected to `/` with balance `0đ` in the header.
2. Log out → header shows Đăng nhập. Wrong password at `/dang-nhap` shows a red "Sai email hoặc mật khẩu".
3. Log in again → works.

If pages throw `DATABASE_URL is not set`, the root `.env` was not loaded. Confirm `.env` exists at the repo root. As a fallback, change the `dev` script to `node --env-file=../../.env ../../node_modules/next/dist/bin/next dev -p 3000`.

Run: `npm run typecheck -w @web12/web` → no errors (run `npm run dev` once first so `.next/types` exists).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): Next.js scaffold, sessions, register/login/logout"
```


---

### Task 10: Storefront, purchase, order history

**Files:**
- Create: `apps/web/src/components/ProductCard.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/danh-muc/[slug]/page.tsx`, `apps/web/src/app/san-pham/[slug]/page.tsx`, `apps/web/src/app/san-pham/[slug]/actions.ts`
- Create: `apps/web/src/app/don-hang/page.tsx`, `apps/web/src/app/don-hang/[id]/page.tsx`

**Interfaces:**
- Consumes: `core.listCategories`, `core.getCategoryBySlug`, `core.listProducts`, `core.getProductBySlug`, `core.priceForTier`, `core.purchase`, `core.listOrdersForUser`, `core.getOrderForUser`, `core.getOrderSecrets`; session and format helpers from Task 9.
- Produces: `buyAction(form)`. It reads the form fields `productId`, `slug`, `quantity` and redirects to `/don-hang/<id>` on success.

- [ ] **Step 1: Product card + home + category page**

`apps/web/src/components/ProductCard.tsx`:
```tsx
import Link from 'next/link';
import type { Product, Tier } from '@web12/core';
import { core } from '@/lib/core';
import { formatVnd, TYPE_LABEL } from '@/lib/format';

export function ProductCard({ product, tier }: { product: Product; tier: Tier }) {
  const soldOut = product.stock === 0;
  return (
    <Link href={`/san-pham/${product.slug}`} className="card block hover:shadow">
      {product.images[0] && <img src={product.images[0]} alt="" className="mb-2 h-32 w-full rounded object-cover" />}
      <div className="text-xs text-gray-500">{TYPE_LABEL[product.type]}</div>
      <div className="font-medium">{product.name}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-semibold text-blue-700">{formatVnd(core.priceForTier(product, tier))}</span>
        <span className={`text-xs ${soldOut ? 'text-red-600' : 'text-gray-500'}`}>
          {product.stock === null ? 'Luôn có hàng' : soldOut ? 'Hết hàng' : `Còn ${product.stock}`}
        </span>
      </div>
    </Link>
  );
}
```

`apps/web/src/app/page.tsx`:
```tsx
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { core } from '@/lib/core';
import { getCurrentUser } from '@/lib/session';

export default async function Home() {
  const [user, categories, products] = await Promise.all([getCurrentUser(), core.listCategories(), core.listProducts()]);
  const tier = user?.tier ?? 'MEMBER';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link key={c.id} href={`/danh-muc/${c.slug}`} className="btn-secondary text-sm">{c.name}</Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} tier={tier} />)}
      </div>
      {products.length === 0 && <p className="text-gray-500">Chưa có sản phẩm.</p>}
    </div>
  );
}
```

`apps/web/src/app/danh-muc/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';
import { core } from '@/lib/core';
import { getCurrentUser } from '@/lib/session';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await core.getCategoryBySlug(slug);
  if (!category) notFound();
  const [user, products] = await Promise.all([getCurrentUser(), core.listProducts({ categoryId: category.id })]);
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{category.name}</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} tier={user?.tier ?? 'MEMBER'} />)}
      </div>
      {products.length === 0 && <p className="text-gray-500">Danh mục chưa có sản phẩm.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Product page + buy action**

`apps/web/src/app/san-pham/[slug]/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { requireUser } from '@/lib/session';

export async function buyAction(form: FormData) {
  const user = await requireUser();
  const slug = String(form.get('slug') ?? '');
  let orderId: number;
  try {
    const order = await core.purchase(user.id, Number(form.get('productId')), Number(form.get('quantity') ?? 1), {
      source: 'WEB',
      idempotencyKey: String(form.get('requestId') ?? '') || null,
    });
    orderId = order.id;
  } catch (e) {
    fail(`/san-pham/${slug}`, e);
  }
  redirect(`/don-hang/${orderId}`);
}
```

`apps/web/src/app/san-pham/[slug]/page.tsx`:
```tsx
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatVnd, TIER_LABEL, TYPE_LABEL } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { buyAction } from './actions';

export default async function ProductPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const product = await core.getProductBySlug(slug);
  if (!product || !product.active) notFound();
  const user = await getCurrentUser();
  const tier = user?.tier ?? 'MEMBER';
  const price = core.priceForTier(product, tier);
  const maxQty = product.type === 'UNIQUE' ? 1 : Math.min(100, product.stock ?? 100);
  const soldOut = product.stock === 0;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        {product.images.map((src) => <img key={src} src={src} alt="" className="w-full rounded" />)}
      </div>
      <div className="card space-y-3">
        <div className="text-xs text-gray-500">{TYPE_LABEL[product.type]}</div>
        <h1 className="text-xl font-semibold">{product.name}</h1>
        <div className="text-2xl font-semibold text-blue-700">
          {formatVnd(price)} <span className="text-sm font-normal text-gray-500">giá {TIER_LABEL[tier]}</span>
        </div>
        {Object.keys(product.attributes).length > 0 && (
          <dl className="grid grid-cols-2 gap-1 text-sm">
            {Object.entries(product.attributes).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
        <p className="whitespace-pre-line text-sm">{product.description}</p>
        <Flash searchParams={await searchParams} />
        {!user ? (
          <Link href="/dang-nhap" className="btn">Đăng nhập để mua</Link>
        ) : soldOut ? (
          <p className="font-medium text-red-600">Hết hàng</p>
        ) : (
          <form action={buyAction} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="slug" value={product.slug} />
            <input type="hidden" name="requestId" value={randomUUID()} />
            <input name="quantity" type="number" min={1} max={maxQty} defaultValue={1}
              readOnly={product.type === 'UNIQUE'} className="input w-24" />
            <button className="btn">Mua ngay</button>
          </form>
        )}
      </div>
    </div>
  );
}
```

The hidden `requestId` is used as the idempotency key, so a double-click or resubmitted form creates only one order.

- [ ] **Step 3: Order list + detail**

`apps/web/src/app/don-hang/page.tsx`:
```tsx
import Link from 'next/link';
import { core } from '@/lib/core';
import { formatDate, formatVnd, STATUS_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await core.listOrdersForUser(user.id);
  return (
    <div className="card">
      <h1 className="mb-4 text-xl font-semibold">Đơn hàng của bạn</h1>
      <table className="table">
        <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Tổng</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/don-hang/${o.id}`} className="text-blue-700">#{o.id}</Link></td>
              <td>{o.productName}</td><td>{o.quantity}</td><td>{formatVnd(o.total)}</td>
              <td>{STATUS_LABEL[o.status]}</td><td>{formatDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className="mt-3 text-gray-500">Chưa có đơn hàng.</p>}
    </div>
  );
}
```

`apps/web/src/app/don-hang/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { core } from '@/lib/core';
import { formatDate, formatVnd, STATUS_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const order = Number.isSafeInteger(id) ? await core.getOrderForUser(id, user.id).catch(() => null) : null;
  if (!order) notFound();
  const secrets = order.status === 'COMPLETED' ? await core.getOrderSecrets(order.id) : [];

  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-semibold">Đơn #{order.id}: {order.productName}</h1>
      <div className="text-sm text-gray-600">
        {order.quantity} × {formatVnd(order.unitPrice)} = <b>{formatVnd(order.total)}</b> · {STATUS_LABEL[order.status]} · {formatDate(order.createdAt)}
      </div>
      {order.status === 'PENDING' && (
        <p className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          Đơn đang được xử lý từ nhà cung cấp. Tải lại trang sau ít giây.
        </p>
      )}
      {order.status === 'REFUNDED' && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">Đơn thất bại và đã hoàn tiền: {order.error}</p>
      )}
      {secrets.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium">Tài khoản đã mua ({secrets.length})</div>
          <textarea readOnly rows={Math.min(15, secrets.length + 1)} className="input font-mono text-sm" value={secrets.join('\n')} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Products only exist after seeding (Task 14). For now, check that `/`, `/don-hang` and an unknown `/san-pham/x` (should 404) render without errors. Full purchase flow is verified in Task 14.

Run: `npm run typecheck -w @web12/web` → no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): storefront, product purchase, order history with delivered accounts"
```


---

### Task 11: Top-up page, bank webhook, account page (API keys, wallet history)

**Files:**
- Create: `apps/web/src/app/nap-tien/page.tsx`
- Create: `apps/web/src/app/api/webhooks/bank/route.ts`
- Create: `apps/web/src/app/tai-khoan/page.tsx`, `apps/web/src/app/tai-khoan/actions.ts`
- Create: `scripts/fake-topup.mjs` (dev helper)

**Interfaces:**
- Consumes: `core.handleBankWebhook`, `core.safeEqual`, `core.createApiKey`, `core.listApiKeys`, `core.revokeApiKey`, `core.listLedger`; env vars `WEBHOOK_TOKEN`, `BANK_ID`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`.
- Produces:
  - `POST /api/webhooks/bank`
    - Requires header `Authorization: Apikey <WEBHOOK_TOKEN>`; a bad or missing token gets `401`.
    - Body is the SePay JSON.
    - Valid payloads get `200 { success: true, status }`, where `status` is `MATCHED | UNMATCHED | IGNORED | DUPLICATE`. Malformed payloads get `400`.
  - `createApiKeyAction(form)`, `revokeApiKeyAction(form)`

- [ ] **Step 1: Webhook route**

`apps/web/src/app/api/webhooks/bank/route.ts`:
```ts
import type { BankWebhookPayload } from '@web12/core';
import { core } from '@/lib/core';

export async function POST(req: Request) {
  const expected = process.env.WEBHOOK_TOKEN;
  const auth = req.headers.get('authorization') ?? '';
  if (!expected || !core.safeEqual(auth, `Apikey ${expected}`)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  let payload: BankWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const result = await core.handleBankWebhook(payload);
    return Response.json({ success: true, status: result.status });
  } catch (e) {
    if (core.isAppError(e)) return Response.json({ success: false, error: e.message }, { status: e.status });
    console.error('bank webhook failed', e);
    return Response.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Top-up page**

`apps/web/src/app/nap-tien/page.tsx`:
```tsx
import { core } from '@/lib/core';
import { formatDate, formatVnd } from '@/lib/format';
import { requireUser } from '@/lib/session';

export default async function TopupPage() {
  const user = await requireUser();
  const bankId = process.env.BANK_ID ?? '';
  const account = process.env.BANK_ACCOUNT ?? '';
  const accountName = process.env.BANK_ACCOUNT_NAME ?? '';
  const qr = `https://img.vietqr.io/image/${bankId}-${account}-compact2.png?addInfo=${encodeURIComponent(user.topupCode)}&accountName=${encodeURIComponent(accountName)}`;
  const history = (await core.listLedger(user.id, 20)).filter((e) => e.type === 'TOPUP');

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">Nạp tiền vào ví</h1>
        <p className="text-sm">Số dư hiện tại: <b>{formatVnd(user.balance)}</b></p>
        <img src={qr} alt="VietQR" className="mx-auto w-64" />
        <dl className="grid grid-cols-3 gap-1 text-sm">
          <dt className="text-gray-500">Ngân hàng</dt><dd className="col-span-2">{bankId}</dd>
          <dt className="text-gray-500">Số tài khoản</dt><dd className="col-span-2 font-mono">{account}</dd>
          <dt className="text-gray-500">Chủ tài khoản</dt><dd className="col-span-2">{accountName}</dd>
          <dt className="text-gray-500">Nội dung</dt><dd className="col-span-2 font-mono text-lg font-semibold text-red-600">{user.topupCode}</dd>
        </dl>
        <p className="text-xs text-gray-500">
          Ghi đúng nội dung chuyển khoản. Tiền được cộng tự động sau khoảng 1 phút.
          Nếu ghi sai nội dung, hãy liên hệ admin để được cộng tay.
        </p>
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold">Lịch sử nạp</h2>
        <table className="table">
          <tbody>
            {history.map((e) => (
              <tr key={e.id}><td>{formatDate(e.createdAt)}</td><td className="text-green-700">+{formatVnd(e.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && <p className="text-sm text-gray-500">Chưa có giao dịch nạp.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Account page (API keys + wallet history)**

`apps/web/src/app/tai-khoan/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { requireUser } from '@/lib/session';

export async function createApiKeyAction(form: FormData) {
  const user = await requireUser();
  let key: string;
  try {
    ({ key } = await core.createApiKey(user.id, String(form.get('name') ?? '')));
  } catch (e) {
    fail('/tai-khoan', e);
  }
  // Shown once: the plaintext key is never stored.
  redirect(`/tai-khoan?newKey=${encodeURIComponent(key)}`);
}

export async function revokeApiKeyAction(form: FormData) {
  const user = await requireUser();
  try {
    await core.revokeApiKey(user.id, Number(form.get('id')));
  } catch (e) {
    fail('/tai-khoan', e);
  }
  redirect('/tai-khoan?ok=' + encodeURIComponent('Đã thu hồi khóa'));
}
```

`apps/web/src/app/tai-khoan/page.tsx`:
```tsx
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatDate, formatVnd, TIER_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { createApiKeyAction, revokeApiKeyAction } from './actions';

const LEDGER_LABEL = { TOPUP: 'Nạp tiền', PURCHASE: 'Mua hàng', REFUND: 'Hoàn tiền', ADJUST: 'Điều chỉnh' } as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [keys, ledger] = await Promise.all([core.listApiKeys(user.id), core.listLedger(user.id, 50)]);

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">{user.name}</h1>
        <p className="text-sm text-gray-600">{user.email} · Cấp: {TIER_LABEL[user.tier]} · Số dư: {formatVnd(user.balance)}</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Khóa API (dành cho đại lý)</h2>
        <Flash searchParams={sp} />
        {sp.newKey && (
          <div className="rounded bg-yellow-50 p-3 text-sm">
            Khóa mới. Hãy lưu lại ngay, khóa sẽ không hiển thị lần nữa:
            <div className="mt-1 break-all font-mono font-semibold">{sp.newKey}</div>
          </div>
        )}
        <form action={createApiKeyAction} className="flex gap-2">
          <input name="name" placeholder="Tên khóa (vd: bot của tôi)" className="input" />
          <button className="btn whitespace-nowrap">Tạo khóa</button>
        </form>
        <table className="table">
          <thead><tr><th>Tên</th><th>Tiền tố</th><th>Dùng lần cuối</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="font-mono">{k.prefix}…</td>
                <td>{k.lastUsedAt ? formatDate(k.lastUsedAt) : '-'}</td>
                <td>
                  {k.revokedAt ? <span className="text-gray-400">Đã thu hồi</span> : (
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <button className="text-red-600">Thu hồi</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500">
          Tài liệu: gửi header <code>X-API-Key</code> tới <code>/api/v1/products</code>, <code>/api/v1/balance</code>,
          <code> POST /api/v1/orders</code> ({'{ productId, quantity }'}, header <code>Idempotency-Key</code> tùy chọn),
          <code> GET /api/v1/orders/:id</code>.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Lịch sử ví</h2>
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Loại</th><th>Số tiền</th><th>Số dư sau</th><th>Ghi chú</th></tr></thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.createdAt)}</td>
                <td>{LEDGER_LABEL[e.type]}</td>
                <td className={e.amount > 0 ? 'text-green-700' : 'text-red-600'}>{e.amount > 0 ? '+' : ''}{formatVnd(e.amount)}</td>
                <td>{formatVnd(e.balanceAfter)}</td>
                <td className="text-gray-500">{e.refType === 'order' ? `Đơn #${e.refId}` : e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Dev helper to simulate a bank transfer**

`scripts/fake-topup.mjs`:
```js
// Usage: node --env-file=.env scripts/fake-topup.mjs NAP1 200000
const [code, amount = '100000'] = process.argv.slice(2);
if (!code) {
  console.error('Usage: node --env-file=.env scripts/fake-topup.mjs <NAPxx> [amount]');
  process.exit(1);
}
const res = await fetch('http://localhost:3000/api/webhooks/bank', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Apikey ${process.env.WEBHOOK_TOKEN}` },
  body: JSON.stringify({
    id: Date.now(), gateway: 'MBBank', transferType: 'in', transferAmount: Number(amount),
    content: `CT ${code} chuyen tien`, transactionDate: new Date().toISOString(),
  }),
});
console.log(res.status, await res.json());
```

Root `package.json` scripts: add `"fake:topup": "node --env-file=.env scripts/fake-topup.mjs"`.

- [ ] **Step 5: Verify**

With `npm run dev` running and a registered user whose code is `NAP1`:
```bash
npm run fake:topup -- NAP1 200000
```
Expected: `200 { success: true, status: 'MATCHED' }`. The header balance shows `200.000đ`, and `/tai-khoan` shows a "Nạp tiền" row.

Then:
- `curl -s -X POST localhost:3000/api/webhooks/bank -d '{}'` → `401`.
- Creating a key on `/tai-khoan` shows it once; "Thu hồi" marks it revoked.

Run: `npm run typecheck -w @web12/web` → no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): VietQR top-up page, SePay webhook, API key management, wallet history"
```


---

### Task 12: Reseller API `/api/v1`

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/app/api/v1/products/route.ts`, `apps/web/src/app/api/v1/balance/route.ts`
- Create: `apps/web/src/app/api/v1/orders/route.ts`, `apps/web/src/app/api/v1/orders/[id]/route.ts`
- Create: `scripts/api-smoke.mjs`

**Interfaces:**
- Consumes: `core.getUserByApiKey`, `core.listProducts`, `core.priceForTier`, `core.purchase`, `core.getOrderForUser`, `core.getOrderSecrets`, `core.isAppError`; `rateLimit` from Task 9.
- Produces:
  - `withApiUser(handler: (user: User, req: Request) => Promise<Response>): (req: Request) => Promise<Response>`, which handles auth, the rate limit (60 requests/min per key) and the error envelope.
  - `apiError(code: string, message: string, status: number): Response`
  - `serializeOrder(order: Order): Promise<ApiOrder>`. The result includes `accounts` only when the order is COMPLETED.
  - HTTP API (all JSON; errors are `{ error: { code, message } }`):
    - `GET /api/v1/products` → `{ products: [{ id, name, category_id, type, price, stock }] }`, with `price` set for the caller's tier.
    - `GET /api/v1/balance` → `{ balance, tier }`
    - `POST /api/v1/orders`
      - Body `{ productId, quantity }`, optional header `Idempotency-Key`.
      - Returns `200 { order }`; an idempotent replay returns the same order.
    - `GET /api/v1/orders/:id` → `{ order }`

- [ ] **Step 1: `apps/web/src/lib/api.ts`**

```ts
import type { Order, User } from '@web12/core';
import { core } from './core';
import { rateLimit } from './rate-limit';

export interface ApiOrder {
  id: number;
  status: Order['status'];
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  error: string | null;
  created_at: string;
  accounts?: string[];
}

export function apiError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function withApiUser(handler: (user: User, req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const key = req.headers.get('x-api-key') ?? '';
    if (!key) return apiError('UNAUTHORIZED', 'Thiếu header X-API-Key', 401);
    if (!rateLimit(`api:${key}`, 60, 60_000)) return apiError('RATE_LIMITED', 'Quá 60 request/phút', 429);
    try {
      const user = await core.getUserByApiKey(key);
      if (!user) return apiError('UNAUTHORIZED', 'API key không hợp lệ hoặc đã bị thu hồi', 401);
      return await handler(user, req);
    } catch (e) {
      if (core.isAppError(e)) return apiError(e.code, e.message, e.status);
      console.error('api error', e);
      return apiError('INTERNAL', 'Lỗi hệ thống', 500);
    }
  };
}

export async function serializeOrder(o: Order): Promise<ApiOrder> {
  return {
    id: o.id,
    status: o.status,
    product_id: o.productId,
    product_name: o.productName,
    quantity: o.quantity,
    unit_price: o.unitPrice,
    total: o.total,
    error: o.error,
    created_at: new Date(o.createdAt).toISOString(),
    ...(o.status === 'COMPLETED' ? { accounts: await core.getOrderSecrets(o.id) } : {}),
  };
}
```

- [ ] **Step 2: Routes**

`apps/web/src/app/api/v1/products/route.ts`:
```ts
import { withApiUser } from '@/lib/api';
import { core } from '@/lib/core';

export const GET = withApiUser(async (user) => {
  const products = await core.listProducts();
  return Response.json({
    products: products.map((p) => ({
      id: p.id, name: p.name, category_id: p.categoryId, type: p.type,
      price: core.priceForTier(p, user.tier), stock: p.stock,
    })),
  });
});
```

`apps/web/src/app/api/v1/balance/route.ts`:
```ts
import { withApiUser } from '@/lib/api';

export const GET = withApiUser(async (user) => Response.json({ balance: user.balance, tier: user.tier }));
```

`apps/web/src/app/api/v1/orders/route.ts`:
```ts
import { apiError, serializeOrder, withApiUser } from '@/lib/api';
import { core } from '@/lib/core';

export const POST = withApiUser(async (user, req) => {
  const body = (await req.json().catch(() => null)) as { productId?: unknown; quantity?: unknown } | null;
  const productId = Number(body?.productId);
  const quantity = Number(body?.quantity ?? 1);
  if (!Number.isSafeInteger(productId)) return apiError('INVALID_INPUT', 'productId không hợp lệ', 400);

  // Same Idempotency-Key → core returns the existing order instead of charging again.
  const idempotencyKey = req.headers.get('idempotency-key');
  const order = await core.purchase(user.id, productId, quantity, { source: 'API', idempotencyKey });
  return Response.json({ order: await serializeOrder(order) });
});
```

`apps/web/src/app/api/v1/orders/[id]/route.ts`:
```ts
import { apiError, serializeOrder, withApiUser } from '@/lib/api';
import { core } from '@/lib/core';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  return withApiUser(async (user) => {
    if (!Number.isSafeInteger(id)) return apiError('INVALID_INPUT', 'id không hợp lệ', 400);
    const order = await core.getOrderForUser(id, user.id);
    return Response.json({ order: await serializeOrder(order) });
  })(req);
}
```

- [ ] **Step 3: Smoke script**

`scripts/api-smoke.mjs`:
```js
// Usage: node scripts/api-smoke.mjs <API_KEY> [productId]
const [key, productIdArg] = process.argv.slice(2);
if (!key) {
  console.error('Usage: node scripts/api-smoke.mjs <API_KEY> [productId]');
  process.exit(1);
}
const base = 'http://localhost:3000/api/v1';
const call = async (path, init = {}) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'x-api-key': key, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json();
  console.log(init.method ?? 'GET', path, res.status, JSON.stringify(body, null, 2));
  return body;
};

await call('/balance');
const { products } = await call('/products');
const productId = Number(productIdArg ?? products.find((p) => p.stock !== 0)?.id);
const idem = `smoke-${Date.now()}`;
const { order } = await call('/orders', {
  method: 'POST', headers: { 'idempotency-key': idem }, body: JSON.stringify({ productId, quantity: 1 }),
});
await call('/orders', { method: 'POST', headers: { 'idempotency-key': idem }, body: JSON.stringify({ productId, quantity: 1 }) });
if (order) await call(`/orders/${order.id}`);
await call('/balance');
```

Root `package.json` scripts: add `"api:smoke": "node scripts/api-smoke.mjs"`.

- [ ] **Step 4: Verify**

With the dev server running, create a key on `/tai-khoan` for a user with balance (use `fake:topup`), then run:
```bash
npm run api:smoke -- sk_xxx
```
Expected:
- `/balance` returns 200.
- `/products` returns a list.
- The first POST returns `200` with `accounts` for a STOCK product. The second POST with the same `Idempotency-Key` returns the same order id.
- The balance drops by exactly one unit price.

Also:
- `curl -s localhost:3000/api/v1/balance` → `401 { error: { code: 'UNAUTHORIZED' } }`.
- `GET /api/v1/orders/<someone else's id>` → `404`.

Run: `npm run typecheck -w @web12/web` → no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): reseller API v1 (products, balance, idempotent orders) with rate limit"
```


---

### Task 13: Admin area

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`, `apps/web/src/app/admin/page.tsx`, `apps/web/src/app/admin/actions.ts`
- Create: `apps/web/src/app/admin/danh-muc/page.tsx`
- Create: `apps/web/src/app/admin/san-pham/page.tsx`, `apps/web/src/app/admin/san-pham/ProductForm.tsx`, `apps/web/src/app/admin/san-pham/moi/page.tsx`, `apps/web/src/app/admin/san-pham/[id]/page.tsx`
- Create: `apps/web/src/app/admin/nguoi-dung/page.tsx`, `apps/web/src/app/admin/giao-dich/page.tsx`, `apps/web/src/app/admin/nha-cung-cap/page.tsx`, `apps/web/src/app/admin/don-hang/page.tsx`

**Interfaces:**
- Consumes (core): `createCategory`, `listCategories`, `createProduct`, `updateProduct`, `getProduct`, `listProducts`, `addStock`, `listUsers`, `setUserTier`, `setUserRole`, `adjustBalance`, `listBankTxns`, `assignBankTxn`, `createSupplier`, `updateSupplier`, `listSuppliers`, `listAllOrders`, `getUser`, `TIERS`, `ROLES`, `AppError`.
- Produces: server actions in `admin/actions.ts`:
  - `createCategoryAction`, `saveProductAction` (create when `id` is empty, otherwise update), `addStockAction`
  - `setTierAction`, `setRoleAction`, `adjustBalanceAction`
  - `assignTxnAction`, `saveSupplierAction`
- Permissions:
  - STAFF and ADMIN can open `/admin` and manage catalog, stock and suppliers.
  - Only ADMIN can change roles, adjust balances or assign bank transactions; other users get `FORBIDDEN`.

- [ ] **Step 1: Layout + overview**

`apps/web/src/app/admin/layout.tsx`:
```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireStaff } from '@/lib/session';

const LINKS = [
  ['/admin', 'Tổng quan'], ['/admin/san-pham', 'Sản phẩm'], ['/admin/danh-muc', 'Danh mục'],
  ['/admin/don-hang', 'Đơn hàng'], ['/admin/nguoi-dung', 'Người dùng'], ['/admin/giao-dich', 'Giao dịch NH'],
  ['/admin/nha-cung-cap', 'Nhà cung cấp'],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <nav className="flex flex-col gap-1 text-sm">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-gray-100">{label}</Link>)}
      </nav>
      <div>{children}</div>
    </div>
  );
}
```

`apps/web/src/app/admin/page.tsx`:
```tsx
import Link from 'next/link';
import { core } from '@/lib/core';

export default async function AdminHome() {
  const [pending, unmatched, products] = await Promise.all([
    core.listAllOrders({ status: 'PENDING' }), core.listBankTxns({ status: 'UNMATCHED' }), core.listProducts({ activeOnly: false }),
  ]);
  const lowStock = products.filter((p) => p.stock !== null && p.stock < 5 && p.active);
  const tiles = [
    ['Đơn đang xử lý', pending.length, '/admin/don-hang?status=PENDING'],
    ['Giao dịch chưa khớp', unmatched.length, '/admin/giao-dich'],
    ['Sản phẩm sắp hết (<5)', lowStock.length, '/admin/san-pham'],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tiles.map(([label, n, href]) => (
        <Link key={label} href={href} className="card block">
          <div className="text-sm text-gray-500">{label}</div>
          <div className="text-3xl font-semibold">{n}</div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Admin actions**

`apps/web/src/app/admin/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ProductType, Role, Tier } from '@web12/core';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { requireStaff } from '@/lib/session';

async function requireAdmin() {
  const user = await requireStaff();
  if (user.role !== 'ADMIN') throw new core.AppError('FORBIDDEN', 'Chỉ ADMIN được thực hiện thao tác này');
  return user;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const int = (f: FormData, k: string) => Number(str(f, k).replace(/[.,\s]/g, ''));
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function ok(path: string, message: string): never {
  revalidatePath(path);
  redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(message)}`);
}

export async function createCategoryAction(f: FormData) {
  try {
    await requireStaff();
    await core.createCategory({ name: str(f, 'name'), slug: str(f, 'slug') || undefined, sortOrder: int(f, 'sortOrder') || 0 });
  } catch (e) { fail('/admin/danh-muc', e); }
  ok('/admin/danh-muc', 'Đã tạo danh mục');
}

export async function saveProductAction(f: FormData) {
  const id = int(f, 'id');
  const back = id ? `/admin/san-pham/${id}` : '/admin/san-pham/moi';
  let savedId: number;
  try {
    await requireStaff();
    const attributes = Object.fromEntries(
      lines(str(f, 'attributes')).map((l) => {
        const i = l.indexOf(':');
        return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, ''];
      }),
    );
    const input = {
      categoryId: int(f, 'categoryId'),
      name: str(f, 'name'),
      slug: str(f, 'slug') || undefined,
      description: str(f, 'description'),
      images: lines(str(f, 'images')),
      attributes,
      type: str(f, 'type') as ProductType,
      priceMember: int(f, 'priceMember'),
      priceCtv: int(f, 'priceCtv'),
      priceAgent: int(f, 'priceAgent'),
      active: f.get('active') === 'on',
      supplierId: int(f, 'supplierId') || null,
      supplierSku: str(f, 'supplierSku') || null,
    };
    savedId = id ? (await core.updateProduct(id, input)).id : (await core.createProduct(input)).id;
  } catch (e) { fail(back, e); }
  ok(`/admin/san-pham/${savedId}`, 'Đã lưu sản phẩm');
}

export async function addStockAction(f: FormData) {
  const id = int(f, 'productId');
  let n: number;
  try {
    await requireStaff();
    n = await core.addStock(id, lines(str(f, 'lines')));
  } catch (e) { fail(`/admin/san-pham/${id}`, e); }
  ok(`/admin/san-pham/${id}`, `Đã nhập ${n} tài khoản`);
}

export async function setTierAction(f: FormData) {
  try {
    await requireStaff();
    await core.setUserTier(int(f, 'userId'), str(f, 'tier') as Tier);
  } catch (e) { fail('/admin/nguoi-dung', e); }
  ok('/admin/nguoi-dung', 'Đã đổi cấp');
}

export async function setRoleAction(f: FormData) {
  try {
    await requireAdmin();
    await core.setUserRole(int(f, 'userId'), str(f, 'role') as Role);
  } catch (e) { fail('/admin/nguoi-dung', e); }
  ok('/admin/nguoi-dung', 'Đã đổi vai trò');
}

export async function adjustBalanceAction(f: FormData) {
  try {
    const admin = await requireAdmin();
    const amount = Number(str(f, 'amount').replace(/[.,\s]/g, ''));
    await core.adjustBalance(int(f, 'userId'), amount, str(f, 'note'), admin.id);
  } catch (e) { fail('/admin/nguoi-dung', e); }
  ok('/admin/nguoi-dung', 'Đã điều chỉnh số dư');
}

export async function assignTxnAction(f: FormData) {
  try {
    const admin = await requireAdmin();
    const who = str(f, 'user');
    const userId = /^\d+$/.test(who) ? Number(who) : (await core.listUsers({ q: who, limit: 2 })).find((u) => u.email === who.toLowerCase())?.id;
    if (!userId || !(await core.getUser(userId))) throw new core.AppError('NOT_FOUND', 'Không tìm thấy người dùng');
    await core.assignBankTxn(int(f, 'txnId'), userId, admin.id);
  } catch (e) { fail('/admin/giao-dich', e); }
  ok('/admin/giao-dich', 'Đã cộng tiền');
}

export async function saveSupplierAction(f: FormData) {
  try {
    await requireStaff();
    const id = int(f, 'id');
    const base = { name: str(f, 'name'), baseUrl: str(f, 'baseUrl'), apiKey: str(f, 'apiKey') };
    if (id) await core.updateSupplier(id, { ...base, active: f.get('active') === 'on' });
    else await core.createSupplier(base);
  } catch (e) { fail('/admin/nha-cung-cap', e); }
  ok('/admin/nha-cung-cap', 'Đã lưu nhà cung cấp');
}
```

- [ ] **Step 3: Categories page**

`apps/web/src/app/admin/danh-muc/page.tsx`:
```tsx
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { createCategoryAction } from '../actions';

export default async function AdminCategories({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const categories = await core.listCategories();
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Danh mục</h1>
      <Flash searchParams={await searchParams} />
      <form action={createCategoryAction} className="flex gap-2">
        <input name="name" placeholder="Tên danh mục" required className="input" />
        <input name="slug" placeholder="slug (tự tạo nếu trống)" className="input" />
        <input name="sortOrder" placeholder="Thứ tự" className="input w-24" />
        <button className="btn whitespace-nowrap">Thêm</button>
      </form>
      <table className="table">
        <thead><tr><th>#</th><th>Tên</th><th>Slug</th><th>Thứ tự</th></tr></thead>
        <tbody>{categories.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.name}</td><td>{c.slug}</td><td>{c.sortOrder}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Product list, form, create and edit pages**

`apps/web/src/app/admin/san-pham/page.tsx`:
```tsx
import Link from 'next/link';
import { core } from '@/lib/core';
import { formatVnd, TYPE_LABEL } from '@/lib/format';

export default async function AdminProducts() {
  const products = await core.listProducts({ activeOnly: false });
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sản phẩm</h1>
        <Link href="/admin/san-pham/moi" className="btn">+ Thêm sản phẩm</Link>
      </div>
      <table className="table">
        <thead><tr><th>#</th><th>Tên</th><th>Loại</th><th>Giá TV/CTV/ĐL</th><th>Tồn</th><th>Bán</th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td><Link href={`/admin/san-pham/${p.id}`} className="text-blue-700">{p.name}</Link></td>
              <td>{TYPE_LABEL[p.type]}</td>
              <td>{formatVnd(p.priceMember)} / {formatVnd(p.priceCtv)} / {formatVnd(p.priceAgent)}</td>
              <td>{p.stock ?? '∞'}</td>
              <td>{p.active ? 'Đang bán' : 'Ẩn'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`apps/web/src/app/admin/san-pham/ProductForm.tsx`:
```tsx
import type { Category, Product, Supplier } from '@web12/core';
import { saveProductAction } from '../actions';

export function ProductForm({ product, categories, suppliers }: { product?: Product; categories: Category[]; suppliers: Supplier[] }) {
  const p = product;
  return (
    <form action={saveProductAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={p?.id ?? ''} />
      <label className="text-sm">Tên<input name="name" defaultValue={p?.name} required className="input" /></label>
      <label className="text-sm">Slug<input name="slug" defaultValue={p?.slug} placeholder="tự tạo nếu trống" className="input" /></label>
      <label className="text-sm">Danh mục
        <select name="categoryId" defaultValue={p?.categoryId} className="input">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="text-sm">Loại
        <select name="type" defaultValue={p?.type ?? 'STOCK'} className="input">
          <option value="STOCK">Kho (STOCK)</option>
          <option value="UNIQUE">Hàng riêng (UNIQUE)</option>
          <option value="API">Nguồn API</option>
        </select>
      </label>
      <label className="text-sm">Giá Thành viên<input name="priceMember" defaultValue={p?.priceMember} required className="input" /></label>
      <label className="text-sm">Giá CTV<input name="priceCtv" defaultValue={p?.priceCtv} required className="input" /></label>
      <label className="text-sm">Giá Đại lý<input name="priceAgent" defaultValue={p?.priceAgent} required className="input" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Đang bán</label>
      <label className="text-sm">Nhà cung cấp (chỉ cho loại API)
        <select name="supplierId" defaultValue={p?.supplierId ?? ''} className="input">
          <option value="">-</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="text-sm">SKU bên nguồn<input name="supplierSku" defaultValue={p?.supplierSku ?? ''} className="input" /></label>
      <label className="text-sm md:col-span-2">Mô tả<textarea name="description" defaultValue={p?.description} rows={4} className="input" /></label>
      <label className="text-sm">Ảnh (mỗi dòng 1 URL)<textarea name="images" defaultValue={p?.images.join('\n')} rows={3} className="input" /></label>
      <label className="text-sm">Thuộc tính (mỗi dòng "tên: giá trị")
        <textarea name="attributes" rows={3} className="input"
          defaultValue={p ? Object.entries(p.attributes).map(([k, v]) => `${k}: ${v}`).join('\n') : ''} />
      </label>
      <div className="md:col-span-2"><button className="btn">Lưu</button></div>
    </form>
  );
}
```

`apps/web/src/app/admin/san-pham/moi/page.tsx`:
```tsx
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { ProductForm } from '../ProductForm';

export default async function NewProduct({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [categories, suppliers] = await Promise.all([core.listCategories(), core.listSuppliers()]);
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Thêm sản phẩm</h1>
      <Flash searchParams={await searchParams} />
      {categories.length === 0
        ? <p className="text-sm text-red-600">Hãy tạo danh mục trước.</p>
        : <ProductForm categories={categories} suppliers={suppliers} />}
    </div>
  );
}
```

`apps/web/src/app/admin/san-pham/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { addStockAction } from '../../actions';
import { ProductForm } from '../ProductForm';

export default async function EditProduct({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const product = await core.getProduct(Number((await params).id));
  if (!product) notFound();
  const [categories, suppliers] = await Promise.all([core.listCategories(), core.listSuppliers()]);
  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Sửa: {product.name}</h1>
        <Flash searchParams={await searchParams} />
        <ProductForm product={product} categories={categories} suppliers={suppliers} />
      </div>
      {product.type !== 'API' && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Nhập kho (đang còn {product.stock})</h2>
          <form action={addStockAction} className="space-y-2">
            <input type="hidden" name="productId" value={product.id} />
            <textarea name="lines" rows={8} className="input font-mono text-sm"
              placeholder={product.type === 'UNIQUE' ? 'Đúng 1 dòng: user|pass|...' : 'Mỗi dòng 1 tài khoản, ví dụ: email|matkhau|2fa'} />
            <button className="btn">Nhập kho</button>
          </form>
        </div>
      )}
    </div>
  );
}
```


- [ ] **Step 5: Users page**

`apps/web/src/app/admin/nguoi-dung/page.tsx`:
```tsx
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatVnd, TIER_LABEL } from '@/lib/format';
import { adjustBalanceAction, setRoleAction, setTierAction } from '../actions';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const users = await core.listUsers({ q: sp.q });
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Người dùng</h1>
      <Flash searchParams={sp} />
      <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Tìm email / tên" className="input" /><button className="btn-secondary">Tìm</button></form>
      <table className="table">
        <thead><tr><th>#</th><th>Email / Tên</th><th>Số dư</th><th>Cấp</th><th>Vai trò</th><th>Cộng/trừ tiền (ADMIN)</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.email}<div className="text-xs text-gray-500">{u.name} · {u.topupCode}</div></td>
              <td>{formatVnd(u.balance)}</td>
              <td>
                <form action={setTierAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="tier" defaultValue={u.tier} className="input py-1">
                    {core.TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                  </select>
                  <button className="btn-secondary py-1">Lưu</button>
                </form>
              </td>
              <td>
                <form action={setRoleAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input py-1">
                    {core.ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn-secondary py-1">Lưu</button>
                </form>
              </td>
              <td>
                <form action={adjustBalanceAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <input name="amount" placeholder="+50000 / -20000" className="input w-28 py-1" required />
                  <input name="note" placeholder="Lý do" className="input w-28 py-1" required />
                  <button className="btn-secondary py-1">OK</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Bank transactions page**

`apps/web/src/app/admin/giao-dich/page.tsx`:
```tsx
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatDate, formatVnd } from '@/lib/format';
import { assignTxnAction } from '../actions';

export default async function AdminBankTxns({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const txns = await core.listBankTxns();
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Giao dịch ngân hàng</h1>
      <Flash searchParams={await searchParams} />
      <table className="table">
        <thead><tr><th>Thời gian</th><th>Mã GD</th><th>Số tiền</th><th>Nội dung</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id}>
              <td>{formatDate(t.createdAt)}</td>
              <td className="font-mono text-xs">{t.providerTxnId}</td>
              <td>{formatVnd(t.amount)}</td>
              <td className="max-w-xs break-words">{t.content}</td>
              <td>
                {t.status === 'UNMATCHED' ? (
                  <form action={assignTxnAction} className="flex gap-1">
                    <input type="hidden" name="txnId" value={t.id} />
                    <input name="user" placeholder="ID hoặc email" className="input w-36 py-1" required />
                    <button className="btn-secondary py-1">Cộng</button>
                  </form>
                ) : t.status === 'MATCHED' ? `Đã cộng → #${t.userId}` : 'Bỏ qua'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Suppliers page**

`apps/web/src/app/admin/nha-cung-cap/page.tsx`:
```tsx
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { saveSupplierAction } from '../actions';

export default async function AdminSuppliers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const suppliers = await core.listSuppliers();
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Nhà cung cấp (API nguồn)</h1>
      <Flash searchParams={await searchParams} />
      {suppliers.map((s) => (
        <form key={s.id} action={saveSupplierAction} className="grid items-end gap-2 border-b pb-3 md:grid-cols-5">
          <input type="hidden" name="id" value={s.id} />
          <label className="text-sm">Tên<input name="name" defaultValue={s.name} className="input" /></label>
          <label className="text-sm md:col-span-2">Base URL<input name="baseUrl" defaultValue={s.baseUrl} className="input" /></label>
          <label className="text-sm">API key mới<input name="apiKey" placeholder="để trống = giữ nguyên" className="input" /></label>
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={s.active} /> Bật</label>
            <button className="btn-secondary">Lưu</button>
          </div>
        </form>
      ))}
      <h2 className="font-semibold">Thêm nhà cung cấp</h2>
      <form action={saveSupplierAction} className="grid items-end gap-2 md:grid-cols-4">
        <label className="text-sm">Tên<input name="name" required className="input" /></label>
        <label className="text-sm">Base URL<input name="baseUrl" placeholder="https://..." required className="input" /></label>
        <label className="text-sm">API key<input name="apiKey" required className="input" /></label>
        <button className="btn">Thêm</button>
      </form>
      <p className="text-xs text-gray-500">Adapter: generic-rest (POST /api/orders, GET /api/products, header X-API-Key).</p>
    </div>
  );
}
```

- [ ] **Step 8: Orders page**

`apps/web/src/app/admin/don-hang/page.tsx`:
```tsx
import Link from 'next/link';
import type { OrderStatus } from '@web12/core';
import { core } from '@/lib/core';
import { formatDate, formatVnd, STATUS_LABEL } from '@/lib/format';

const STATUSES: OrderStatus[] = ['PENDING', 'COMPLETED', 'REFUNDED'];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const orders = await core.listAllOrders({ status });
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Đơn hàng</h1>
      <div className="flex gap-2 text-sm">
        <Link href="/admin/don-hang" className="btn-secondary">Tất cả</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/don-hang?status=${s}`} className="btn-secondary">{STATUS_LABEL[s]}</Link>)}
      </div>
      <table className="table">
        <thead><tr><th>#</th><th>User</th><th>Sản phẩm</th><th>SL</th><th>Tổng</th><th>Nguồn</th><th>Trạng thái</th><th>Lần thử</th><th>Thời gian</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td><td>#{o.userId}</td><td>{o.productName}</td><td>{o.quantity}</td><td>{formatVnd(o.total)}</td>
              <td>{o.source}</td>
              <td>{STATUS_LABEL[o.status]}{o.error && <div className="text-xs text-red-600">{o.error}</div>}</td>
              <td>{o.attempts}</td><td>{formatDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 9: Verify**

Make your user ADMIN. There is no UI for that yet; the seed in Task 14 creates an admin. Until then use SQL:
```bash
node --env-file=.env -e "const pg=require('pg');const c=new pg.Client(process.env.DATABASE_URL);c.connect().then(()=>c.query(\"UPDATE users SET role='ADMIN' WHERE id=1\")).then(()=>c.end())"
```
Then in the browser:
1. `/admin/danh-muc`: create a category.
2. `/admin/san-pham/moi`: create a STOCK product, then paste 3 lines on its edit page → "Đã nhập 3 tài khoản".
3. `/admin/nguoi-dung`: add +100000 with a note → balance updates.
4. `/admin/giao-dich`: send an unmatched fake transfer (`npm run fake:topup -- XYZ 50000`), then assign it by user id → balance +50.000đ.
5. Log in as a CUSTOMER and open `/admin` → redirected to `/`.

Run: `npm run typecheck -w @web12/web` → no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): admin for catalog, stock import, users, balance, bank txns, suppliers, orders"
```


---

### Task 14: Seed data, README, end-to-end verification

**Files:**
- Create: `packages/core/scripts/seed.ts`
- Modify: `packages/core/package.json` (script `seed`), root `package.json` (script `db:seed`)
- Create: `README.md`

**Interfaces:**
- Consumes: `registerUser`, `setUserRole`, `setUserTier`, `adjustBalance`, `createCategory`, `createSupplier`, `createProduct`, `addStock` from core; `loadEnv`, `getPool`, `closePool`, `migrate` from db.
- Produces: `npm run db:seed`. It is a no-op when users already exist.

- [ ] **Step 1: Seed script**

`packages/core/scripts/seed.ts`:
```ts
import { closePool, getPool, loadEnv, migrate } from '@web12/db';
import {
  addStock, adjustBalance, createCategory, createProduct, createSupplier, registerUser, setUserRole, setUserTier,
} from '../src/index';

loadEnv();
await migrate(getPool());

const existing = await getPool().query('SELECT 1 FROM users LIMIT 1');
if (existing.rowCount) {
  console.log('Database already has users; skipping seed.');
  await closePool();
  process.exit(0);
}

const admin = await registerUser({ email: 'admin@shop.local', password: 'admin12345', name: 'Admin' });
await setUserRole(admin.id, 'ADMIN');

const customer = await registerUser({ email: 'khach@shop.local', password: 'khach12345', name: 'Khách lẻ' });
await adjustBalance(customer.id, 500_000, 'Seed', admin.id);

const agent = await registerUser({ email: 'daily@shop.local', password: 'daily12345', name: 'Đại lý A' });
await setUserTier(agent.id, 'AGENT');
await adjustBalance(agent.id, 2_000_000, 'Seed', admin.id);

const email = await createCategory({ name: 'Email', sortOrder: 1 });
const social = await createCategory({ name: 'Mạng xã hội', sortOrder: 2 });
const media = await createCategory({ name: 'Giải trí', sortOrder: 3 });

const supplier = await createSupplier({
  name: 'Mock supplier',
  baseUrl: `http://localhost:${process.env.MOCK_SUPPLIER_PORT ?? 4100}`,
  apiKey: process.env.MOCK_SUPPLIER_KEY ?? 'mock-key',
});

const gmail = await createProduct({
  categoryId: email.id, name: 'Gmail cổ 2015', type: 'STOCK',
  description: 'Gmail tạo năm 2015, đã xác minh số điện thoại.\nĐịnh dạng: email|mật khẩu|email khôi phục',
  priceMember: 15_000, priceCtv: 13_000, priceAgent: 11_000,
});
await addStock(gmail.id, Array.from({ length: 20 }, (_, i) => `gmail${i + 1}@example.com|Pass${1000 + i}|recover${i + 1}@example.com`));

const via = await createProduct({
  categoryId: social.id, name: 'Facebook VIA Việt Nam 2012', type: 'UNIQUE',
  description: 'Tài khoản duy nhất, có ảnh đại diện, 500 bạn bè.',
  images: ['https://placehold.co/600x400?text=Facebook+VIA'],
  attributes: { 'Năm tạo': '2012', 'Bạn bè': '500', 'Quốc gia': 'Việt Nam' },
  priceMember: 350_000, priceCtv: 320_000, priceAgent: 300_000,
});
await addStock(via.id, ['fb_via_2012|MatKhau@2012|2FA:JBSWY3DPEHPK3PXP']);

await createProduct({
  categoryId: media.id, name: 'Netflix Premium 1 tháng', type: 'API',
  description: 'Lấy trực tiếp từ nhà cung cấp, giao trong vài giây.',
  priceMember: 60_000, priceCtv: 55_000, priceAgent: 50_000,
  supplierId: supplier.id, supplierSku: 'netflix-1m',
});

await createProduct({
  categoryId: media.id, name: '[Test] Sản phẩm nguồn lỗi', type: 'API',
  description: 'Luôn thất bại ở nhà cung cấp, dùng để kiểm tra hoàn tiền tự động.',
  priceMember: 10_000, priceCtv: 10_000, priceAgent: 10_000,
  supplierId: supplier.id, supplierSku: 'fail-always',
});

console.log(`Seeded:
  admin@shop.local / admin12345 (ADMIN)
  khach@shop.local / khach12345 (500.000đ)
  daily@shop.local / daily12345 (Đại lý, 2.000.000đ)`);
await closePool();
```

`packages/core/package.json` scripts: add `"seed": "tsx scripts/seed.ts"`, and add `"scripts"` to `include` in `packages/core/tsconfig.json`.
Root `package.json` scripts: add `"db:seed": "npm run seed -w @web12/core"`.

- [ ] **Step 2: README**

`README.md`:
````markdown
# web12: Shop bán tài khoản

Monorepo Node.js/TypeScript:
- `apps/web`: Next.js (giao diện khách, admin, API đại lý `/api/v1`, webhook ngân hàng)
- `apps/worker`: xử lý đơn hàng lấy từ nguồn API (pg-boss)
- `apps/mock-supplier`: web nguồn giả lập để test
- `packages/core`: toàn bộ nghiệp vụ (ví, sổ cái, đơn hàng, kho, nạp tiền, adapter nguồn)
- `packages/db`: kết nối Postgres, migration SQL

Thiết kế: `docs/superpowers/specs/2026-10-16-account-shop-design.md`

## Chạy lần đầu (máy dev)

Yêu cầu Node ≥ 22.12. Không cần cài Postgres, vì dự án dùng embedded-postgres.

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # dán vào SECRET_KEY trong .env
```

Mở 4 terminal:
```bash
npm run db:start        # 1. Postgres (cổng 5433)
npm run db:seed         # chạy 1 lần: migrate + dữ liệu mẫu
npm run mock:supplier   # 2. web nguồn giả lập (cổng 4100)
npm run worker          # 3. worker xử lý đơn API
npm run dev             # 4. web: http://localhost:3000
```

Tài khoản mẫu:
- `admin@shop.local` / `admin12345` (ADMIN)
- `khach@shop.local` / `khach12345` (500.000đ)
- `daily@shop.local` / `daily12345` (Đại lý, 2.000.000đ)

## Lệnh hữu ích

| Lệnh | Việc |
|---|---|
| `npm test` | Test nghiệp vụ trên DB `web12_test` (cần `db:start`) |
| `npm run typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `npm run db:migrate` | Chạy migration mới |
| `npm run fake:topup -- NAP2 100000` | Giả lập ngân hàng báo có tiền |
| `npm run api:smoke -- <API_KEY>` | Gọi thử API đại lý |

## Webhook ngân hàng (SePay)

- URL: `POST https://<domain>/api/webhooks/bank`
- Header: `Authorization: Apikey <WEBHOOK_TOKEN>`
- Nội dung chuyển khoản của khách: `NAP<id>`, hiển thị ở trang `/nap-tien`.
- Giao dịch không khớp được ai sẽ nằm ở `/admin/giao-dich` để admin gán tay.

## API đại lý

Header `X-API-Key: sk_...`, tạo khóa ở `/tai-khoan`. Giới hạn 60 request/phút.

- `GET /api/v1/products`: giá theo cấp của bạn
- `GET /api/v1/balance`
- `POST /api/v1/orders`, body `{ "productId": 1, "quantity": 2 }`, header `Idempotency-Key` tùy chọn
- `GET /api/v1/orders/:id`

Lỗi trả về dạng `{ "error": { "code", "message" } }`.

## Production

- Đặt `DATABASE_URL` trỏ tới Postgres thật, rồi chạy `npm run db:migrate`.
- Chạy `npm run build -w @web12/web && npm run start -w @web12/web`, cùng với `npm run worker`.
- Bắt buộc HTTPS. Phải đặt `SECRET_KEY` và `WEBHOOK_TOKEN` riêng, và sao lưu `SECRET_KEY`: mất khóa này thì không giải mã được tài khoản trong kho.
````

- [ ] **Step 3: End-to-end verification**

Start everything as described in the README, on a fresh DB: stop `db:start`, delete `.pgdata/`, then start it again. Check each item and record the actual result:

1. `npm test` → all test files pass.
2. `npm run typecheck` → no errors.
3. Log in as `khach@shop.local` and buy 2 × "Gmail cổ 2015".
   - Order page shows 2 accounts.
   - Balance is 470.000đ.
   - Product shows "Còn 18".
4. Buy "Facebook VIA".
   - The order page shows the account.
   - The product page now shows "Hết hàng".
5. Buy "Netflix Premium 1 tháng".
   - The order page first shows "Đang xử lý".
   - Within a few seconds the worker logs `order N: completed`.
   - After a refresh, the order page shows the account.
6. Buy "[Test] Sản phẩm nguồn lỗi".
   - The worker logs `refunded`.
   - The order shows "Đã hoàn tiền: Hết hàng".
   - The balance is restored, and `/tai-khoan` shows a PURCHASE row and a REFUND row.
7. `npm run fake:topup -- NAP2 100000` → balance +100.000đ. Re-sending the same id is a duplicate; the script uses `Date.now()`, so test that via the core tests.
8. Log in as `daily@shop.local` and create an API key. Run `npm run api:smoke -- <key>`.
   - Prices are agent prices.
   - The idempotent replay returns the same order id.
9. Log in as admin. Check that `/admin` tiles, stock import, balance adjustment and bank-txn assignment all work.
10. Stop the worker and buy Netflix → the order stays PENDING. Start the worker → the job is consumed and the order completes. (The sweeper covers jobs that were never enqueued; it re-enqueues after 10 minutes.)

Fix anything that fails before committing (use superpowers:systematic-debugging).

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "feat: seed data, README, end-to-end verified phase 1"
git push
```
