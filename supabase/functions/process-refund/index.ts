// POST /process-refund { refundId } — staff only. Calls the provider, then records the outcome.
import { adminClient, corsHeaders, fail, json, readJson, requireUser } from '../_shared/http.ts';
import { getProvider, type Provider } from '../_shared/providers.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, (raw) => {
    const id = (raw as { refundId?: unknown })?.refundId;
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error('invalid');
    return { refundId: id };
  });
  if (body instanceof Response) return body;

  const admin = adminClient();
  const { data: refund } = await admin.from('refunds').select('id, amount_kobo, reason, status, payment_id').eq('id', body.refundId).maybeSingle();
  if (!refund) return fail('not_found', 404);
  if (refund.status !== 'requested' && refund.status !== 'failed') return fail('already_processed', 409);

  const { data: payment } = await admin.from('payments')
    .select('provider, provider_reference, reference, booking_id, order_id').eq('id', refund.payment_id).single();
  if (!payment) return fail('not_found', 404);

  // Authorise against the payment's branch scope, using the caller's identity.
  const { data: branch } = await admin.rpc('payment_branch_id', { p_booking: payment.booking_id, p_order: payment.order_id });
  const { data: allowed } = await auth.client.rpc('has_permission', { p_permission: 'refunds.create', p_branch: branch ?? null });
  if (!allowed) return fail('forbidden', 403);

  await admin.from('refunds').update({ status: 'processing', processed_by: auth.userId }).eq('id', refund.id);
  try {
    const provider = payment.provider as Provider;
    const providerRef = provider === 'paystack' ? payment.reference : payment.provider_reference;
    const result = await getProvider(provider).refund({
      providerReference: providerRef ?? payment.reference,
      amountKobo: Number(refund.amount_kobo),
      reason: refund.reason,
    });
    await admin.rpc('finalize_refund', { p_refund: refund.id, p_success: true, p_provider_refund_id: result.id, p_failure: null, p_processed_by: auth.userId });
    return json({ status: 'completed' });
  } catch (e) {
    console.error('refund failed', (e as Error).message);
    await admin.rpc('finalize_refund', { p_refund: refund.id, p_success: false, p_provider_refund_id: null, p_failure: (e as Error).message, p_processed_by: auth.userId });
    return fail('refund_failed', 502, 'The provider could not process the refund. It can be retried.');
  }
});
