import type { Tone } from '@/components/ui';

export const PAGE_SIZE = 25;

export const pageNumber = (v: string | undefined) => Math.max(1, Number(v) || 1);
export const rangeFor = (page: number) => ({ from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 });

export function bookingTone(status: string): Tone {
  return ({ confirmed: 'success', checked_in: 'success', in_progress: 'success', completed: 'neutral', pending: 'gold', cancelled: 'danger', no_show: 'danger', expired: 'neutral' } as Record<string, Tone>)[status] ?? 'neutral';
}
export function orderTone(status: string): Tone {
  return ({ delivered: 'success', payment_confirmed: 'gold', processing: 'gold', shipped: 'gold', out_for_delivery: 'gold', ready_for_pickup: 'gold', placed: 'neutral', cancelled: 'danger', refunded: 'danger' } as Record<string, Tone>)[status] ?? 'neutral';
}
export function paymentTone(status: string): Tone {
  return ({ succeeded: 'success', failed: 'danger', abandoned: 'neutral', pending: 'gold', processing: 'gold', refunded: 'danger', partially_refunded: 'gold' } as Record<string, Tone>)[status] ?? 'neutral';
}
export const label = (s: string) => s.replace(/_/g, ' ');

/** Escape one CSV cell and neutralise spreadsheet formula injection (cells starting with = + - @). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
