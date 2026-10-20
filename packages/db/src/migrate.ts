import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export const ALL_TABLES = [
  'users', 'sessions', 'api_keys', 'categories', 'suppliers', 'products',
  'orders', 'stock_items', 'ledger_entries', 'bank_transactions',
];

export async function migrate(pool: pg.Pool): Promise<string[]> {
  const enc = await pool.query<{ server_encoding: string }>('SHOW server_encoding');
  if (enc.rows[0]?.server_encoding !== 'UTF8') {
    throw new Error(`Database encoding is ${enc.rows[0]?.server_encoding}; UTF8 is required for Vietnamese text`);
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
  );
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
