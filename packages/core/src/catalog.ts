import { getPool } from '@web12/db';
import { encryptSecret } from './crypto';
import { AppError, isUniqueViolation } from './errors';
import type { PriceFields } from './pricing';
import { slugify } from './slug';
import { isProductImageUrl, MAX_PRODUCT_IMAGES } from './media-rules';
import { withSupplierStock } from './stock';

export type ProductType = 'STOCK' | 'UNIQUE' | 'API';
const PRODUCT_TYPES: ProductType[] = ['STOCK', 'UNIQUE', 'API'];

export interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
}

export interface Product extends PriceFields {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  description: string;
  images: string[];
  attributes: Record<string, string>;
  type: ProductType;
  active: boolean;
  supplierId: number | null;
  supplierSku: string | null;
  createdAt: Date;
  stock: number | null;
}

export interface ProductInput extends PriceFields {
  categoryId: number;
  name: string;
  slug?: string;
  description?: string;
  images?: string[];
  attributes?: Record<string, string>;
  type: ProductType;
  active?: boolean;
  supplierId?: number | null;
  supplierSku?: string | null;
}

const CATEGORY_COLS = `id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder"`;

const PRODUCT_COLS = `p.id, p.category_id AS "categoryId", p.name, p.slug, p.description, p.images, p.attributes,
  p.type, p.price_member AS "priceMember", p.price_ctv AS "priceCtv", p.price_agent AS "priceAgent",
  p.active, p.supplier_id AS "supplierId", p.supplier_sku AS "supplierSku", p.created_at AS "createdAt",
  CASE WHEN p.type = 'API' THEN NULL ELSE
    (SELECT count(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'AVAILABLE')::int END AS stock`;

export async function createCategory(input: { name: string; slug?: string; parentId?: number | null; sortOrder?: number }): Promise<Category> {
  const name = input.name.trim();
  const slug = slugify(input.slug?.trim() || name);
  if (!name || !slug) throw new AppError('INVALID_INPUT', 'Tên danh mục không hợp lệ');
  try {
    const r = await getPool().query<Category>(
      `INSERT INTO categories (name, slug, parent_id, sort_order) VALUES ($1, $2, $3, $4) RETURNING ${CATEGORY_COLS}`,
      [name, slug, input.parentId ?? null, input.sortOrder ?? 0],
    );
    return r.rows[0]!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Slug danh mục đã tồn tại');
    throw e;
  }
}

export async function listCategories(): Promise<Category[]> {
  const r = await getPool().query<Category>(`SELECT ${CATEGORY_COLS} FROM categories ORDER BY sort_order, name`);
  return r.rows;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const r = await getPool().query<Category>(`SELECT ${CATEGORY_COLS} FROM categories WHERE slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

function normalizeProductInput(input: ProductInput) {
  const name = input.name.trim();
  const slug = slugify(input.slug?.trim() || name);
  if (!name || !slug) throw new AppError('INVALID_INPUT', 'Tên sản phẩm không hợp lệ');
  if (!PRODUCT_TYPES.includes(input.type)) throw new AppError('INVALID_INPUT', 'Loại sản phẩm không hợp lệ');
  for (const v of [input.priceMember, input.priceCtv, input.priceAgent]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new AppError('INVALID_INPUT', 'Giá không hợp lệ');
  }
  const supplierSku = input.supplierSku?.trim() || null;
  const images = input.images ?? [];
  if (images.length > MAX_PRODUCT_IMAGES || images.some(src => typeof src !== 'string' || !isProductImageUrl(src))) {
    throw new AppError('INVALID_INPUT', `Tối đa ${MAX_PRODUCT_IMAGES} ảnh, dùng ảnh đã tải lên hoặc URL http/https hợp lệ`);
  }
  if (input.type === 'API' && (!input.supplierId || !supplierSku)) {
    throw new AppError('INVALID_INPUT', 'Sản phẩm API cần nhà cung cấp và mã SKU');
  }
  return [
    input.categoryId, name, slug, input.description?.trim() ?? '', images,
    JSON.stringify(input.attributes ?? {}), input.type, input.priceMember, input.priceCtv, input.priceAgent,
    input.active ?? true, input.type === 'API' ? input.supplierId : null, input.type === 'API' ? supplierSku : null,
  ];
}

async function writeProduct(sql: string, params: unknown[]): Promise<number | null> {
  try {
    const r = await getPool().query<{ id: number }>(sql, params);
    return r.rows[0]?.id ?? null;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Slug sản phẩm đã tồn tại');
    throw e;
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const id = await writeProduct(
    `INSERT INTO products (category_id, name, slug, description, images, attributes, type,
       price_member, price_ctv, price_agent, active, supplier_id, supplier_sku)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    normalizeProductInput(input),
  );
  return (await getProduct(id!))!;
}

export async function updateProduct(id: number, input: ProductInput): Promise<Product> {
  const updated = await writeProduct(
    `UPDATE products SET category_id = $1, name = $2, slug = $3, description = $4, images = $5, attributes = $6,
       type = $7, price_member = $8, price_ctv = $9, price_agent = $10, active = $11, supplier_id = $12, supplier_sku = $13
     WHERE id = $14 RETURNING id`,
    [...normalizeProductInput(input), id],
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm');
  return (await getProduct(id))!;
}

export async function getProduct(id: number): Promise<Product | null> {
  const r = await getPool().query<Product>(`SELECT ${PRODUCT_COLS} FROM products p WHERE p.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function getProductBySlug(slug: string, opts: { includeSupplierStock?: boolean } = {}): Promise<Product | null> {
  const r = await getPool().query<Product>(`SELECT ${PRODUCT_COLS} FROM products p WHERE p.slug = $1`, [slug]);
  if (opts.includeSupplierStock && r.rows.length) return (await withSupplierStock(r.rows))[0]!;
  return r.rows[0] ?? null;
}

export async function listProducts(opts: { categoryId?: number; activeOnly?: boolean; includeSupplierStock?: boolean } = {}): Promise<Product[]> {
  const r = await getPool().query<Product>(
    `SELECT ${PRODUCT_COLS} FROM products p
     WHERE ($1::bigint IS NULL OR p.category_id = $1) AND (NOT $2 OR p.active)
     ORDER BY p.id DESC`,
    [opts.categoryId ?? null, opts.activeOnly ?? true],
  );
  return opts.includeSupplierStock ? withSupplierStock(r.rows) : r.rows;
}

export async function addStock(productId: number, lines: string[]): Promise<number> {
  const product = await getProduct(productId);
  if (!product) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm');
  if (product.type === 'API') throw new AppError('INVALID_INPUT', 'Sản phẩm API không nhập kho');

  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return 0;
  if (product.type === 'UNIQUE') {
    const existing = await getPool().query('SELECT 1 FROM stock_items WHERE product_id = $1 LIMIT 1', [productId]);
    if (clean.length > 1 || existing.rowCount) {
      throw new AppError('INVALID_INPUT', 'Sản phẩm UNIQUE chỉ có đúng 1 tài khoản');
    }
  }
  const r = await getPool().query(
    'INSERT INTO stock_items (product_id, secret_enc) SELECT $1, unnest($2::text[])',
    [productId, clean.map(encryptSecret)],
  );
  return r.rowCount ?? 0;
}
