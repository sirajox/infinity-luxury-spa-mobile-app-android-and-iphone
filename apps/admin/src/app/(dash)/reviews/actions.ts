'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';

export const moderateReview = formAction({ permission: 'reviews.moderate', schema: z.object({ id: z.string().uuid(), status: z.enum(['approved', 'rejected']) }) }, async (d, { supabase }) => {
  const { data, error } = await supabase.from('reviews').update({ status: d.status }).eq('id', d.id).select('id');
  if (error) throw new UserError(describeDbError(error));
  if (!data?.length) throw new UserError('You do not have permission to moderate this review.');
  revalidatePath('/reviews');
  return d.status === 'approved' ? 'Review published.' : 'Review rejected.';
});
