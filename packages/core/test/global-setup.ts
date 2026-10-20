import pg from 'pg';
import { loadEnv, migrate } from '@web12/db';

export default async function setup() {
  loadEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set (copy .env.example to .env)');
  const pool = new pg.Pool({ connectionString: url });
  await pool.query('DROP SCHEMA IF EXISTS pgboss CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await pool.end();
}
