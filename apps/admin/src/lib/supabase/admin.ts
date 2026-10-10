import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@infinity/core';
import { publicEnv } from '../env';

/**
 * Service-role client: bypasses RLS. Import ONLY from server actions that genuinely need it (creating auth users),
 * and always authorise the acting staff member first. The key is read from a non-public env var and never reaches the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const serviceRoleConfigured = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;
