import { getPool } from '@web12/db';

export interface ShopStats {
  products: number;
  ordersCompleted: number;
}

export async function getShopStats(): Promise<ShopStats> {
  const r = await getPool().query<ShopStats>(
    `SELECT (SELECT count(*) FROM products WHERE active)::int AS products,
            (SELECT count(*) FROM orders WHERE status = 'COMPLETED')::int AS "ordersCompleted"`,
  );
  return r.rows[0]!;
}
