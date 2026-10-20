import { afterAll, beforeEach } from 'vitest';
import { closePool, getPool } from '@web12/db';
import { ALL_TABLES, loadEnv } from '@web12/db/node';

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
