import { getPool } from '@web12/db';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto';
import { AppError, isUniqueViolation } from './errors';
import type { ApiKey, User } from './types';
import { getUser, USER_COLS } from './users';

export const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(input: { email: string; password: string; name: string }): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) throw new AppError('INVALID_INPUT', 'Email không hợp lệ');
  if (input.password.length < 8) throw new AppError('INVALID_INPUT', 'Mật khẩu tối thiểu 8 ký tự');
  if (!name) throw new AppError('INVALID_INPUT', 'Vui lòng nhập tên');

  const hash = await hashPassword(input.password);
  try {
    const r = await getPool().query<{ id: number }>(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hash, name],
    );
    return (await getUser(r.rows[0]!.id))!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'Email đã được đăng ký');
    throw e;
  }
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const r = await getPool().query<{ id: number; passwordHash: string }>(
    'SELECT id, password_hash AS "passwordHash" FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const row = r.rows[0];
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AppError('UNAUTHORIZED', 'Sai email hoặc mật khẩu');
  }
  const token = randomToken();
  await getPool().query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), row.id, SESSION_DAYS],
  );
  return { token, user: (await getUser(row.id))! };
}

export async function getSessionUser(token: string): Promise<User | null> {
  if (!token) return null;
  const r = await getPool().query<User>(
    `SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return r.rows[0] ?? null;
}

export async function logout(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
}

const API_KEY_COLS = `id, name, prefix, last_used_at AS "lastUsedAt", revoked_at AS "revokedAt", created_at AS "createdAt"`;

export async function createApiKey(userId: number, name: string): Promise<{ key: string; apiKey: ApiKey }> {
  const label = name.trim() || 'default';
  const key = `sk_${randomToken(24)}`;
  const r = await getPool().query<ApiKey>(
    `INSERT INTO api_keys (user_id, name, prefix, key_hash) VALUES ($1, $2, $3, $4) RETURNING ${API_KEY_COLS}`,
    [userId, label, key.slice(0, 10), sha256(key)],
  );
  return { key, apiKey: r.rows[0]! };
}

export async function listApiKeys(userId: number): Promise<ApiKey[]> {
  const r = await getPool().query<ApiKey>(
    `SELECT ${API_KEY_COLS} FROM api_keys WHERE user_id = $1 ORDER BY id DESC`,
    [userId],
  );
  return r.rows;
}

export async function revokeApiKey(userId: number, id: number): Promise<void> {
  const r = await getPool().query(
    'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [id, userId],
  );
  if (r.rowCount === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy khóa API');
}

export async function getUserByApiKey(key: string): Promise<User | null> {
  if (!key) return null;
  const r = await getPool().query<{ userId: number }>(
    `UPDATE api_keys SET last_used_at = now()
     WHERE key_hash = $1 AND revoked_at IS NULL RETURNING user_id AS "userId"`,
    [sha256(key)],
  );
  const row = r.rows[0];
  return row ? getUser(row.userId) : null;
}
