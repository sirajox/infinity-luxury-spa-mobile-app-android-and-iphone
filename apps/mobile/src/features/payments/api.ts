import { FunctionsHttpError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export type PaymentPurpose = 'booking' | 'booking_balance' | 'order' | 'membership' | 'package';
export type Provider = 'paystack' | 'flutterwave';
export type PaymentOutcome = 'succeeded' | 'failed' | 'pending' | 'mismatch';

async function invoke<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (payload?.error?.code) throw new AppError(payload.error.code);
    }
    throw error;
  }
  return data as T;
}

export async function startPayment(p: { purpose: PaymentPurpose; targetId: string; provider: Provider }) {
  return invoke<{ reference: string; authorizationUrl: string; amountKobo: number }>('payment-init', p);
}

export async function verifyPayment(reference: string): Promise<PaymentOutcome> {
  const r = await invoke<{ status: PaymentOutcome }>('payment-verify', { reference });
  return r.status;
}

/** Poll briefly: bank transfer/USSD confirmations can land a few seconds after the customer returns. */
export async function confirmPayment(reference: string, attempts = 6): Promise<PaymentOutcome> {
  let outcome: PaymentOutcome = 'pending';
  for (let i = 0; i < attempts; i++) {
    outcome = await verifyPayment(reference);
    if (outcome !== 'pending') return outcome;
    await new Promise((r) => setTimeout(r, 2000 + i * 500));
  }
  return outcome;
}

export interface CheckoutResult { reference: string; outcome: PaymentOutcome | 'cancelled' }

/**
 * Opens the provider's hosted checkout (card details never touch the app or our servers), then asks the backend
 * to verify with the provider. The outcome is whatever the verified backend says, not what the browser returned.
 */
export async function runHostedCheckout(p: { purpose: PaymentPurpose; targetId: string; provider: Provider }): Promise<CheckoutResult> {
  const init = await startPayment(p);
  const returnUrl = Linking.createURL('payment-return');
  const result = await WebBrowser.openAuthSessionAsync(init.authorizationUrl, returnUrl);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    // The customer may have paid and closed the window early; check once before reporting cancellation.
    const outcome = await verifyPayment(init.reference).catch(() => 'pending' as const);
    return { reference: init.reference, outcome: outcome === 'succeeded' ? 'succeeded' : 'cancelled' };
  }
  return { reference: init.reference, outcome: await confirmPayment(init.reference) };
}

export async function fetchEnabledProviders(): Promise<Provider[]> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'payments.providers').maybeSingle();
  if (error) throw new Error(error.message);
  const list = Array.isArray(data?.value) ? (data?.value as unknown[]) : ['paystack'];
  return list.filter((p): p is Provider => p === 'paystack' || p === 'flutterwave');
}
