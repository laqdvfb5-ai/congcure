import { readFile } from 'node:fs/promises';
import { closePool, getPool } from '@web12/db';
import { loadEnv, migrate } from '@web12/db/node';
import {
  createCategory, createProduct, createSupplier, registerUser, setUserRole,
  type Category, type ProductInput,
} from '../src/index';

interface BootstrapInput {
  admin: { email: string; password: string; name: string };
  categories: Category[];
  suppliers: {
    id: number; name: string; baseUrl: string; adapter: string; apiKey: string;
  }[];
  products: ProductInput[];
}

loadEnv();
try {
  const filename = process.argv[2];
  if (!filename) throw new Error('Usage: tsx packages/core/scripts/bootstrap-production.ts <private-json-file>');
  const input = JSON.parse(await readFile(filename, 'utf8')) as BootstrapInput;
  if (!input.admin || !Array.isArray(input.categories) || !Array.isArray(input.suppliers) || !Array.isArray(input.products)) {
    throw new Error('Invalid bootstrap document');
  }
  if (input.products.some(product => product.type !== 'API')) {
    throw new Error('Bootstrap only imports API products; local stock requires a separate migration');
  }
  await migrate(getPool());
  const occupied = await getPool().query<{ occupied: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM products)
      OR EXISTS(SELECT 1 FROM categories) OR EXISTS(SELECT 1 FROM suppliers) AS occupied`,
  );
  if (occupied.rows[0]?.occupied) throw new Error('Bootstrap requires an empty database');

  const categoryIds = new Map<number, number>();
  const remaining = [...input.categories];
  while (remaining.length) {
    const index = remaining.findIndex(category => !category.parentId || categoryIds.has(category.parentId));
    if (index < 0) throw new Error('Category hierarchy has a missing parent or cycle');
    const category = remaining.splice(index, 1)[0]!;
    const created = await createCategory({
      ...category, parentId: category.parentId ? categoryIds.get(category.parentId) : null,
    });
    categoryIds.set(category.id, created.id);
  }
  const supplierIds = new Map<number, number>();
  for (const supplier of input.suppliers) {
    const created = await createSupplier(supplier);
    supplierIds.set(supplier.id, created.id);
  }
  for (const product of input.products) {
    const categoryId = categoryIds.get(product.categoryId);
    const supplierId = product.supplierId ? supplierIds.get(product.supplierId) : undefined;
    if (!categoryId || !supplierId) throw new Error('Missing category or supplier for imported product');
    await createProduct({ ...product, categoryId, supplierId });
  }
  const admin = await registerUser(input.admin);
  await setUserRole(admin.id, 'ADMIN');
  console.log(`Production initialized: ${input.products.length} products, admin ${admin.email}, no demo balances or orders`);
} finally {
  await closePool();
}
