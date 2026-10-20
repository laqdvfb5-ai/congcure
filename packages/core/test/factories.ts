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
