import { assertKobo, percentOf, type Kobo } from './money';

export interface CouponRule {
  kind: 'percentage' | 'fixed';
  /** basis points for percentage, kobo for fixed */
  value: number;
  minPurchase: Kobo;
  maxDiscount: Kobo | null;
}

/** Mirrors the SQL `calculate_coupon_discount` function; the database remains authoritative. */
export function calculateCouponDiscount(subtotal: Kobo, rule: CouponRule): Kobo {
  assertKobo(subtotal, 'subtotal');
  if (subtotal < rule.minPurchase) return 0;
  let discount = rule.kind === 'percentage' ? percentOf(subtotal, rule.value) : rule.value;
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return Math.min(discount, subtotal);
}
