import { getPool } from '@web12/db';
import { decryptSecret, encryptSecret } from '../crypto';
import { AppError } from '../errors';
import { createGenericRestAdapter } from './generic-rest';
import { SupplierError, type SupplierAdapter } from './types';

export * from './types';
export * from './generic-rest';

export interface Supplier {
  id: number;
  name: string;
  adapter: string;
  baseUrl: string;
  active: boolean;
  createdAt: Date;
}

export const SUPPLIER_ADAPTERS = ['generic-rest'];

const COLS = `id, name, adapter, base_url AS "baseUrl", active, created_at AS "createdAt"`;

function validate(input: { name: string; baseUrl: string; adapter?: string }) {
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const adapter = input.adapter ?? 'generic-rest';
  if (!name) throw new AppError('INVALID_INPUT', 'Vui lòng nhập tên nhà cung cấp');
  if (!/^https?:\/\/.+/.test(baseUrl)) throw new AppError('INVALID_INPUT', 'URL phải bắt đầu bằng http:// hoặc https://');
  if (!SUPPLIER_ADAPTERS.includes(adapter)) throw new AppError('INVALID_INPUT', 'Adapter không hợp lệ');
  return { name, baseUrl, adapter };
}

export async function createSupplier(input: { name: string; baseUrl: string; apiKey: string; adapter?: string }): Promise<Supplier> {
  const v = validate(input);
  if (!input.apiKey.trim()) throw new AppError('INVALID_INPUT', 'Vui lòng nhập API key');
  const r = await getPool().query<Supplier>(
    `INSERT INTO suppliers (name, adapter, base_url, api_key_enc) VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
    [v.name, v.adapter, v.baseUrl, encryptSecret(input.apiKey.trim())],
  );
  return r.rows[0]!;
}

export async function updateSupplier(
  id: number, input: { name: string; baseUrl: string; apiKey?: string; active: boolean },
): Promise<Supplier> {
  const v = validate(input);
  const key = input.apiKey?.trim();
  const r = await getPool().query<Supplier>(
    `UPDATE suppliers SET name = $2, base_url = $3, active = $4, api_key_enc = COALESCE($5, api_key_enc)
     WHERE id = $1 RETURNING ${COLS}`,
    [id, v.name, v.baseUrl, input.active, key ? encryptSecret(key) : null],
  );
  if (!r.rows[0]) throw new AppError('NOT_FOUND', 'Không tìm thấy nhà cung cấp');
  return r.rows[0];
}

export async function listSuppliers(): Promise<Supplier[]> {
  return (await getPool().query<Supplier>(`SELECT ${COLS} FROM suppliers ORDER BY id`)).rows;
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  return (await getPool().query<Supplier>(`SELECT ${COLS} FROM suppliers WHERE id = $1`, [id])).rows[0] ?? null;
}

export async function getAdapterForSupplier(id: number): Promise<SupplierAdapter> {
  const r = await getPool().query<{ baseUrl: string; apiKeyEnc: string; adapter: string; active: boolean }>(
    'SELECT base_url AS "baseUrl", api_key_enc AS "apiKeyEnc", adapter, active FROM suppliers WHERE id = $1',
    [id],
  );
  const s = r.rows[0];
  if (!s || !s.active) throw new SupplierError('Nhà cung cấp không hoạt động', false);
  switch (s.adapter) {
    case 'generic-rest':
      return createGenericRestAdapter({ baseUrl: s.baseUrl, apiKey: decryptSecret(s.apiKeyEnc) });
    default:
      throw new SupplierError(`Adapter không hỗ trợ: ${s.adapter}`, false);
  }
}
