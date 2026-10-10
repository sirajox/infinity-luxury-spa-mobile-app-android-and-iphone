'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { emailSchema } from '@infinity/core';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';
import { publicEnv } from '@/lib/env';
import { createAdminClient, serviceRoleConfigured } from '@/lib/supabase/admin';

const uuid = z.string().uuid();

/**
 * Give someone a staff role. If they already have an account it is granted immediately. Otherwise, when the server is
 * configured with a service key, an invitation email is sent first. The grant itself always runs as the acting admin,
 * so the database's escalation guards and audit trail apply (a super admin is required for owner/super-admin roles).
 */
export const addStaffRole = formAction({
  permission: 'users.manage',
  schema: z.object({ email: emailSchema, role: uuid, branch: z.string().optional(), full_name: z.string().trim().optional() }),
}, async (d, { supabase }) => {
  let { data: found } = await supabase.rpc('find_user_by_email', { p_email: d.email });
  let userId = found?.[0]?.id;
  let invited = false;
  if (!userId) {
    if (!serviceRoleConfigured()) throw new UserError('No account exists for that email. Ask them to create an account in the app first, or configure SUPABASE_SERVICE_ROLE_KEY to send invitations from here.');
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, { data: { full_name: d.full_name ?? '' }, redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/login` });
    if (error || !data.user) throw new UserError('The invitation could not be sent. Check the email address and try again.');
    userId = data.user.id;
    invited = true;
  }
  const { error } = await supabase.from('user_roles').insert({ user_id: userId, role_id: d.role, branch_id: d.branch || null });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/users');
  return invited ? 'Invitation sent and role assigned.' : 'Role assigned.';
});

export const revokeRole = formAction({ permission: 'users.manage', schema: z.object({ id: uuid }) }, async (d, { supabase }) => {
  const { data, error } = await supabase.from('user_roles').delete().eq('id', d.id).select('id');
  if (error) throw new UserError(describeDbError(error));
  if (!data?.length) throw new UserError('That role assignment could not be removed.');
  revalidatePath('/users');
  return 'Role removed.';
});
