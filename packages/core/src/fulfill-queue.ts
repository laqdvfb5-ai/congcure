export type FulfillEnqueuer = (orderId: number) => Promise<void>;

let enqueuer: FulfillEnqueuer | null = null;

export function setFulfillEnqueuer(fn: FulfillEnqueuer | null): void {
  enqueuer = fn;
}

/** Never throws: a failed enqueue is recovered by the worker's stale-order sweeper. */
export async function enqueueFulfill(orderId: number): Promise<void> {
  if (!enqueuer) return;
  try {
    await enqueuer(orderId);
  } catch (err) {
    console.error(`enqueueFulfill(${orderId}) failed; sweeper will retry`, err);
  }
}
