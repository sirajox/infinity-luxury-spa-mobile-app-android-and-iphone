// POST /flutterwave-webhook (verify_jwt = false; authenticity via the `verif-hash` secret header).
import { adminClient, env, fail, json } from '../_shared/http.ts';
import { verifyFlutterwaveHash } from '../_shared/signature.ts';
import { settleByVerification } from '../_shared/settle.ts';

interface FlutterwaveEvent {
  event?: string;
  data?: { id?: number | string; tx_ref?: string; status?: string };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!verifyFlutterwaveHash(req.headers.get('verif-hash'), env('FLUTTERWAVE_WEBHOOK_HASH'))) {
    return fail('invalid_signature', 401);
  }

  let event: FlutterwaveEvent;
  try {
    event = (await req.json()) as FlutterwaveEvent;
  } catch {
    return fail('invalid_request', 400);
  }

  const admin = adminClient();
  const reference = event.data?.tx_ref ?? null;
  const eventId = `${event.event ?? 'unknown'}:${event.data?.id ?? reference ?? crypto.randomUUID()}`;

  const { error: insertError } = await admin.from('payment_events').insert({
    provider: 'flutterwave', event_id: eventId, event_type: event.event ?? 'unknown', reference, payload: event,
  });
  if (insertError) {
    if (insertError.code === '23505') return json({ received: true, duplicate: true });
    console.error('payment_events insert failed', insertError.message);
    return fail('server_error', 500);
  }

  try {
    let outcome = 'ignored';
    if (event.event === 'charge.completed' && reference) {
      outcome = await settleByVerification(admin, reference, 'flutterwave');
    }
    await admin.from('payment_events').update({ processed_at: new Date().toISOString(), outcome }).eq('provider', 'flutterwave').eq('event_id', eventId);
    return json({ received: true, outcome });
  } catch (e) {
    console.error('flutterwave webhook processing failed', (e as Error).message);
    await admin.from('payment_events').delete().eq('provider', 'flutterwave').eq('event_id', eventId);
    return fail('processing_failed', 500);
  }
});
