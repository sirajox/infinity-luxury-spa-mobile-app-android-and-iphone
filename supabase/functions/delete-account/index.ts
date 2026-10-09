// POST /delete-account { password? , confirm? }
// Re-authenticates, runs the database clean-up (cancels upcoming bookings, queues refunds, strips personal
// data from retained financial records), then removes the auth user.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, corsHeaders, env, fail, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => ({}))) as { password?: string; confirm?: string };
  const admin = adminClient();
  const { data: userData } = await admin.auth.admin.getUserById(auth.userId);
  const identities = userData.user?.identities ?? [];
  const hasPassword = identities.some((i) => i.provider === 'email');

  if (hasPassword) {
    // Re-authentication with the account password, using a throwaway client so the caller's session is untouched.
    if (!body.password || !auth.email) return fail('reauthentication_required', 401);
    const probe = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.signInWithPassword({ email: auth.email, password: body.password });
    if (error) return fail('invalid_credentials', 401, 'The password is incorrect.');
  } else if (body.confirm !== 'DELETE') {
    // Social-login accounts have no password; require an explicit typed confirmation instead.
    return fail('reauthentication_required', 401);
  }

  const { error: prepError } = await admin.rpc('prepare_account_deletion', { p_user: auth.userId });
  if (prepError) {
    console.error('prepare_account_deletion failed', prepError.message);
    return fail('server_error', 500);
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(auth.userId);
  if (deleteError) {
    console.error('deleteUser failed', deleteError.message);
    return fail('server_error', 500);
  }
  return json({ deleted: true });
});
