'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ProductType, Role, Tier } from '@web12/core';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { requireStaff } from '@/lib/session';

async function requireAdmin() {
  const user = await requireStaff();
  if (user.role !== 'ADMIN') throw new core.AppError('FORBIDDEN', 'Chỉ ADMIN được thực hiện thao tác này');
  return user;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const int = (f: FormData, k: string) => Number(str(f, k).replace(/[.,\s]/g, ''));
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function ok(path: string, message: string): never {
  revalidatePath(path);
  redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(message)}`);
}

export async function createCategoryAction(f: FormData) {
  try {
    await requireStaff();
    await core.createCategory({ name: str(f, 'name'), slug: str(f, 'slug') || undefined, sortOrder: int(f, 'sortOrder') || 0 });
  } catch (e) { fail('/admin/danh-muc', e); }
  ok('/admin/danh-muc', 'Đã tạo danh mục');
}

export async function saveProductAction(f: FormData) {
  const id = int(f, 'id');
  const back = id ? `/admin/san-pham/${id}` : '/admin/san-pham/moi';
  let savedId: number;
  try {
    await requireStaff();
    const attributes = Object.fromEntries(
      lines(str(f, 'attributes')).map((l) => {
        const i = l.indexOf(':');
        return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, ''];
      }),
    );
    const input = {
      categoryId: int(f, 'categoryId'),
      name: str(f, 'name'),
      slug: str(f, 'slug') || undefined,
      description: str(f, 'description'),
      images: lines(str(f, 'images')),
      attributes,
      type: str(f, 'type') as ProductType,
      priceMember: int(f, 'priceMember'),
      priceCtv: int(f, 'priceCtv'),
      priceAgent: int(f, 'priceAgent'),
      active: f.get('active') === 'on',
      supplierId: int(f, 'supplierId') || null,
      supplierSku: str(f, 'supplierSku') || null,
    };
    savedId = id ? (await core.updateProduct(id, input)).id : (await core.createProduct(input)).id;
  } catch (e) { fail(back, e); }
  ok(`/admin/san-pham/${savedId}`, 'Đã lưu sản phẩm');
}

export async function addStockAction(f: FormData) {
  const id = int(f, 'productId');
  let n: number;
  try {
    await requireStaff();
    n = await core.addStock(id, lines(str(f, 'lines')));
  } catch (e) { fail(`/admin/san-pham/${id}`, e); }
  ok(`/admin/san-pham/${id}`, `Đã nhập ${n} tài khoản`);
}

export async function setTierAction(f: FormData) {
  try {
    await requireStaff();
    await core.setUserTier(int(f, 'userId'), str(f, 'tier') as Tier);
  } catch (e) { fail('/admin/nguoi-dung', e); }
  ok('/admin/nguoi-dung', 'Đã đổi cấp');
}

export async function setRoleAction(f: FormData) {
  try {
    await requireAdmin();
    await core.setUserRole(int(f, 'userId'), str(f, 'role') as Role);
  } catch (e) { fail('/admin/nguoi-dung', e); }
  ok('/admin/nguoi-dung', 'Đã đổi vai trò');
}

export async function adjustBalanceAction(f: FormData) {
  try {
    const admin = await requireAdmin();
    const amount = Number(str(f, 'amount').replace(/[.,\s]/g, ''));
    await core.adjustBalance(int(f, 'userId'), amount, str(f, 'note'), admin.id);
  } catch (e) { fail('/admin/nguoi-dung', e); }
  ok('/admin/nguoi-dung', 'Đã điều chỉnh số dư');
}

export async function assignTxnAction(f: FormData) {
  try {
    const admin = await requireAdmin();
    const who = str(f, 'user');
    const userId = /^\d+$/.test(who) ? Number(who) : (await core.listUsers({ q: who, limit: 2 })).find((u) => u.email === who.toLowerCase())?.id;
    if (!userId || !(await core.getUser(userId))) throw new core.AppError('NOT_FOUND', 'Không tìm thấy người dùng');
    await core.assignBankTxn(int(f, 'txnId'), userId, admin.id);
  } catch (e) { fail('/admin/giao-dich', e); }
  ok('/admin/giao-dich', 'Đã cộng tiền');
}

export async function saveSupplierAction(f: FormData) {
  try {
    await requireStaff();
    const id = int(f, 'id');
    const base = { name: str(f, 'name'), baseUrl: str(f, 'baseUrl'), apiKey: str(f, 'apiKey') };
    if (id) await core.updateSupplier(id, { ...base, active: f.get('active') === 'on' });
    else await core.createSupplier(base);
  } catch (e) { fail('/admin/nha-cung-cap', e); }
  ok('/admin/nha-cung-cap', 'Đã lưu nhà cung cấp');
}
