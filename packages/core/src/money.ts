/**
 * Money is represented as integer kobo (1 NGN = 100 kobo) everywhere.
 * Floating-point arithmetic is never used for financial values.
 */
export type Kobo = number;

export const KOBO_PER_NAIRA = 100;

export function assertKobo(value: number, label = 'amount'): asserts value is Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer number of kobo`);
  }
}

export function nairaToKobo(naira: number): Kobo {
  return Math.round(naira * KOBO_PER_NAIRA);
}

export function koboToNaira(kobo: Kobo): number {
  return kobo / KOBO_PER_NAIRA;
}

export function formatNaira(kobo: Kobo): string {
  assertKobo(kobo);
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const whole = Math.trunc(abs / KOBO_PER_NAIRA);
  const fraction = abs % KOBO_PER_NAIRA;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = fraction === 0 ? '' : `.${fraction.toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}₦${grouped}${frac}`;
}

/** Percentage of an amount, rounded half-up to the nearest kobo. `bps` is basis points (1% = 100). */
export function percentOf(amount: Kobo, bps: number): Kobo {
  assertKobo(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError('bps must be an integer between 0 and 10000');
  }
  return Math.floor((amount * bps + 5_000) / 10_000);
}

export type PaymentOption = 'full' | 'advance';

export interface PaymentSplit {
  payNow: Kobo;
  balance: Kobo;
}

/** Split a booking total into pay-now and balance. Advance is configured in bps, with an optional minimum. */
export function splitBookingPayment(
  total: Kobo,
  option: PaymentOption,
  advanceBps: number,
  minAdvance: Kobo = 0,
): PaymentSplit {
  assertKobo(total, 'total');
  if (option === 'full') return { payNow: total, balance: 0 };
  const advance = Math.min(total, Math.max(percentOf(total, advanceBps), minAdvance));
  return { payNow: advance, balance: total - advance };
}
