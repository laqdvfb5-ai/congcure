import { closePool } from '@web12/db';
import { loadEnv } from '@web12/db/node';
import {
  FULFILL_QUEUE, fulfillApiOrder, getBoss, listStalePendingOrders, stopBoss, type FulfillJobData,
  expireBankPayments,
  listDuePreorders,
} from '@web12/core';

loadEnv();

const SWEEP_EVERY_MS = 60_000;
const STALE_AFTER_SECONDS = 600;

const boss = await getBoss({ supervise: true });

await boss.work<FulfillJobData>(FULFILL_QUEUE, async ([job]) => {
  if (!job) return;
  const outcome = await fulfillApiOrder(job.data.orderId);
  console.log(`order ${job.data.orderId}: ${outcome}`);
});

async function sweep() {
  try {
    await expireBankPayments();
    const ids = await listStalePendingOrders(STALE_AFTER_SECONDS);
    for (const orderId of ids) await boss.send(FULFILL_QUEUE, { orderId } satisfies FulfillJobData);
    for (const orderId of await listDuePreorders()) await boss.send(FULFILL_QUEUE, { orderId } satisfies FulfillJobData);
    if (ids.length) console.log(`sweeper re-enqueued ${ids.length} order(s)`);
  } catch (err) {
    console.error('sweeper failed', err);
  }
}
const timer = setInterval(sweep, SWEEP_EVERY_MS);
await sweep();

console.log('Worker started');

async function shutdown() {
  clearInterval(timer);
  await stopBoss();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
