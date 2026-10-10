'use server';

import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';

export const sendBroadcast = formAction({
  permission: 'notifications.send',
  schema: z.object({
    title: z.string().trim().min(3, 'Add a title').max(80),
    body: z.string().trim().min(5, 'Write the message').max(300),
    segment: z.enum(['all', 'branch', 'recent_customers']),
    branch: z.string().uuid().optional().or(z.literal('')),
    kind: z.enum(['offer', 'system']),
  }),
}, async (d, { supabase }) => {
  if (d.segment === 'branch' && !d.branch) throw new UserError('Choose a branch for this audience.');
  const { data, error } = await supabase.rpc('send_broadcast', { p_title: d.title, p_body: d.body, p_segment: d.segment, p_branch: d.branch || null, p_kind: d.kind });
  if (error) throw new UserError(describeDbError(error));
  return `Sent to ${Number(data).toLocaleString()} customer${Number(data) === 1 ? '' : 's'}${d.kind === 'offer' ? ' who have opted in to offers' : ''}.`;
});
