import { describe, expect, it } from 'vitest';
import {
  assignBankTxn, getUser, handleBankWebhook, listBankTxns, listLedger, parseTopupCode,
  type BankWebhookPayload,
} from '../src/index';
import { makeUser } from './factories';

const payload = (over: Partial<BankWebhookPayload>): BankWebhookPayload => ({
  id: 1, gateway: 'MBBank', transferType: 'in', transferAmount: 100_000, content: '', ...over,
});

describe('topup', () => {
  it('parses codes from messy bank content', () => {
    expect(parseTopupCode('CT DEN:123 NAP42 FT2410')).toBe('NAP42');
    expect(parseTopupCode('nap 7 chuyen tien')).toBe('NAP7');
    expect(parseTopupCode('NAP15FT99')).toBe('NAP15');
    expect(parseTopupCode('no code here')).toBeNull();
  });

  it('credits the matched user exactly once, even when delivered concurrently', async () => {
    const u = await makeUser();
    const p = payload({ id: 555, content: `IBFT ${u.topupCode} thanh toan` });
    const results = await Promise.all([handleBankWebhook(p), handleBankWebhook(p), handleBankWebhook(p)]);
    expect(results.filter((r) => r.status === 'MATCHED')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'DUPLICATE')).toHaveLength(2);
    expect((await getUser(u.id))?.balance).toBe(100_000);
    const ledger = await listLedger(u.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.type).toBe('TOPUP');
  });

  it('records unmatched and outgoing transfers without crediting', async () => {
    expect(await handleBankWebhook(payload({ id: 2, content: 'random' }))).toEqual({ status: 'UNMATCHED', userId: null });
    expect((await handleBankWebhook(payload({ id: 3, transferType: 'out', content: 'NAP1' }))).status).toBe('IGNORED');
    expect((await listBankTxns({ status: 'UNMATCHED' })).map((t) => t.providerTxnId)).toEqual(['2']);
  });

  it('rejects malformed payloads', async () => {
    await expect(handleBankWebhook(payload({ transferAmount: -5 }))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(handleBankWebhook({ ...payload({}), id: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('lets an admin assign an unmatched transfer once', async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    await handleBankWebhook(payload({ id: 9, transferAmount: 50_000, content: 'quen ghi noi dung' }));
    const [txn] = await listBankTxns({ status: 'UNMATCHED' });
    await assignBankTxn(txn!.id, u.id, admin.id);
    expect((await getUser(u.id))?.balance).toBe(50_000);
    await expect(assignBankTxn(txn!.id, u.id, admin.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await getUser(u.id))?.balance).toBe(50_000);
  });
});
