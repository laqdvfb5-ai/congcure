// Usage: node scripts/api-smoke.mjs <API_KEY> [productId]
const [key, productIdArg] = process.argv.slice(2);
if (!key) {
  console.error('Usage: node scripts/api-smoke.mjs <API_KEY> [productId]');
  process.exit(1);
}
const base = 'http://localhost:3000/api/v1';
const call = async (path, init = {}) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'x-api-key': key, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json();
  console.log(init.method ?? 'GET', path, res.status, JSON.stringify(body, null, 2));
  return body;
};

await call('/balance');
const { products } = await call('/products');
const productId = Number(productIdArg ?? products.find((p) => p.type === 'STOCK' && p.stock > 0)?.id);
const idem = `smoke-${Date.now()}`;
const { order } = await call('/orders', {
  method: 'POST', headers: { 'idempotency-key': idem }, body: JSON.stringify({ productId, quantity: 1 }),
});
await call('/orders', { method: 'POST', headers: { 'idempotency-key': idem }, body: JSON.stringify({ productId, quantity: 1 }) });
if (order) await call(`/orders/${order.id}`);
await call('/balance');
