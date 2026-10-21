import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShoptaikhoanStockReader } from '../src/suppliers/shoptaikhoan-stock';
import { createSupplier, listProducts, SHOPTAIKHOAN_BASE_URL } from '../src/index';
import { makeProduct } from './factories';

const origin = 'https://shoptaikhoan.store';
const selection = [
  { sku: '12339', slug: 'slot-canva-pro-1-thang-bhf', count: '9.999', expected: 9999 },
  { sku: '12307', slug: 'capcut-pro-30d-bao-hanh-full', count: '5', expected: 5 },
  { sku: '12341', slug: 'slot-canva-pro-1-thang-bhf-copy-copy', count: '9.999', expected: 9999 },
  { sku: '12313', slug: 'goi-gemini-pro-drive-5tb-18-thang-chinh-chu', count: '56', expected: 56 },
  { sku: '12342', slug: 'duolingo-12-thang', count: '356', expected: 356 },
];

function index(items = selection, nextPage?: number) {
  return `<div data-catalog-refresh data-catalog-ready="true"></div>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: items.map(item => ({ '@type': 'ListItem', item: { '@type': 'Product', sku: `SP-${item.sku}`, url: `https://localhost/shop/products/${item.slug}` } })) })}</script>
    <div data-catalog-fragment="shop-results">${nextPage ? `<a href="/shop?page=${nextPage}">Next</a>` : ''}</div>`;
}

function detail(sku: string, stock: string, label = 'Tồn kho') {
  return `<div data-catalog-refresh data-catalog-ready="true"></div>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', sku: `SP-${sku}` })}</script>
    <div data-catalog-fragment="detail-hero"><dl>
      <div><dt>Tình trạng</dt><dd>Sẵn hàng</dd></div>
      <div><dt><span aria-hidden="true"></span> ${label} </dt><dd>${stock}</dd></div>
      <div><dt>Đã bán:</dt><dd>19.999</dd></div>
    </dl></div><div data-catalog-fragment="detail-related"><dt>Tồn kho</dt><dd>777</dd></div>`;
}

function html(body: string, status = 200) { return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }); }
const urlOf = (input: string | URL | Request) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ShopTaiKhoan storefront stock', () => {
  it('uses displayed stock for all five SKUs instead of internal Seller API zero/unavailable results', async () => {
    const requests: Array<{ url: URL; headers: Headers }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = urlOf(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url.origin !== origin) return Response.json({ success: true, data: [{ id: 12313, stock: 0 }] });
      if (url.pathname === '/shop') return html(index());
      const item = selection.find(item => url.pathname === `/shop/products/${item.slug}`);
      return item ? html(detail(item.sku, item.count)) : html('Not found', 404);
    }));
    const supplier = await createSupplier({ name: 'Shop source', adapter: 'shoptaikhoan', baseUrl: SHOPTAIKHOAN_BASE_URL, apiKey: 'private-api-key' });
    for (const item of selection) await makeProduct({ type: 'API', supplierId: supplier.id, supplierSku: item.sku });
    const [first, second] = await Promise.all([listProducts({ includeSupplierStock: true }), listProducts({ includeSupplierStock: true })]);
    expect(first).toEqual(second);
    for (const item of selection) expect(first.find(p => p.supplierSku === item.sku)).toMatchObject({ stock: item.expected, priceMember: 10_000 });
    expect(requests.filter(r => r.url.pathname === '/shop')).toHaveLength(1);
    expect(requests).toHaveLength(6);
    for (const req of requests) {
      expect(req.url.origin).toBe(origin);
      expect(req.headers.has('x-api-key')).toBe(false);
      expect(req.headers.has('authorization')).toBe(false);
    }
  });

  it('reads only the inventory field, including grouped counts and confirmed zero', async () => {
    let count = '0';
    let label = 'Tồn kho';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => html(urlOf(input).pathname === '/shop' ? index() : detail('12339', count, label))));
    const read = createShoptaikhoanStockReader({ storefrontUrl: origin });
    for (const [input, expected] of [['0', 0], ['9.999', 9999], ['1,234', 1234], ['12 345', 12345], ['1\u202f234', 1234], ['1.5', null], ['1.234,567', null], ['-1', null], ['Không giới hạn', null]] as const) {
      count = input;
      expect(await read('12339'), input).toBe(expected);
    }
    count = '356'; label = 'Stock';
    expect(await read('12339')).toBe(356);
    label = 'Giá';
    expect(await read('12339')).toBeNull();
  });

  it('rejects a detail page for a different SKU even when the page has a valid stock number', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => html(urlOf(input).pathname === '/shop' ? index() : detail('12341', '9999'))));
    await expect(createShoptaikhoanStockReader({ storefrontUrl: origin })('12339')).rejects.toMatchObject({ transient: true });
  });

  it('does not substitute a misleading API zero when the public page is incomplete or fails', async () => {
    let broken = true;
    const fetchMock = vi.fn(async (_input: string | URL | Request) => html(broken ? '<div data-catalog-refresh data-catalog-ready="false"></div>' : 'Unavailable', broken ? 200 : 503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createShoptaikhoanStockReader({ storefrontUrl: origin })('12313')).rejects.toMatchObject({ transient: true });
    broken = false;
    await expect(createShoptaikhoanStockReader({ storefrontUrl: origin })('12313')).rejects.toMatchObject({ transient: true });
    const supplier = await createSupplier({ name: 'Shop source', adapter: 'shoptaikhoan', baseUrl: SHOPTAIKHOAN_BASE_URL, apiKey: 'private-api-key' });
    await makeProduct({ type: 'API', supplierId: supplier.id, supplierSku: '12313' });
    expect((await listProducts({ includeSupplierStock: true }))[0]?.stock).toBeNull();
    expect(fetchMock.mock.calls.every(args => !String(args[0]).includes('/api/seller'))).toBe(true);
  });

  it('follows catalog pagination and does not infer a count for an absent SKU', async () => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input);
      paths.push(url.pathname + url.search);
      if (url.pathname === '/shop') return html(url.searchParams.get('page') === '2' ? index(selection.slice(1)) : index(selection.slice(0, 1), 2));
      return html(detail('12342', '356'));
    }));
    const read = createShoptaikhoanStockReader({ storefrontUrl: origin });
    expect(await read('12342')).toBe(356);
    expect(await read('99999')).toBeNull();
    expect(paths).toEqual(['/shop', '/shop?page=2', '/shop/products/duolingo-12-thang']);
  });
});
