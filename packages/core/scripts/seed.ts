import { closePool, getPool } from '@web12/db';
import { loadEnv, migrate } from '@web12/db/node';
import {
  addStock, adjustBalance, createCategory, createProduct, createSupplier, registerUser, setUserRole, setUserTier,
} from '../src/index';

loadEnv();
await migrate(getPool());

const existing = await getPool().query('SELECT 1 FROM users LIMIT 1');
if (existing.rowCount) {
  console.log('Database already has users; skipping seed.');
  await closePool();
  process.exit(0);
}

const admin = await registerUser({ email: 'admin@shop.local', password: 'admin12345', name: 'Admin' });
await setUserRole(admin.id, 'ADMIN');

const customer = await registerUser({ email: 'khach@shop.local', password: 'khach12345', name: 'Khách lẻ' });
await adjustBalance(customer.id, 500_000, 'Seed', admin.id);

const agent = await registerUser({ email: 'daily@shop.local', password: 'daily12345', name: 'Đại lý A' });
await setUserTier(agent.id, 'AGENT');
await adjustBalance(agent.id, 2_000_000, 'Seed', admin.id);

const email = await createCategory({ name: 'Email', sortOrder: 1 });
const social = await createCategory({ name: 'Mạng xã hội', sortOrder: 2 });
const media = await createCategory({ name: 'Giải trí', sortOrder: 3 });

const supplier = await createSupplier({
  name: 'Mock supplier',
  baseUrl: `http://localhost:${process.env.MOCK_SUPPLIER_PORT ?? 4100}`,
  apiKey: process.env.MOCK_SUPPLIER_KEY ?? 'mock-key',
});

const gmail = await createProduct({
  categoryId: email.id, name: 'Gmail cổ 2015', type: 'STOCK',
  description: 'Gmail tạo năm 2015, đã xác minh số điện thoại.\nĐịnh dạng: email|mật khẩu|email khôi phục',
  priceMember: 15_000, priceCtv: 13_000, priceAgent: 11_000,
});
await addStock(gmail.id, Array.from({ length: 20 }, (_, i) => `gmail${i + 1}@example.com|Pass${1000 + i}|recover${i + 1}@example.com`));

const via = await createProduct({
  categoryId: social.id, name: 'Facebook VIA Việt Nam 2012', type: 'UNIQUE',
  description: 'Tài khoản duy nhất, có ảnh đại diện, 500 bạn bè.',
  images: ['https://placehold.co/600x400?text=Facebook+VIA'],
  attributes: { 'Năm tạo': '2012', 'Bạn bè': '500', 'Quốc gia': 'Việt Nam' },
  priceMember: 350_000, priceCtv: 320_000, priceAgent: 300_000,
});
await addStock(via.id, ['fb_via_2012|MatKhau@2012|2FA:JBSWY3DPEHPK3PXP']);

await createProduct({
  categoryId: media.id, name: 'Netflix Premium 1 tháng', type: 'API',
  description: 'Lấy trực tiếp từ nhà cung cấp, giao trong vài giây.',
  priceMember: 60_000, priceCtv: 55_000, priceAgent: 50_000,
  supplierId: supplier.id, supplierSku: 'netflix-1m',
});

await createProduct({
  categoryId: media.id, name: '[Test] Sản phẩm nguồn lỗi', type: 'API',
  description: 'Luôn thất bại ở nhà cung cấp, dùng để kiểm tra hoàn tiền tự động.',
  priceMember: 10_000, priceCtv: 10_000, priceAgent: 10_000,
  supplierId: supplier.id, supplierSku: 'fail-always',
});

console.log(`Seeded:
  admin@shop.local / admin12345 (ADMIN)
  khach@shop.local / khach12345 (500.000đ)
  daily@shop.local / daily12345 (Đại lý, 2.000.000đ)`);
await closePool();
