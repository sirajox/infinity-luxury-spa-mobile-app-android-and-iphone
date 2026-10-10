'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError } from '@/lib/actions';

const asArray = (v: unknown): string[] => (v === undefined || v === '' ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

/** Replace a role's permission set. The database refuses unless the actor holds roles.manage; super_admin is not editable. */
export const saveRolePermissions = formAction({
  permission: 'roles.manage',
  schema: z.object({ role_id: z.string().uuid(), permissions: z.preprocess(asArray, z.array(z.string())) }),
}, async (d, { supabase }) => {
  const { data: role } = await supabase.from('roles').select('key').eq('id', d.role_id).single();
  if (role?.key === 'super_admin') throw new UserError('The Super Admin role always has every permission.');
  const { data: have } = await supabase.from('role_permissions').select('permission_key').eq('role_id', d.role_id);
  const current = new Set((have ?? []).map((r) => r.permission_key));
  const wanted = new Set(d.permissions);
  const add = [...wanted].filter((p) => !current.has(p));
  const remove = [...current].filter((p) => !wanted.has(p));
  if (add.length) {
    const { error } = await supabase.from('role_permissions').insert(add.map((permission_key) => ({ role_id: d.role_id, permission_key })));
    if (error) throw new UserError(describeDbError(error));
  }
  if (remove.length) {
    const { error } = await supabase.from('role_permissions').delete().eq('role_id', d.role_id).in('permission_key', remove);
    if (error) throw new UserError(describeDbError(error));
  }
  revalidatePath('/roles');
  return `Permissions updated (${add.length} added, ${remove.length} removed).`;
});
