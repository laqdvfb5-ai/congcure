import { getPool } from '@web12/db';
import { AppError } from './errors';
import { ROLES, TIERS, type Role, type Tier, type User } from './types';

export const USER_COLS = `u.id, u.email, u.name, u.role, u.tier, u.balance,
  u.topup_code AS "topupCode", u.created_at AS "createdAt"`;

export async function getUser(id: number): Promise<User | null> {
  const r = await getPool().query<User>(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function listUsers(opts: { q?: string; limit?: number } = {}): Promise<User[]> {
  const q = opts.q?.trim();
  const r = await getPool().query<User>(
    `SELECT ${USER_COLS} FROM users u
     WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
     ORDER BY u.id DESC LIMIT $2`,
    [q || null, opts.limit ?? 100],
  );
  return r.rows;
}

export async function setUserTier(id: number, tier: Tier): Promise<void> {
  if (!TIERS.includes(tier)) throw new AppError('INVALID_INPUT', 'Cấp không hợp lệ');
  const r = await getPool().query('UPDATE users SET tier = $2 WHERE id = $1', [id, tier]);
  if (r.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
}

export async function setUserRole(id: number, role: Role): Promise<void> {
  if (!ROLES.includes(role)) throw new AppError('INVALID_INPUT', 'Vai trò không hợp lệ');
  const r = await getPool().query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
  if (r.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy người dùng');
}
