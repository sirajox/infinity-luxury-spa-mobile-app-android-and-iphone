export const BOOKING_STATUSES = [
  'pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show', 'expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
  // A verified payment arriving after the hold lapsed may revive the booking if the slot is still free.
  expired: ['confirmed'],
};

export const ORDER_STATUSES = [
  'placed', 'payment_confirmed', 'processing', 'ready_for_pickup', 'shipped',
  'out_for_delivery', 'delivered', 'cancelled', 'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ['payment_confirmed', 'cancelled'],
  payment_confirmed: ['processing', 'cancelled', 'refunded'],
  processing: ['ready_for_pickup', 'shipped', 'cancelled', 'refunded'],
  ready_for_pickup: ['delivered', 'cancelled', 'refunded'],
  shipped: ['out_for_delivery', 'delivered', 'refunded'],
  out_for_delivery: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function canTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}

export const PAYMENT_STATUSES = [
  'pending', 'processing', 'succeeded', 'failed', 'abandoned', 'refunded', 'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
