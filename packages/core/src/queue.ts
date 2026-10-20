import { PgBoss } from 'pg-boss';
import { setFulfillEnqueuer } from './fulfill-queue';

export const FULFILL_QUEUE = 'fulfill-api-order';

export interface FulfillJobData {
  orderId: number;
}

const g = globalThis as typeof globalThis & { __web12Boss?: Promise<PgBoss> };

/** Process-wide pg-boss instance. Only the worker should pass supervise: true (runs maintenance). */
export function getBoss(opts: { supervise?: boolean } = {}): Promise<PgBoss> {
  g.__web12Boss ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    const boss = new PgBoss({ connectionString, supervise: opts.supervise ?? false, schedule: false });
    boss.on('error', (err) => console.error('pg-boss error', err));
    await boss.start();
    await boss.createQueue(FULFILL_QUEUE, {
      retryLimit: 10, retryDelay: 5, retryBackoff: true, retryDelayMax: 120,
    }).catch(() => {}); // already exists
    return boss;
  })().catch((err) => {
    g.__web12Boss = undefined;
    throw err;
  });
  return g.__web12Boss;
}

export async function stopBoss(): Promise<void> {
  const p = g.__web12Boss;
  g.__web12Boss = undefined;
  if (p) await (await p).stop({ graceful: true });
}

export function usePgBossEnqueuer(): void {
  setFulfillEnqueuer(async (orderId) => {
    const boss = await getBoss();
    await boss.send(FULFILL_QUEUE, { orderId } satisfies FulfillJobData);
  });
}
