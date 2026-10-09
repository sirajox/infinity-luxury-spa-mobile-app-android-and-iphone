import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getProvider, type Provider } from './providers.ts';

export type SettleOutcome = 'succeeded' | 'failed' | 'pending' | 'mismatch';

/**
 * Confirm a payment with the provider's own API and apply the result atomically in the database.
 * Used by both the webhook handlers and the client-triggered verify endpoint, so a payment is never
 * trusted because a client or an unverified event said so.
 */
export async function settleByVerification(admin: SupabaseClient, reference: string, provider: Provider): Promise<SettleOutcome> {
  const verified = await getProvider(provider).verify(reference);

  if (verified.success) {
    const { data, error } = await admin.rpc('apply_payment_success', {
      p_reference: reference,
      p_provider_reference: verified.providerReference,
      p_amount_kobo: verified.amountKobo,
      p_currency: verified.currency,
    });
    if (error) throw new Error(`apply_payment_success failed: ${error.message}`);
    return (data as { status: string }).status === 'succeeded' ? 'succeeded' : 'mismatch';
  }
  if (verified.failed) {
    await admin.rpc('mark_payment_failed', { p_reference: reference, p_reason: verified.reason ?? 'declined' });
    return 'failed';
  }
  return 'pending';
}
