import { afterEach, describe, expect, it } from 'vitest';
import { getPool } from '@web12/db';
import {
  cancelBankPayment, createBankPayment, expireBankPayments, getBankPaymentForUser,
  getOrder, getOrderSecrets, getProduct, getUser, handleBankWebhook, listLedger,
  listOrdersForUser, parseBankPaymentCode, purchase, refundOrder, setFulfillEnqueuer,
} from '../src/index';
import { makeProduct, makeUser } from './factories';

const bank = { bankId: 'TPB', bankAccount: '10006128860', bankAccountName: 'TEST BANK' };
const options = (requestKey = 'request-1') => ({ ...bank, requestKey });
let txn = 0;
const receipt = (code: string, amount: number) => ({
  id: `bank-${++txn}`, transferType: 'in', transferAmount: amount,
  content: `IBFT ${code} thanh toan`, accountNumber: bank.bankAccount,
});
afterEach(() => setFulfillEnqueuer(null));

describe('direct bank payments', () => {
  it('quotes server-side tier prices without charging the wallet or creating an order; retries are idempotent', async () => {
    const user = await makeUser({ tier: 'CTV', balance: 1234 });
    const product = await makeProduct({ stock: 4, prices: { priceMember: 10000, priceCtv: 9000, priceAgent: 8000 } });
    const [a, b] = await Promise.all([createBankPayment(user.id, product.id, 2, options()), createBankPayment(user.id, product.id, 2, options())]);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({ status: 'PENDING', unitPrice: 9000, total: 18000, receivedAmount: 0 });
    expect((await getUser(user.id))?.balance).toBe(1234);
    expect(await listOrdersForUser(user.id)).toHaveLength(0);
    expect((await getProduct(product.id))?.stock).toBe(4);
    await expect(createBankPayment(user.id, product.id, 1, options())).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('delivers stock exactly once for concurrent webhook retries without debiting the wallet', async () => {
    const user = await makeUser({ balance: 2345 });
    const product = await makeProduct({ stock: 2 });
    const payment = await createBankPayment(user.id, product.id, 2, options());
    const data = receipt(payment.code, payment.total);
    const results = await Promise.all([handleBankWebhook(data), handleBankWebhook(data), handleBankWebhook(data)]);
    expect(results.filter(r => r.status === 'MATCHED')).toHaveLength(1);
    const paid = await getBankPaymentForUser(payment.code, user.id);
    expect(paid.status).toBe('PAID');
    expect(await getOrderSecrets(paid.orderId!)).toEqual(['acc0|pass0', 'acc1|pass1']);
    expect(await getOrder(paid.orderId!)).toMatchObject({ paymentMethod: 'BANK', total: 20000, status: 'COMPLETED' });
    expect((await getUser(user.id))?.balance).toBe(2345);
    expect(await listLedger(user.id)).toHaveLength(0);
    expect(await listOrdersForUser(user.id)).toHaveLength(1);
  });

  it('aggregates partial transfers, honors the quoted price and credits only overpayment', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 1 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    await getPool().query('UPDATE products SET price_member = 30000 WHERE id = $1', [product.id]);
    await handleBankWebhook(receipt(payment.code, 4000));
    expect(await getBankPaymentForUser(payment.code, user.id)).toMatchObject({ status: 'PENDING', receivedAmount: 4000 });
    expect(await listOrdersForUser(user.id)).toHaveLength(0);
    expect((await getUser(user.id))?.balance).toBe(0);
    await handleBankWebhook(receipt(payment.code, 8000));
    const paid = await getBankPaymentForUser(payment.code, user.id);
    expect(paid).toMatchObject({ status: 'PAID', receivedAmount: 12000, creditedAmount: 2000 });
    expect((await getOrder(paid.orderId!))?.total).toBe(10000);
    expect((await getUser(user.id))?.balance).toBe(2000);
    await handleBankWebhook(receipt(payment.code, 10000));
    expect((await getUser(user.id))?.balance).toBe(12000);
    expect(await listOrdersForUser(user.id)).toHaveLength(1);
    expect((await listLedger(user.id)).map(e => e.amount)).toEqual([10000, 2000]);
  });

  it('serializes distinct concurrent transfers against a single payment', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 2 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    await Promise.all([handleBankWebhook(receipt(payment.code, 6000)), handleBankWebhook(receipt(payment.code, 6000))]);
    expect(await getBankPaymentForUser(payment.code, user.id)).toMatchObject({ status: 'PAID', receivedAmount: 12000, creditedAmount: 2000 });
    expect(await listOrdersForUser(user.id)).toHaveLength(1);
    expect((await getProduct(product.id))?.stock).toBe(1);
  });

  it('rejects wrong accounts, outgoing payments, unknown and ambiguous codes without crediting', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 2 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    expect((await handleBankWebhook({ ...receipt(payment.code, 10000), accountNumber: 'wrong' })).status).toBe('UNMATCHED');
    expect((await handleBankWebhook({ ...receipt(payment.code, 10000), transferType: 'out' })).status).toBe('IGNORED');
    expect((await handleBankWebhook(receipt(`DH0000000000000000 ${user.topupCode}`, 10000))).status).toBe('UNMATCHED');
    expect((await handleBankWebhook(receipt(`${payment.code} DH0000000000000000 ${user.topupCode}`, 10000))).status).toBe('UNMATCHED');
    expect((await getUser(user.id))?.balance).toBe(0);
    expect(await getBankPaymentForUser(payment.code, user.id)).toMatchObject({ status: 'PENDING', receivedAmount: 0 });
    expect(parseBankPaymentCode(`FT ${payment.code.toLowerCase()} payment`)).toBe(payment.code);
  });

  it('expires partial payments, credits them once and credits late transfers without ordering', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 1 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    await handleBankWebhook(receipt(payment.code, 3000));
    await getPool().query("UPDATE bank_payments SET expires_at = now() - interval '1 minute' WHERE id = $1", [payment.id]);
    await Promise.all([expireBankPayments(), expireBankPayments(), getBankPaymentForUser(payment.code, user.id)]);
    expect(await getBankPaymentForUser(payment.code, user.id)).toMatchObject({ status: 'EXPIRED', creditedAmount: 3000 });
    await handleBankWebhook(receipt(payment.code, 7000));
    expect((await getUser(user.id))?.balance).toBe(10000);
    expect(await listLedger(user.id)).toHaveLength(2);
    expect(await listOrdersForUser(user.id)).toHaveLength(0);
  });

  it('credits an expired full transfer even before the sweeper runs', async () => {
    const user = await makeUser();
    const payment = await createBankPayment(user.id, (await makeProduct({ stock: 1 })).id, 1, options());
    await getPool().query("UPDATE bank_payments SET expires_at = now() - interval '1 minute' WHERE id = $1", [payment.id]);
    await handleBankWebhook(receipt(payment.code, 10000));
    expect((await getUser(user.id))?.balance).toBe(10000);
    expect((await getBankPaymentForUser(payment.code, user.id)).status).toBe('EXPIRED');
    expect(await listOrdersForUser(user.id)).toHaveLength(0);
  });

  it('cancels safely, returns partial funds, protects ownership and rejects cancellation after payment', async () => {
    const user = await makeUser();
    const other = await makeUser();
    const product = await makeProduct({ stock: 2 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    await expect(getBankPaymentForUser(payment.code, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(cancelBankPayment(payment.code, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await handleBankWebhook(receipt(payment.code, 3000));
    await cancelBankPayment(payment.code, user.id);
    await cancelBankPayment(payment.code, user.id);
    await handleBankWebhook(receipt(payment.code, 7000));
    expect((await getUser(user.id))?.balance).toBe(10000);
    expect((await getBankPaymentForUser(payment.code, user.id)).status).toBe('CANCELLED');
    const paid = await createBankPayment(user.id, product.id, 1, options('second'));
    await handleBankWebhook(receipt(paid.code, 10000));
    await expect(cancelBankPayment(paid.code, user.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('credits received funds when stock sells out, without reselling a sold account', async () => {
    const user = await makeUser();
    const other = await makeUser({ balance: 20000 });
    const product = await makeProduct({ stock: 1 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    await purchase(other.id, product.id, 1);
    await handleBankWebhook(receipt(payment.code, 10000));
    expect(await getBankPaymentForUser(payment.code, user.id)).toMatchObject({ status: 'CREDITED', creditedAmount: 10000 });
    expect((await getUser(user.id))?.balance).toBe(10000);
    expect(await listOrdersForUser(user.id)).toHaveLength(0);
  });

  it('never delivers twice when two paid checkouts compete for the last stock item', async () => {
    const product = await makeProduct({ stock: 1 });
    const users = await Promise.all([makeUser(), makeUser()]);
    const payments = await Promise.all(users.map(user => createBankPayment(user.id, product.id, 1, options())));
    await Promise.all(payments.map(payment => handleBankWebhook(receipt(payment.code, 10000))));
    const settled = await Promise.all(payments.map(payment => getBankPaymentForUser(payment.code, payment.userId)));
    expect(settled.map(payment => payment.status).sort()).toEqual(['CREDITED', 'PAID']);
    expect((await getProduct(product.id))?.stock).toBe(0);
    const balances = await Promise.all(users.map(user => getUser(user.id)));
    expect(balances.reduce((sum, user) => sum + user!.balance, 0)).toBe(10000);
  });

  it('settles a cancellation racing with receipt without losing or double-spending funds', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 1 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    const [received, cancelled] = await Promise.allSettled([
      handleBankWebhook(receipt(payment.code, 10000)), cancelBankPayment(payment.code, user.id),
    ]);
    expect(received.status).toBe('fulfilled');
    if (cancelled.status === 'rejected') expect(cancelled.reason).toMatchObject({ code: 'CONFLICT' });
    const settled = await getBankPaymentForUser(payment.code, user.id);
    const orders = await listOrdersForUser(user.id);
    expect(['PAID', 'CANCELLED']).toContain(settled.status);
    expect(orders.length).toBe(settled.status === 'PAID' ? 1 : 0);
    expect((await getUser(user.id))!.balance + orders.reduce((sum, order) => sum + order.total, 0)).toBe(10000);
  });

  it('does not fulfill a deactivated or repurposed product', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 1 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    await getPool().query('UPDATE products SET active = false WHERE id = $1', [product.id]);
    await handleBankWebhook(receipt(payment.code, 10000));
    expect((await getBankPaymentForUser(payment.code, user.id)).status).toBe('CREDITED');
    expect((await getUser(user.id))?.balance).toBe(10000);
  });

  it('enqueues API delivery only after commit; supplier failure refunds to the wallet once', async () => {
    const supplier = (await getPool().query<{ id: number }>("INSERT INTO suppliers (name,base_url,api_key_enc) VALUES ('test','http://localhost','x') RETURNING id")).rows[0]!;
    const product = await makeProduct({ type: 'API', supplierId: supplier.id, supplierSku: 'sku', price: 12000 });
    const user = await makeUser({ balance: 50 });
    const payment = await createBankPayment(user.id, product.id, 1, options());
    const jobs: number[] = [];
    setFulfillEnqueuer(async id => {
      expect((await getBankPaymentForUser(payment.code, user.id)).status).toBe('PAID');
      jobs.push(id);
    });
    const data = receipt(payment.code, 12000);
    await handleBankWebhook(data);
    await handleBankWebhook(data);
    const paid = await getBankPaymentForUser(payment.code, user.id);
    expect(jobs).toEqual([paid.orderId]);
    expect(await getOrder(paid.orderId!)).toMatchObject({ status: 'PENDING', paymentMethod: 'BANK' });
    await Promise.all([refundOrder(paid.orderId!, 'supplier failure'), refundOrder(paid.orderId!, 'supplier failure')]);
    expect((await getUser(user.id))?.balance).toBe(12050);
    expect((await listLedger(user.id)).map(e => e.type)).toEqual(['REFUND']);
  });

  it('validates quantities, bank configuration, stock and limits pending payments', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 10 });
    await expect(createBankPayment(user.id, product.id, 0, options())).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createBankPayment(user.id, product.id, 1, { ...options(), bankAccount: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(createBankPayment(user.id, product.id, 11, options())).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    for (let i = 0; i < 5; i++) await createBankPayment(user.id, product.id, 1, options(String(i)));
    await expect(createBankPayment(user.id, product.id, 1, options('six'))).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
