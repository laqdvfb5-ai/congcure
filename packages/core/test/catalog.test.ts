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
