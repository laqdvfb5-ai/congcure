import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '@web12/db';
import {
  FULFILL_QUEUE, getBoss, purchase, setFulfillEnqueuer, stopBoss, usePgBossEnqueuer,
  type FulfillJobData,
} from '../src/index';
import { makeProduct, makeUser } from './factories';

afterAll(async () => {
  setFulfillEnqueuer(null);
  await stopBoss();
});

describe('pg-boss enqueuer', () => {
  it('enqueues a job for API purchases', async () => {
    usePgBossEnqueuer();
    const s = await getPool().query<{ id: number }>(
      `INSERT INTO suppliers (name, base_url, api_key_enc) VALUES ('m', 'http://x', 'x') RETURNING id`,
    );
    const p = await makeProduct({ type: 'API', supplierId: s.rows[0]!.id, supplierSku: 'netflix-1m' });
    const u = await makeUser({ balance: 100_000 });
    const o = await purchase(u.id, p.id, 1);

    const boss = await getBoss();
    const jobs = await boss.fetch<FulfillJobData>(FULFILL_QUEUE, { batchSize: 10 });
    expect(jobs.map((j) => j.data.orderId)).toContain(o.id);
  });
});
