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
