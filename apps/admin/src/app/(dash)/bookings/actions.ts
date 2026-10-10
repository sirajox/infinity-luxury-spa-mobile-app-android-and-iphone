'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';
import { parseNaira } from '@/lib/resources/engine';

const uuid = z.string().uuid();
const STATUS = z.enum(['confirmed', 'checked_in', 'in_progress', 'completed', 'no_show']);

/** Staff status changes. The database validates the transition (e.g. pending → confirmed → checked_in …). */
export const setBookingStatus = formAction({ permission: 'bookings.update', schema: z.object({ id: uuid, status: STATUS }) }, async (d, { supabase }) => {
  const { error } = await supabase.from('bookings').update({ status: d.status }).eq('id', d.id);
  if (error) throw new UserError(describeDbError(error));
  revalidatePath(`/bookings/${d.id}`);
  return 'Status updated.';
});

/** Cancellation goes through cancel_booking() so the refund policy and refund request are applied. */
export const cancelBookingAction = formAction({ permission: 'bookings.cancel', schema: z.object({ id: uuid, reason: z.string().trim().min(3, 'Please give a reason') }) }, async (d, { supabase }) => {
  const { error } = await supabase.rpc('cancel_booking', { p_booking: d.id, p_reason: d.reason });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath(`/bookings/${d.id}`);
  return 'Booking cancelled. Any refund due has been queued under Refunds.';
});

export const saveBookingNotes = formAction({ permission: 'bookings.update', schema: z.object({ id: uuid, notes: z.string().trim().max(2000).optional() }) }, async (d, { supabase }) => {
  const { error } = await supabase.from('bookings').update({ notes: d.notes ?? null }).eq('id', d.id);
  if (error) throw new UserError(describeDbError(error));
  revalidatePath(`/bookings/${d.id}`);
  return 'Notes saved.';
});

export const rescheduleAction = formAction({ permission: 'bookings.update', schema: z.object({ id: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'), time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time') }) }, async (d, { supabase }) => {
  const { error } = await supabase.rpc('reschedule_booking', { p_booking: d.id, p_date: d.date, p_time: d.time });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath(`/bookings/${d.id}`);
  return 'Rescheduled.';
});

export const recordPaymentAction = formAction({ permission: 'payments.view', schema: z.object({ id: uuid, amount: z.string().min(1, 'Enter an amount'), note: z.string().trim().min(2, 'Add a note, e.g. "Cash at desk"') }) }, async (d, { supabase }) => {
  const kobo = parseNaira(d.amount);
  if (!kobo || kobo <= 0) throw new UserError('Enter a valid amount.');
  const { error } = await supabase.rpc('record_manual_payment', { p_booking: d.id, p_amount_kobo: kobo, p_note: d.note });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath(`/bookings/${d.id}`);
  return 'Payment recorded.';
});

export const createBookingAction = formAction({
  permission: 'bookings.create',
  schema: z.object({ customer: uuid, service: uuid, branch: uuid, staff: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time') }),
}, async (d, { supabase }) => {
  const { data, error } = await supabase.rpc('admin_create_booking', {
    p_customer: d.customer, p_service: d.service, p_branch: d.branch, p_staff: d.staff || null, p_date: d.date, p_time: d.time,
  });
  if (error) throw new UserError(describeDbError(error));
  redirect(`/bookings/${(data as { id: string }).id}?ok=${encodeURIComponent('Booking created and confirmed.')}`);
});
