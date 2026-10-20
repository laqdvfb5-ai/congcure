// Usage: node --env-file=.env scripts/fake-topup.mjs NAP1 200000
const [code, amount = '100000'] = process.argv.slice(2);
if (!code) {
  console.error('Usage: node --env-file=.env scripts/fake-topup.mjs <NAPxx> [amount]');
  process.exit(1);
}
const res = await fetch('http://localhost:3000/api/webhooks/bank', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Apikey ${process.env.WEBHOOK_TOKEN}` },
  body: JSON.stringify({
    id: Date.now(), gateway: 'MBBank', transferType: 'in', transferAmount: Number(amount),
    content: `CT ${code} chuyen tien`, transactionDate: new Date().toISOString(),
  }),
});
console.log(res.status, await res.json());
