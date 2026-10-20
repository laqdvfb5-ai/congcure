import { loadEnv } from '@web12/db/node';
import { createMockSupplierServer } from './server';

loadEnv();
const port = Number(process.env.MOCK_SUPPLIER_PORT ?? 4100);
const apiKey = process.env.MOCK_SUPPLIER_KEY ?? 'mock-key';
createMockSupplierServer({ apiKey }).listen(port, () => {
  console.log(`Mock supplier on http://localhost:${port} (X-API-Key: ${apiKey})`);
});
