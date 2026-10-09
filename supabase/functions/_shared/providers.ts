import { env } from './http.ts';

export type Provider = 'paystack' | 'flutterwave';

export interface InitResult {
  authorizationUrl: string;
  providerReference: string | null;
  accessCode: string | null;
}

export interface VerifyResult {
  /** True only when the provider reports the transaction as successfully paid. */
  success: boolean;
  /** Terminal failure reported by the provider (as opposed to still pending). */
  failed: boolean;
  amountKobo: number;
  currency: string;
  providerReference: string;
  reason?: string;
}

/**
 * Provider abstraction: initialisation, verification and refunds.
 * Payment workflows depend on this interface, never on a specific provider.
 */
export interface PaymentProvider {
  initialize(args: { reference: string; email: string; amountKobo: number; currency: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<InitResult>;
  verify(reference: string): Promise<VerifyResult>;
  refund(args: { providerReference: string; amountKobo: number; reason: string }): Promise<{ id: string }>;
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    console.error('provider error', res.status, (body as { message?: string }).message);
    throw new Error(`provider_http_${res.status}`);
  }
  return body;
}

class Paystack implements PaymentProvider {
  private base = 'https://api.paystack.co';
  private headers() {
    return { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' };
  }

  async initialize(a: Parameters<PaymentProvider['initialize']>[0]): Promise<InitResult> {
    const res = await call<{ data: { authorization_url: string; access_code: string; reference: string } }>(
      `${this.base}/transaction/initialize`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          email: a.email, amount: a.amountKobo, currency: a.currency, reference: a.reference,
          callback_url: a.callbackUrl, metadata: a.metadata,
        }),
      },
    );
    return { authorizationUrl: res.data.authorization_url, providerReference: res.data.reference, accessCode: res.data.access_code };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await call<{ data: { status: string; amount: number; currency: string; reference: string; gateway_response?: string } }>(
      `${this.base}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: this.headers() },
    );
    const d = res.data;
    return {
      success: d.status === 'success',
      failed: d.status === 'failed' || d.status === 'abandoned' || d.status === 'reversed',
      amountKobo: d.amount, currency: d.currency, providerReference: d.reference, reason: d.gateway_response,
    };
  }

  async refund(a: Parameters<PaymentProvider['refund']>[0]) {
    const res = await call<{ data: { id: number | string } }>(`${this.base}/refund`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ transaction: a.providerReference, amount: a.amountKobo, merchant_note: a.reason }),
    });
    return { id: String(res.data.id) };
  }
}

class Flutterwave implements PaymentProvider {
  private base = 'https://api.flutterwave.com/v3';
  private headers() {
    return { Authorization: `Bearer ${env('FLUTTERWAVE_SECRET_KEY')}`, 'Content-Type': 'application/json' };
  }

  async initialize(a: Parameters<PaymentProvider['initialize']>[0]): Promise<InitResult> {
    const res = await call<{ data: { link: string } }>(`${this.base}/payments`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({
        tx_ref: a.reference, amount: a.amountKobo / 100, currency: a.currency, redirect_url: a.callbackUrl,
        customer: { email: a.email }, meta: a.metadata,
        customizations: { title: 'Infinity Luxury Spa & Aesthetics' },
      }),
    });
    return { authorizationUrl: res.data.link, providerReference: null, accessCode: null };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await call<{ data: { id: number; status: string; amount: number; currency: string; tx_ref: string; processor_response?: string } }>(
      `${this.base}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: this.headers() },
    );
    const d = res.data;
    return {
      success: d.status === 'successful',
      failed: d.status === 'failed',
      // Flutterwave reports major units; convert with rounding to avoid float drift.
      amountKobo: Math.round(d.amount * 100), currency: d.currency, providerReference: String(d.id), reason: d.processor_response,
    };
  }

  async refund(a: Parameters<PaymentProvider['refund']>[0]) {
    const res = await call<{ data: { id: number } }>(`${this.base}/transactions/${encodeURIComponent(a.providerReference)}/refund`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ amount: a.amountKobo / 100 }),
    });
    return { id: String(res.data.id) };
  }
}

export function getProvider(name: Provider): PaymentProvider {
  return name === 'paystack' ? new Paystack() : new Flutterwave();
}
