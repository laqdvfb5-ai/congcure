import type { BankWebhookPayload } from '@web12/core';
import { core } from '@/lib/core';

export async function POST(req: Request) {
  const expected = process.env.WEBHOOK_TOKEN;
  const auth = req.headers.get('authorization') ?? '';
  if (!expected || !core.safeEqual(auth, `Apikey ${expected}`)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  let payload: BankWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const result = await core.handleBankWebhook(payload);
    return Response.json({ success: true, status: result.status });
  } catch (e) {
    if (core.isAppError(e)) return Response.json({ success: false, error: e.message }, { status: e.status });
    console.error('bank webhook failed', e);
    return Response.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
