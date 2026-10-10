import type { z } from 'zod';

/** What every form action returns to the form component. */
export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | null;

/** An expected failure whose message is safe to show to staff. */
export class UserError extends Error {}

const DB_MESSAGES: Record<string, string> = {
  forbidden: 'You do not have permission to do that.',
  slot_unavailable: 'That time is no longer available.',
  insufficient_stock: 'There is not enough stock to do that.',
  reason_required: 'Please enter a reason.',
  invalid_amount: 'The amount is not valid for this booking.',
  invalid_refund_amount: 'The refund amount exceeds what can be refunded.',
  payment_not_refundable: 'This payment cannot be refunded.',
  customer_not_found: 'That customer could not be found.',
  invalid_transition: 'That status change is not allowed.',
  quote_required: 'This treatment needs a quote and cannot be booked online.',
};

/** Maps Postgres/PostgREST errors to messages for staff without leaking internals. */
export function describeDbError(error: { message: string; code?: string } | null | undefined): string {
  if (!error) return 'Something went wrong.';
  for (const key of Object.keys(DB_MESSAGES)) if (error.message.includes(key)) return DB_MESSAGES[key] as string;
  if (/invalid_(booking|order)_transition/.test(error.message)) return DB_MESSAGES.invalid_transition as string;
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) return DB_MESSAGES.forbidden as string;
  if (error.code === '23505') return 'That value already exists. Choose a different one.';
  if (error.code === '23503') return 'This record is still in use elsewhere, so the change was refused.';
  if (error.code === '23514') return 'One of the values is outside the allowed range.';
  console.error('database error', error.code, error.message);
  return 'Something went wrong. Please try again.';
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** FormData → plain object. Repeated keys become arrays; unchecked checkboxes are simply absent. */
export function formToObject(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== 'string') continue;
    const prev = out[key];
    out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return out;
}
