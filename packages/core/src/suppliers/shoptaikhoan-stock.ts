import { load, type CheerioAPI } from 'cheerio/slim';
import { SupplierError } from './types';

const MAX_CATALOG_PAGES = 20;

function jsonLd($: CheerioAPI): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  function collect(value: unknown) {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    nodes.push(node);
    if (node['@graph']) collect(node['@graph']);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try { collect(JSON.parse($(element).text())); } catch { /* Ignore unrelated malformed metadata. */ }
  });
  return nodes;
}

function skuOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^SP-([1-9]\d*)$/.exec(value.trim());
  return match && Number.isSafeInteger(Number(match[1])) ? match[1]! : null;
}

function countOf(text: string): number | null {
  const value = text.trim().replace(/[\u00a0\u202f]/g, ' ');
  // Dots/commas/spaces are allowed only as groups of three, never as decimals.
  if (!/^\d+$/.test(value) && !/^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(value)) return null;
  const count = Number(value.replace(/[., ]/g, ''));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/** Seller API stock covers internal inventory only; display inventory follows the storefront. */
export function createShoptaikhoanStockReader(cfg: { storefrontUrl: string; timeoutMs?: number }) {
  const origin = new URL(cfg.storefrontUrl).origin;
  let indexPromise: Promise<Map<string, string>> | undefined;

  async function readPage(url: string, signal?: AbortSignal): Promise<CheerioAPI> {
    let response: Response;
    try {
      response = await fetch(url, {
        cache: 'no-store', redirect: 'error',
        headers: { accept: 'text/html', 'accept-language': 'vi-VN,vi;q=0.9' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(cfg.timeoutMs ?? 10_000)]) : AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
      });
    } catch {
      throw new SupplierError('Không đọc được tồn kho cửa hàng nguồn', true);
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      throw new SupplierError('Phản hồi tồn kho không hợp lệ', true);
    }
    const $ = load(await response.text());
    if (!$('[data-catalog-refresh][data-catalog-ready="true"]').length) {
      throw new SupplierError('Danh mục nguồn chưa cập nhật xong', true);
    }
    return $;
  }

  async function readIndex(signal?: AbortSignal): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    let url = `${origin}/shop`;
    for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
      const $ = await readPage(url, signal);
      const lists = jsonLd($).filter(node => node['@type'] === 'ItemList');
      if (!lists.length) throw new SupplierError('Thiếu mã sản phẩm trong danh mục nguồn', true);
      for (const list of lists) {
        if (!Array.isArray(list.itemListElement)) throw new SupplierError('Danh mục nguồn không hợp lệ', true);
        for (const entry of list.itemListElement) {
          const item = entry?.item;
          const sku = skuOf(item?.sku);
          if (!sku || typeof item.url !== 'string') continue;
          let path: string;
          try { path = new URL(item.url, origin).pathname; } catch { continue; }
          if (!/^\/shop\/products\/[a-z0-9-]+\/?$/.test(path)) continue;
          // Source JSON-LD currently uses https://localhost. Keep its path on the verified origin.
          const productUrl = new URL(path, origin).href;
          if (index.has(sku) && index.get(sku) !== productUrl) throw new SupplierError('Mã sản phẩm nguồn không duy nhất', true);
          index.set(sku, productUrl);
        }
      }
      let next: string | undefined;
      $('[data-catalog-fragment="shop-results"] a[href]').each((_, element) => {
        try {
          const link = new URL($(element).attr('href')!, origin);
          if (link.pathname === '/shop' && link.searchParams.get('page') === String(page + 1)) {
            next = new URL(link.pathname + link.search, origin).href;
          }
        } catch { /* Not a catalog link. */ }
      });
      if (!next) return index;
      url = next;
    }
    throw new SupplierError('Danh mục nguồn vượt giới hạn số trang', true);
  }

  return async (sku: string, opts: { signal?: AbortSignal } = {}): Promise<number | null> => {
    if (!/^[1-9]\d*$/.test(sku) || !Number.isSafeInteger(Number(sku))) return null;
    indexPromise ??= readIndex(opts.signal);
    const url = (await indexPromise).get(sku);
    if (!url) return null;
    const $ = await readPage(url, opts.signal);
    const products = jsonLd($).filter(node => node['@type'] === 'Product');
    if (products.length !== 1 || skuOf(products[0]!.sku) !== sku) {
      throw new SupplierError('Mã sản phẩm trên trang nguồn không khớp', true);
    }
    const labels = $('[data-catalog-fragment="detail-hero"] dt').filter((_, element) => {
      const text = $(element).text().replace(/\s+/g, ' ').trim().toLowerCase();
      return ['tồn kho', 'tồn kho hiện tại', 'stock', 'current stock'].includes(text);
    });
    if (labels.length !== 1) return null;
    return countOf(labels.next('dd').text());
  };
}
