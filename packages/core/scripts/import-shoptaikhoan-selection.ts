import { closePool, getPool } from '@web12/db';
import { loadEnv } from '@web12/db/node';
import {
  createCategory, createProduct, decryptSecret, getSupplier, listCategories, listProducts,
  SHOPTAIKHOAN_BASE_URL, type ProductInput,
} from '../src/index';

interface SelectedProduct {
  sku: string;
  name: string;
  price: number;
  category: string;
  categorySlug: string;
  url: string;
  image: string;
  description: string;
  attributes: Record<string, string>;
}

// Public storefront data checked on 2026-10-21; prices are references, not margins.
const selection: SelectedProduct[] = [
  {
    sku: '12339', name: 'Slot Canva Edu 1 Năm - BHF', price: 20_000,
    category: 'Thiết kế & Video', categorySlug: 'thiet-ke-video',
    url: 'https://shoptaikhoan.store/shop/products/slot-canva-pro-1-thang-bhf',
    image: 'https://api.shoptaikhoan.store/uploads/category-covers/category-cover-1790520792785-garj6o3x.webp',
    description: 'Slot Canva Edu theo tên sản phẩm được nhà cung cấp niêm yết.\n\nThông tin cần xác nhận: tên sản phẩm ghi thời hạn 1 năm, nhưng phần mô tả trên nguồn đang ghi Canva Pro 1 tháng. Chưa mở bán cho đến khi nhà cung cấp xác nhận đúng gói và thời hạn.\n\nTheo hướng dẫn của nguồn, quyền sử dụng được cấp cho email Canva của khách. Cần giữ nguyên tư cách thành viên trong Team; không tự ý mời người, đổi quyền hoặc can thiệp cấu hình nhóm. Việc tự rời nhóm có thể làm mất quyền sử dụng và bảo hành.',
    attributes: { 'Nền tảng': 'Canva', 'Thời hạn': 'Chờ xác nhận: tên ghi 1 năm, mô tả ghi 1 tháng' },
  },
  {
    sku: '12307', name: 'Capcut Pro 30D - BHF', price: 75_000,
    category: 'Thiết kế & Video', categorySlug: 'thiet-ke-video',
    url: 'https://shoptaikhoan.store/shop/products/capcut-pro-30d-bao-hanh-full',
    image: 'https://api.shoptaikhoan.store/uploads/category-covers/category-cover-1775608066672-8qpqfti4.png',
    description: 'Gói Capcut Pro thời hạn 30 ngày theo sản phẩm của nhà cung cấp.\n\nĐiều kiện sử dụng: cần duy trì trong Team đã được cấp. Theo mô tả nguồn, trường hợp rời hoặc rớt Team không được bảo hành. Liên hệ hỗ trợ khi phát sinh vấn đề trong quá trình sử dụng.',
    attributes: { 'Nền tảng': 'Capcut', 'Thời hạn': '30 ngày', 'Điều kiện': 'Duy trì trong Team được cấp' },
  },
  {
    sku: '12341', name: 'Slot Canva Pro 1 Tháng - BHF', price: 15_000,
    category: 'Thiết kế & Video', categorySlug: 'thiet-ke-video',
    url: 'https://shoptaikhoan.store/shop/products/slot-canva-pro-1-thang-bhf-copy-copy',
    image: 'https://api.shoptaikhoan.store/uploads/category-covers/category-cover-1790520792785-garj6o3x.webp',
    description: 'Quyền sử dụng Canva Pro trong 1 tháng, cấp trực tiếp cho email Canva của khách. Nguồn niêm yết bảo hành trong thời gian sử dụng, theo điều kiện của Team.\n\nSử dụng email đã được cấp quyền và duy trì thành viên trong nhóm. Không tự ý rời Team, mời thêm người, thay đổi quyền hoặc cấu hình nhóm; không spam hay lạm dụng tính năng. Tự rời nhóm có thể mất quyền Pro và bảo hành. Khi gặp lỗi, liên hệ hỗ trợ để kiểm tra.',
    attributes: { 'Nền tảng': 'Canva', 'Thời hạn': '1 tháng', 'Hình thức': 'Cấp quyền cho email Canva của khách' },
  },
  {
    sku: '12313', name: 'Link nhận gói Gemini Pro & Drive 5TB 18 Tháng Chính chủ - Không cần thẻ thanh toán', price: 27_000,
    category: 'AI & Công cụ', categorySlug: 'ai-cong-cu',
    url: 'https://shoptaikhoan.store/shop/products/goi-gemini-pro-drive-5tb-18-thang-chinh-chu',
    image: 'https://api.shoptaikhoan.store/uploads/category-covers/category-cover-1789453537527-f0vznf79.jpg',
    description: 'Link ưu đãi Gemini Pro và Google Drive dung lượng 5TB, thời hạn 18 tháng, sử dụng trên tài khoản Google của khách. Theo nguồn, không cần cung cấp thẻ thanh toán để nhận gói.\n\nKích hoạt: mở đường dẫn được giao sau khi mua và xác nhận nhận ưu đãi trên tài khoản Google cần sử dụng. Phải kích hoạt ngay khi nhận link. Nếu không nhận được gói hoặc gói bị mất, liên hệ hỗ trợ để kiểm tra.',
    attributes: { 'Nền tảng': 'Google Gemini / Google Drive', 'Thời hạn': '18 tháng', 'Dung lượng': '5TB', 'Hình thức': 'Link kích hoạt trên tài khoản của khách', 'Thẻ thanh toán': 'Không yêu cầu theo thông tin nguồn' },
  },
  {
    sku: '12342', name: 'Super Duolingo 12 Tháng chính chủ - Đọc kỹ mô tả hướng dẫn kích hoạt', price: 50_000,
    category: 'Học tập', categorySlug: 'hoc-tap',
    url: 'https://shoptaikhoan.store/shop/products/duolingo-12-thang',
    image: 'https://api.shoptaikhoan.store/uploads/category-covers/category-cover-1790732249478-d3u1oeyg.webp',
    description: 'Gói Super Duolingo 12 tháng cho tài khoản của khách, giao bằng đường dẫn kích hoạt.\n\nCác bước kích hoạt theo nhà cung cấp:\n1. Kết nối VPN đến Ấn Độ (India) trên thiết bị.\n2. Mở trình duyệt và đăng nhập đúng tài khoản Duolingo cần nâng cấp.\n3. Khi VPN đã kết nối và tài khoản đã đăng nhập, mở link được giao rồi xác nhận kích hoạt.\n4. Sau khi hoàn tất, có thể ngắt VPN.\n\nQuan trọng: không mở link trước khi hoàn thành bước kết nối VPN và đăng nhập. Theo nguồn, thao tác sai thứ tự có thể làm mã không còn sử dụng được.',
    attributes: { 'Nền tảng': 'Duolingo', 'Thời hạn': '12 tháng', 'Hình thức': 'Link kích hoạt trên tài khoản của khách', 'Điều kiện kích hoạt': 'VPN Ấn Độ, đăng nhập trước khi mở link' },
  },
];

interface ApiProductResponse {
  success?: boolean;
  data?: { id: number; name: string; price: number; currency: string; stock: number | null };
  error?: { code?: string };
}

loadEnv();
try {
  const supplier = await getSupplier(2);
  if (!supplier?.active || supplier.adapter !== 'shoptaikhoan' || supplier.baseUrl !== SHOPTAIKHOAN_BASE_URL) {
    throw new Error('Expected active ShopTaiKhoan supplier #2 at its official API URL');
  }
  const secret = await getPool().query<{ apiKeyEnc: string }>(
    'SELECT api_key_enc AS "apiKeyEnc" FROM suppliers WHERE id = $1', [supplier.id],
  );
  const headers = { 'x-api-key': decryptSecret(secret.rows[0]!.apiKeyEnc) };
  const inspected = [];
  for (const item of selection) {
    const response = await fetch(`${supplier.baseUrl}/products/${item.sku}`, { headers, signal: AbortSignal.timeout(30_000) });
    const body = await response.json() as ApiProductResponse;
    const unavailable = response.status === 404 && body.error?.code === 'PRODUCT_NOT_AVAILABLE';
    if (!unavailable && (!response.ok || !body.success || body.data?.id !== Number(item.sku))) {
      throw new Error(`Cannot verify SKU ${item.sku}: HTTP ${response.status}`);
    }
    const price = unavailable ? item.price : body.data!.price;
    if (!Number.isSafeInteger(price) || price <= 0 || (!unavailable && body.data!.currency !== 'VND')) {
      throw new Error(`Invalid VND price for SKU ${item.sku}`);
    }
    inspected.push({ item, price, apiStatus: unavailable ? 'PRODUCT_NOT_AVAILABLE' : 'AVAILABLE', apiStock: unavailable ? null : body.data!.stock });
  }

  const apply = process.argv.includes('--apply');
  const categories = await listCategories();
  const existing = await listProducts({ activeOnly: false });
  const report = [];
  for (const { item, price, apiStatus, apiStock } of inspected) {
    const duplicate = existing.find(p => p.supplierId === supplier.id && p.supplierSku === item.sku);
    if (duplicate) {
      report.push({ id: duplicate.id, name: duplicate.name, action: 'existing', active: duplicate.active, apiStatus, apiStock });
      continue;
    }
    let category = categories.find(c => c.slug === item.categorySlug);
    if (apply && !category) {
      category = await createCategory({ name: item.category, slug: item.categorySlug, sortOrder: 5 + categories.length });
      categories.push(category);
    }
    const input: ProductInput = {
      categoryId: category?.id ?? 0, name: item.name, description: item.description,
      images: [item.image], attributes: item.attributes, type: 'API',
      supplierId: supplier.id, supplierSku: item.sku,
      priceMember: price, priceCtv: price, priceAgent: price,
      // Import as drafts: source access and retail margins still need to be resolved.
      active: false,
    };
    const product = apply ? await createProduct(input) : null;
    report.push({ id: product?.id ?? null, name: item.name, sku: item.sku, category: item.category,
      priceReference: price, active: false, apiStatus, apiStock, sourceUrl: item.url, action: apply ? 'created' : 'planned' });
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closePool();
}
