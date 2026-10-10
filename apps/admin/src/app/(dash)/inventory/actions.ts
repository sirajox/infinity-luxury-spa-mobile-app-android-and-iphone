'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';

const uuid = z.string().uuid();

/** Positive or negative stock change with a mandatory reason. The database records actor, time and reason permanently. */
export const adjustStock = formAction({
  permission: 'inventory.adjust',
  schema: z.object({ branch: uuid, variant: uuid, delta: z.coerce.number().int().refine((n) => n !== 0, 'Enter a non-zero change').refine((n) => Math.abs(n) <= 100000, 'That is too large'), reason: z.string().trim().min(3, 'Please give a reason') }),
}, async (d, { supabase }) => {
  const { error } = await supabase.rpc('adjust_inventory', { p_branch: d.branch, p_variant: d.variant, p_delta: d.delta, p_reason: d.reason });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/inventory');
  return `Stock ${d.delta > 0 ? 'increased' : 'reduced'} by ${Math.abs(d.delta)}.`;
});

export const transferStock = formAction({
  permission: 'inventory.adjust',
  schema: z.object({ from: uuid, to: uuid, variant: uuid, qty: z.coerce.number().int().min(1).max(100000), reason: z.string().trim().min(3, 'Please give a reason') }),
}, async (d, { supabase }) => {
  if (d.from === d.to) throw new UserError('Choose two different branches.');
  const { error } = await supabase.rpc('transfer_inventory', { p_from: d.from, p_to: d.to, p_variant: d.variant, p_qty: d.qty, p_reason: d.reason });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/inventory');
  return 'Stock transferred.';
});
