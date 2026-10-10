import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/**
 * The signed-in staff member's effective permissions, for deciding what to show.
 * Authorisation is NOT decided here: RLS and the privileged database functions re-check every operation.
 */
export interface Access {
  isEmpty: boolean;
  /** True if the permission is held at all (globally or for some branch). */
  hasAny(permission: string): boolean;
  /** True if held globally or for this specific branch. */
  has(permission: string, branchId?: string | null): boolean;
  /** True only for a global (all-branch) grant. */
  hasGlobal(permission: string): boolean;
  /** Branch ids the permission is scoped to, or 'all'. */
  branches(permission: string): string[] | 'all';
}

export const getAccess = cache(async (): Promise<Access> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_permissions');
  const grants = new Map<string, Set<string | null>>();
  for (const row of data ?? []) {
    const set = grants.get(row.permission_key) ?? new Set<string | null>();
    set.add(row.branch_id);
    grants.set(row.permission_key, set);
  }
  return {
    isEmpty: grants.size === 0,
    hasAny: (p) => grants.has(p),
    has: (p, b) => {
      const g = grants.get(p);
      return !!g && (g.has(null) || (!!b && g.has(b)));
    },
    hasGlobal: (p) => !!grants.get(p)?.has(null),
    branches: (p) => {
      const g = grants.get(p);
      if (!g) return [];
      return g.has(null) ? 'all' : [...g].filter((x): x is string => x !== null);
    },
  };
});

/** Page/action guard: signed in, holds some staff role, and (optionally) holds a permission. */
export async function requireAccess(permission?: string) {
  const user = await getUser();
  if (!user) redirect('/login');
  const access = await getAccess();
  if (access.isEmpty) redirect('/no-access');
  if (permission && !access.hasAny(permission)) redirect('/forbidden');
  return { user, access };
}
