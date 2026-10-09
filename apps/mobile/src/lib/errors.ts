/** Stable machine codes raised by the database/Edge Functions mapped to customer-friendly copy. */
const MESSAGES: Record<string, string> = {
  slot_unavailable: 'That time was just taken. Please choose another slot.',
  hold_expired: 'Your reserved time has expired. Please book again.',
  quote_required: 'This treatment needs a consultation. Please contact the branch to get a quote.',
  service_unavailable: 'This treatment is not available right now.',
  branch_unavailable: 'Bookings are not open at this branch yet.',
  booking_not_cancellable: 'This booking can no longer be cancelled.',
  booking_not_reschedulable: 'This booking can no longer be rescheduled.',
  reschedule_window_closed: 'It is too close to your appointment to reschedule online. Please contact the branch.',
  out_of_stock: 'Some items are no longer available in the quantity you selected.',
  delivery_unavailable: 'We do not deliver to that state yet. Choose branch pickup instead.',
  address_incomplete: 'Please complete your delivery address.',
  coupon_invalid: 'That coupon code is not valid.',
  coupon_limit_reached: 'You have already used this coupon.',
  coupon_minimum_not_met: 'Your basket does not meet the minimum for this coupon.',
  coupon_first_order_only: 'This coupon is only for first orders.',
  cart_empty: 'Your cart is empty.',
  order_not_payable: 'This order can no longer be paid. Please place it again.',
  nothing_due: 'There is nothing left to pay.',
  provider_disabled: 'That payment method is not available right now.',
  provider_unavailable: 'The payment provider could not be reached. Please try again.',
  review_not_eligible: 'You can review a treatment or product after you have completed it.',
  plan_unavailable: 'This plan is not available right now.',
  authentication_required: 'Please sign in to continue.',
  forbidden: 'You do not have permission to do that.',
  invalid_credentials: 'The password is incorrect.',
};

export class AppError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code);
    this.name = 'AppError';
  }
}

export function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /network request failed|failed to fetch|timeout|timed out|offline/i.test(msg);
}

/** Convert any thrown value into copy that is safe to show a customer. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (isNetworkError(error)) return 'We could not reach the server. Check your connection and try again.';
  const raw = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return MESSAGES[code] as string;
  }
  if (/invalid login credentials/i.test(raw)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(raw)) return 'Please verify your email address, then sign in.';
  if (/already registered|already been registered/i.test(raw)) return 'An account with this email already exists. Try signing in.';
  if (/jwt|refresh token|session/i.test(raw)) return 'Your session has expired. Please sign in again.';
  return 'Something went wrong. Please try again.';
}
