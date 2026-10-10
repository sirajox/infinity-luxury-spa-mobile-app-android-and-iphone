'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';

export const replyToTicket = formAction({ permission: 'support.manage', schema: z.object({ ticket: z.string().uuid(), body: z.string().trim().min(1, 'Write a reply').max(4000) }) }, async (d, { supabase }) => {
  const { error } = await supabase.from('support_messages').insert({ ticket_id: d.ticket, body: d.body });
  if (error) throw new UserError(describeDbError(error));
  await supabase.from('support_tickets').update({ status: 'pending' }).eq('id', d.ticket);
  revalidatePath(`/support/${d.ticket}`);
  return 'Reply sent.';
});

export const setTicketStatus = formAction({ permission: 'support.manage', schema: z.object({ ticket: z.string().uuid(), status: z.enum(['open', 'pending', 'resolved', 'closed']) }) }, async (d, { supabase }) => {
  const { data, error } = await supabase.from('support_tickets').update({ status: d.status }).eq('id', d.ticket).select('id');
  if (error) throw new UserError(describeDbError(error));
  if (!data?.length) throw new UserError('You do not have permission to change this ticket.');
  revalidatePath('/support');
  revalidatePath(`/support/${d.ticket}`);
  return 'Status updated.';
});
