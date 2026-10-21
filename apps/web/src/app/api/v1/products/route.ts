import { withApiUser } from '@/lib/api';
import { core } from '@/lib/core';

export const GET = withApiUser(async (user) => {
  const products = await core.listProducts({ includeSupplierStock: true });
  return Response.json({
    products: products.map((p) => ({
      id: p.id, name: p.name, category_id: p.categoryId, type: p.type,
      price: core.priceForTier(p, user.tier), stock: p.stock,
    })),
  });
});
