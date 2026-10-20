import { SupplierError, type SupplierAdapter, type SupplierProduct } from './types';

// Seller API of shoptaikhoan.store. Docs: https://shoptaikhoan.store/shop/api-docs
export const SHOPTAIKHOAN_BASE_URL = 'https://api.shoptaikhoan.store/api/seller/v1';

const MAX_QUANTITY = 50;
const MAX_PAGES = 20;

const TRANSIENT_CODES = new Set([
  'RATE_LIMITED', 'REQUEST_IN_PROGRESS', 'IDEMPOTENCY_CONFLICT', 'PURCHASE_DISABLED', 'INTERNAL_ERROR',
]);
const FRIENDLY: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Nguồn hết số dư hoặc ví nguồn bị khóa',
  WALLET_INACTIVE: 'Nguồn hết số dư hoặc ví nguồn bị khóa',
  UNAUTHORIZED: 'API key nguồn không hợp lệ',
};

interface ApiOrder {
  orderCode?: string;
  delivery?: { status?: string; result?: { accounts?: unknown[] } };
}

/** Accounts are strings ("user|pass|…") or objects ({ user, password, … }). */
function toSecret(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a && typeof a === 'object') {
    return Object.values(a).filter((v) => typeof v === 'string' || typeof v === 'number').join('|');
  }
  return String(a);
}

export function createShoptaikhoanAdapter(cfg: {
  baseUrl: string; apiKey: string; timeoutMs?: number; pageSize?: number;
}): SupplierAdapter {
  const base = cfg.baseUrl.replace(/\/+$/, '');

  /** Returns the full JSON body; throws SupplierError on transport or API errors. */
  async function call<T>(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, ...init.headers },
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
      });
    } catch (err) {
      throw new SupplierError(`Không kết nối được nguồn: ${(err as Error).message}`, true);
    }
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: { code?: string } };
    if (!res.ok || body.success === false) {
      const code = body.error?.code ?? '';
      const transient = TRANSIENT_CODES.has(code) || res.status >= 500 || res.status === 429;
      throw new SupplierError(FRIENDLY[code] ?? body.message ?? `HTTP ${res.status}`, transient);
    }
    return body as T;
  }

  return {
    async placeOrder({ ref, sku, quantity }) {
      const productId = Number(sku);
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        throw new SupplierError(`SKU nguồn không hợp lệ: ${sku}`, false);
      }
      if (quantity > MAX_QUANTITY) {
        throw new SupplierError(`Nguồn chỉ cho mua tối đa ${MAX_QUANTITY} món mỗi đơn`, false);
      }
      const { data = {} } = await call<{ data?: { products?: unknown[]; order?: ApiOrder } }>('/orders', {
        method: 'POST',
        headers: { 'idempotency-key': ref },
        body: JSON.stringify({ productId, quantity }),
      });
      const supplierRef = data.order?.orderCode ?? '';
      const accounts = data.products?.length ? data.products : (data.order?.delivery?.result?.accounts ?? []);
      if (accounts.length > 0 && (data.order?.delivery?.status ?? 'success') === 'success') {
        return { status: 'completed', supplierRef, secrets: accounts.map(toSecret) };
      }
      if (supplierRef) return { status: 'processing', supplierRef };
      throw new SupplierError('Phản hồi không hợp lệ từ nguồn', true);
    },

    async listProducts(opts = {}) {
      const limit = cfg.pageSize ?? 100;
      const out: SupplierProduct[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (opts.q) params.set('q', opts.q);
        const body = await call<{
          data?: { id: number; name: string; price: number; stock: number | null }[];
          meta?: { totalPages?: number };
        }>(`/products?${params}`);
        for (const p of body.data ?? []) out.push({ sku: String(p.id), name: p.name, price: p.price, stock: p.stock ?? null });
        if (page >= (body.meta?.totalPages ?? 1)) break;
      }
      return out;
    },
  };
}
