'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';
import { parseNaira } from '@/lib/resources/engine';

const uuid = z.string().uuid();

/** Send an approved refund to the payment provider via the process-refund Edge Function (authorised again server-side). */
export const processRefund = formAction({ permission: 'refunds.create', schema: z.object({ id: uuid }) }, async (d, { supabase }) => {
  const { data, error } = await supabase.functions.invoke<{ status?: string }>('process-refund', { body: { refundId: d.id } });
  if (error) throw new UserError('The provider could not process this refund. It is marked failed and can be retried.');
  revalidatePath('/refunds');
  return data?.status === 'completed' ? 'Refund sent to the provider.' : 'Refund submitted.';
});

export const rejectRefund = formAction({ permission: 'refunds.create', schema: z.object({ id: uuid, reason: z.string().trim().min(3, 'Please give a reason') }) }, async (d, { supabase }) => {
  const { error } = await supabase.rpc('reject_refund', { p_refund: d.id, p_reason: d.reason });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/refunds');
  return 'Refund declined.';
});

export const requestRefund = formAction({
  permission: 'refunds.create',
  schema: z.object({ reference: z.string().trim().min(5, 'Enter the payment reference'), amount: z.string().min(1, 'Enter an amount'), reason: z.string().trim().min(3, 'Please give a reason') }),
}, async (d, { supabase }) => {
  const kobo = parseNaira(d.amount);
  if (!kobo) throw new UserError('Enter a valid amount.');
  const { data: pay } = await supabase.from('payments').select('id').eq('reference', d.reference).maybeSingle();
  if (!pay) throw new UserError('No payment with that reference was found.');
  const { error } = await supabase.rpc('create_refund_request', { p_payment: pay.id, p_amount: kobo, p_reason: d.reason });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/refunds');
  return 'Refund requested. Process it from the list below.';
});
