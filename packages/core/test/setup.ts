import { afterAll, beforeEach } from 'vitest';
import { ALL_TABLES, closePool, getPool, loadEnv } from '@web12/db';

loadEnv();
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SECRET_KEY ||= Buffer.alloc(32, 7).toString('base64');
process.env.WEBHOOK_TOKEN ||= 'test-webhook-token';

beforeEach(async () => {
  await getPool().query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closePool();
});
