import { createClient } from '@supabase/supabase-js';
import type { Database } from '@infinity/core';
import { env } from './env';
import { secureAuthStorage } from './secureStorage';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
