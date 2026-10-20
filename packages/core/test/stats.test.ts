import { describe, expect, it } from 'vitest';
import { getShopStats, purchase } from '../src/index';
import { makeProduct, makeUser } from './factories';

describe('getShopStats', () => {
  it('counts active products and completed orders', async () => {
    expect(await getShopStats()).toEqual({ products: 0, ordersCompleted: 0 });
    const p = await makeProduct({ stock: 3 });
    await makeProduct();
    const u = await makeUser({ balance: 100_000 });
    await purchase(u.id, p.id, 1);
    await purchase(u.id, p.id, 1);
    expect(await getShopStats()).toEqual({ products: 2, ordersCompleted: 2 });
  });
});
