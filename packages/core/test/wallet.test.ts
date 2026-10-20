import { describe, expect, it } from 'vitest';
import { getPool, withTx } from '@web12/db';
import { adjustBalance, applyBalanceChange, getUser, listLedger } from '../src/index';
import { makeUser } from './factories';

describe('wallet', () => {
  it('credits and debits with one ledger row each', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    expect(await adjustBalance(u.id, 100_000, 'bonus', admin.id)).toBe(100_000);
    expect(await adjustBalance(u.id, -30_000, 'fix', admin.id)).toBe(70_000);

    const ledger = await listLedger(u.id);
    expect(ledger.map((e) => [e.amount, e.balanceAfter, e.type])).toEqual([
      [-30_000, 70_000, 'ADJUST'],
      [100_000, 100_000, 'ADJUST'],
    ]);
    expect(ledger[0]?.createdBy).toBe(admin.id);
  });

  it('refuses to go negative and leaves no ledger row', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    await expect(adjustBalance(u.id, -1, 'x', admin.id)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await listLedger(u.id)).toHaveLength(0);
    expect((await getUser(u.id))?.balance).toBe(0);
  });

  it('validates amount, note and user', async () => {
    const u = await makeUser();
    await expect(adjustBalance(u.id, 0, 'x', u.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(adjustBalance(u.id, 1.5, 'x', u.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(adjustBalance(u.id, 10, '  ', u.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(withTx((c) => applyBalanceChange(c, 999_999, 10, 'ADJUST'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('stays consistent under concurrent debits', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    await adjustBalance(u.id, 50_000, 'seed', admin.id);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => adjustBalance(u.id, -10_000, 'spend', admin.id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    const sum = await getPool().query<{ s: number }>(
      'SELECT COALESCE(SUM(amount), 0)::bigint AS s FROM ledger_entries WHERE user_id = $1', [u.id],
    );
    expect((await getUser(u.id))?.balance).toBe(0);
    expect(sum.rows[0]?.s).toBe(0);
  });
});
