import type { OrderStatus, ProductType, Tier } from '@web12/core';

const vnd = new Intl.NumberFormat('vi-VN');

export function formatVnd(n: number): string {
  return `${vnd.format(n)}đ`;
}

export function formatDate(d: Date): string {
  return new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export const TYPE_LABEL: Record<ProductType, string> = { STOCK: 'Kho', UNIQUE: 'Hàng riêng', API: 'Nguồn API' };
export const STATUS_LABEL: Record<OrderStatus, string> = { PENDING: 'Đang xử lý', COMPLETED: 'Hoàn thành', REFUNDED: 'Đã hoàn tiền' };
export const TIER_LABEL: Record<Tier, string> = { MEMBER: 'Thành viên', CTV: 'CTV', AGENT: 'Đại lý' };
