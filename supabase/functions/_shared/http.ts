import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Consistent, non-sensitive error body. Internal details go to the function logs only. */
export function fail(code: string, status: number, message?: string): Response {
  return json({ error: { code, message: message ?? code } }, status);
}

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client that acts as the caller (their JWT), so RLS and auth.uid() apply. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request): Promise<{ client: SupabaseClient; userId: string; email: string | null } | Response> {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return fail('unauthenticated', 401);
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return fail('unauthenticated', 401);
  return { client, userId: data.user.id, email: data.user.email ?? null };
}

export async function readJson<T>(req: Request, validate: (raw: unknown) => T): Promise<T | Response> {
  try {
    return validate(await req.json());
  } catch {
    return fail('invalid_request', 400);
  }
}

/** Map stable database error messages to HTTP responses without leaking internals. */
export function dbError(error: { message: string; code?: string }): Response {
  const known = [
    'authentication_required', 'not_found', 'hold_expired', 'nothing_due', 'order_not_payable',
    'plan_unavailable', 'provider_disabled', 'forbidden',
  ];
  const match = known.find((k) => error.message.includes(k));
  if (match) return fail(match, match === 'forbidden' ? 403 : match === 'authentication_required' ? 401 : 409);
  console.error('database error', error.code, error.message);
  return fail('server_error', 500);
}
