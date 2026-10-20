import { randomUUID } from 'node:crypto';
import http from 'node:http';

interface MockOrder {
  id: string;
  ref: string;
  sku: string;
  quantity: number;
  calls: number;
  accounts: string[];
}

const PRODUCTS = [
  { sku: 'netflix-1m', name: 'Netflix Premium 1 tháng', price: 45_000, stock: null },
  { sku: 'spotify-1m', name: 'Spotify Premium 1 tháng', price: 25_000, stock: null },
  { sku: 'flaky', name: 'Flaky (503 twice)', price: 1_000, stock: null },
  { sku: 'slow', name: 'Slow (processing once)', price: 1_000, stock: null },
  { sku: 'fail-always', name: 'Always fails (400)', price: 1_000, stock: null },
];

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

export function createMockSupplierServer(opts: { apiKey: string }): http.Server {
  const orders = new Map<string, MockOrder>();
  // 'flaky' failures are counted per ref, before an order record exists.
  const flakyCalls = new Map<string, number>();

  return http.createServer(async (req, res) => {
    if (req.headers['x-api-key'] !== opts.apiKey) return send(res, 401, { error: 'Invalid API key' });

    if (req.method === 'GET' && req.url === '/api/products') return send(res, 200, { products: PRODUCTS });

    if (req.method === 'POST' && req.url === '/api/orders') {
      const body = await readJson(req);
      const ref = String(body.ref ?? '');
      const sku = String(body.sku ?? '');
      const quantity = Number(body.quantity);
      if (!ref || !Number.isInteger(quantity) || quantity < 1) return send(res, 400, { error: 'Bad request' });
      if (!PRODUCTS.some((p) => p.sku === sku)) return send(res, 404, { error: 'Unknown sku' });
      if (sku === 'fail-always') return send(res, 400, { error: 'Hết hàng' });

      if (sku === 'flaky') {
        const n = (flakyCalls.get(ref) ?? 0) + 1;
        flakyCalls.set(ref, n);
        if (n <= 2) return send(res, 503, { error: 'Temporarily unavailable' });
      }

      let order = orders.get(ref);
      if (!order) {
        order = {
          id: randomUUID(), ref, sku, quantity, calls: 0,
          accounts: Array.from({ length: quantity }, (_, i) => `${sku}-${ref}-${i + 1}@mock.local|pw${i + 1}`),
        };
        orders.set(ref, order);
      }
      order.calls++;
      if (sku === 'slow' && order.calls === 1) return send(res, 200, { id: order.id, ref, status: 'processing' });
      return send(res, 200, { id: order.id, ref, status: 'completed', accounts: order.accounts });
    }

    send(res, 404, { error: 'Not found' });
  });
}
