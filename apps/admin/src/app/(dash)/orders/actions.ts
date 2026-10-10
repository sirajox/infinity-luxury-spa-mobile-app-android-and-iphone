'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ORDER_STATUSES } from '@infinity/core';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';

export const updateFulfilment = formAction({
  permission: 'orders.update',
  schema: z.object({
    id: z.string().uuid(),
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().max(500).optional(),
    tracking: z.string().trim().max(100).optional(),
    carrier: z.string().trim().max(100).optional(),
    eta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  }),
}, async (d, { supabase }) => {
  const { error } = await supabase.rpc('update_order_fulfilment', {
    p_order: d.id, p_status: d.status, p_note: d.note || null, p_tracking: d.tracking || null, p_carrier: d.carrier || null, p_eta: d.eta || null,
  });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath(`/orders/${d.id}`);
  return 'Order updated. The customer has been notified.';
});
