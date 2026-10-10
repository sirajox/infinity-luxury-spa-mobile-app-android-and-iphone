import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@infinity/core';
import { publicEnv } from '../env';

/** Supabase client acting as the signed-in staff member, so Row Level Security applies to every query. */
export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session cookies instead.
        }
      },
    },
  });
}
