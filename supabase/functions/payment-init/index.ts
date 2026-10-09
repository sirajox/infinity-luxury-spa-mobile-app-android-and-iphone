// POST /payment-init  { purpose, targetId, provider }
// The caller's JWT is used for create_payment_intent so the database authorises the request and derives
// the amount from authoritative records. The provider secret never leaves this function.
import { adminClient, corsHeaders, dbError, env, fail, json, readJson, requireUser } from '../_shared/http.ts';
import { getProvider, type Provider } from '../_shared/providers.ts';

const PURPOSES = ['booking', 'booking_balance', 'order', 'membership', 'package'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Body { purpose: (typeof PURPOSES)[number]; targetId: string; provider: Provider }

function parse(raw: unknown): Body {
  const b = raw as Partial<Body>;
  if (!b || !PURPOSES.includes(b.purpose as Body['purpose']) || typeof b.targetId !== 'string' || !UUID.test(b.targetId)
      || (b.provider !== 'paystack' && b.provider !== 'flutterwave')) {
    throw new Error('invalid');
  }
  return b as Body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (!auth.email) return fail('email_required', 400, 'An email address is required to pay.');

  const body = await readJson(req, parse);
  if (body instanceof Response) return body;

  const { data: payment, error } = await auth.client.rpc('create_payment_intent', {
    p_purpose: body.purpose, p_target: body.targetId, p_provider: body.provider,
  });
  if (error) return dbError(error);
  const p = payment as { reference: string; amount_kobo: number; currency: string };

  try {
    const init = await getProvider(body.provider).initialize({
      reference: p.reference,
      email: auth.email,
      amountKobo: Number(p.amount_kobo),
      currency: p.currency,
      callbackUrl: env('PAYMENT_CALLBACK_URL'),
      metadata: { purpose: body.purpose, target_id: body.targetId, user_id: auth.userId },
    });
    await adminClient().rpc('record_payment_initialized', {
      p_reference: p.reference,
      p_provider_reference: init.providerReference,
      p_authorization_url: init.authorizationUrl,
      p_access_code: init.accessCode,
    });
    return json({ reference: p.reference, authorizationUrl: init.authorizationUrl, amountKobo: Number(p.amount_kobo) });
  } catch (e) {
    console.error('payment-init provider failure', (e as Error).message);
    await adminClient().rpc('mark_payment_failed', { p_reference: p.reference, p_reason: 'provider_initialisation_failed' });
    return fail('provider_unavailable', 502, 'The payment provider could not be reached. Please try again.');
  }
});
