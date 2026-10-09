// POST /paystack-webhook (verify_jwt = false; authenticity is established by the HMAC signature).
// Idempotent: (provider, event_id) is unique, so replays are acknowledged without reprocessing.
import { adminClient, fail, json } from '../_shared/http.ts';
import { verifyPaystackSignature } from '../_shared/signature.ts';
import { settleByVerification } from '../_shared/settle.ts';
import { env } from '../_shared/http.ts';

interface PaystackEvent {
  event: string;
  data: { id?: number | string; reference?: string; status?: string; transaction_reference?: string; refund_reference?: string };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const rawBody = await req.text();
  const valid = await verifyPaystackSignature(rawBody, req.headers.get('x-paystack-signature'), env('PAYSTACK_SECRET_KEY'));
  if (!valid) return fail('invalid_signature', 401);

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return fail('invalid_request', 400);
  }

  const admin = adminClient();
  const reference = event.data.reference ?? event.data.transaction_reference ?? null;
  const eventId = `${event.event}:${event.data.id ?? reference ?? crypto.randomUUID()}`;

  const { error: insertError } = await admin.from('payment_events').insert({
    provider: 'paystack', event_id: eventId, event_type: event.event, reference, payload: event,
  });
  if (insertError) {
    // 23505 = unique_violation: a replay of an event we already stored.
    if (insertError.code === '23505') return json({ received: true, duplicate: true });
    console.error('payment_events insert failed', insertError.message);
    return fail('server_error', 500);
  }

  let outcome = 'ignored';
  try {
    if (event.event === 'charge.success' && reference) {
      outcome = await settleByVerification(admin, reference, 'paystack');
    } else if (event.event === 'charge.failed' && reference) {
      await admin.rpc('mark_payment_failed', { p_reference: reference, p_reason: 'charge.failed' });
      outcome = 'failed';
    }
    await admin.from('payment_events').update({ processed_at: new Date().toISOString(), outcome }).eq('provider', 'paystack').eq('event_id', eventId);
  } catch (e) {
    console.error('paystack webhook processing failed', (e as Error).message);
    // Remove the stored event so the provider's retry is processed instead of treated as a duplicate.
    await admin.from('payment_events').delete().eq('provider', 'paystack').eq('event_id', eventId);
    return fail('processing_failed', 500);
  }
  return json({ received: true, outcome });
});
