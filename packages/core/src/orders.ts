import { assertKobo, type Kobo } from './money';
import { calculateCouponDiscount, type CouponRule } from './coupons';

export interface CartLine {
  unitPrice: Kobo;
  quantity: number;
}

export interface OrderTotals {
  subtotal: Kobo;
  discount: Kobo;
  deliveryFee: Kobo;
  total: Kobo;
}

/** Display-only estimate. The server recalculates every order total from authoritative prices. */
export function computeOrderTotals(
  lines: CartLine[],
  deliveryFee: Kobo,
  coupon?: CouponRule | null,
): OrderTotals {
  assertKobo(deliveryFee, 'deliveryFee');
  let subtotal = 0;
  for (const line of lines) {
    assertKobo(line.unitPrice, 'unitPrice');
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError('quantity must be a positive integer');
    }
    subtotal += line.unitPrice * line.quantity;
  }
  const discount = coupon ? calculateCouponDiscount(subtotal, coupon) : 0;
  return { subtotal, discount, deliveryFee, total: subtotal - discount + deliveryFee };
}
