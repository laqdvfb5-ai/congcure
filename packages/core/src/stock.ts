import { getPool } from '@web12/db';
import type { Product } from './catalog';
import { sha256 } from './crypto';
import { getAdapterForSupplier, type SupplierAdapter, type SupplierProduct } from './suppliers/index';

const CACHE_MS = 30_000;
const ERROR_CACHE_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;

interface StockCache {
  expiresAt: number;
  catalog: Promise<{ adapter: SupplierAdapter; products: Map<string, SupplierProduct> } | null>;
  details: Map<string, Promise<number | null>>;
}

const g = globalThis as typeof globalThis & { __web12StockCache?: Map<string, StockCache> };
const cache = g.__web12StockCache ??= new Map();

function stockCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function supplierStock(key: string, supplierId: number): StockCache {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) return current;
  cache.delete(key);
  if (cache.size >= 256) {
    for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key);
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  }
  const entry: StockCache = {
    expiresAt: Date.now() + CACHE_MS,
    details: new Map(),
    catalog: (async () => {
      const adapter = await getAdapterForSupplier(supplierId);
      const products = adapter.getStock ? [] : await adapter.listProducts({ signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      return { adapter, products: new Map(products.map(product => [product.sku, product])) };
    })().catch(() => {
      entry.expiresAt = Date.now() + ERROR_CACHE_MS;
      return null;
    }),
  };
  cache.set(key, entry);
  return entry;
}

/** Live inventory is opt-in; purchases and worker reads keep their database-only behavior. */
export async function withSupplierStock(products: Product[]): Promise<Product[]> {
  const ids = [...new Set(products.filter(p => p.type === 'API' && p.supplierId).map(p => p.supplierId!))];
  if (!ids.length) return products;
  const suppliers = await getPool().query<{ id: number; active: boolean; adapter: string; baseUrl: string; apiKeyEnc: string; createdAt: Date }>(
    `SELECT id, active, adapter, base_url AS "baseUrl", api_key_enc AS "apiKeyEnc", created_at AS "createdAt"
     FROM suppliers WHERE id = ANY($1::bigint[])`, [ids],
  );
  const entries = new Map(suppliers.rows.filter(s => s.active).map(s => {
    // Changing credentials, URL or adapter invalidates inventory immediately.
    const key = sha256(JSON.stringify(['storefront-stock-v2', process.env.DATABASE_URL, s]));
    return [s.id, supplierStock(key, s.id)] as const;
  }));
  return Promise.all(products.map(async product => {
    if (product.type !== 'API') return product;
    const entry = product.supplierId ? entries.get(product.supplierId) : undefined;
    if (!entry || !product.supplierSku) return { ...product, stock: null };
    const catalog = await entry.catalog;
    if (!catalog) return { ...product, stock: null };
    const listed = catalog.products.get(product.supplierSku);
    if (listed) return { ...product, stock: stockCount(listed.stock) };
    if (!catalog.adapter.getStock && !catalog.adapter.getProduct) return { ...product, stock: null };
    let detail = entry.details.get(product.supplierSku);
    if (!detail) {
      const opts = { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
      const request = catalog.adapter.getStock
        ? catalog.adapter.getStock(product.supplierSku, opts)
        : catalog.adapter.getProduct!(product.supplierSku, opts).then(result => result?.stock ?? null);
      detail = request.then(stockCount)
        .catch(() => {
          entry.expiresAt = Math.min(entry.expiresAt, Date.now() + ERROR_CACHE_MS);
          return null;
        });
      entry.details.set(product.supplierSku, detail);
    }
    return { ...product, stock: await detail };
  }));
}
