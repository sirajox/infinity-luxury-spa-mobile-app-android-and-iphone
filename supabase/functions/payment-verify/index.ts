// POST /payment-verify  { reference }
// Called by the app when the customer returns from checkout. The result comes from the provider's API,
// never from anything the client claims.
import { adminClient, corsHeaders, fail, json, readJson, requireUser } from '../_shared/http.ts';
import { settleByVerification } from '../_shared/settle.ts';

function parse(raw: unknown): { reference: string } {
  const b = raw as { reference?: unknown };
  if (typeof b?.reference !== 'string' || !/^PAY-[A-Z0-9]{32}$/.test(b.reference)) throw new Error('invalid');
  return { reference: b.reference };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, parse);
  if (body instanceof Response) return body;

  // RLS ensures the caller can only look up their own payments.
  const { data: payment } = await auth.client.from('payments').select('reference, provider, status').eq('reference', body.reference).maybeSingle();
  if (!payment) return fail('not_found', 404);
  if (payment.status === 'succeeded' || payment.status === 'refunded' || payment.status === 'partially_refunded') {
    return json({ status: 'succeeded' });
  }

  try {
    const outcome = await settleByVerification(adminClient(), body.reference, payment.provider);
    return json({ status: outcome });
  } catch (e) {
    console.error('payment-verify failure', (e as Error).message);
    return fail('verification_unavailable', 502, 'We could not confirm the payment yet. Please try again shortly.');
  }
});
