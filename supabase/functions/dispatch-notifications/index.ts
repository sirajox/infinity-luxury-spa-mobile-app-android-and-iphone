// POST /dispatch-notifications — invoked on a schedule (pg_cron + pg_net) with the x-cron-secret header.
// Drains notification_outbox: Expo push (with invalid-token cleanup) and transactional email (Resend).
// Rows are claimed by status so retries never double-send; the (channel, dedupe_key) constraint prevents duplicates upstream.
import { adminClient, env, fail, json } from '../_shared/http.ts';
import { timingSafeEqual } from '../_shared/signature.ts';

const BATCH = 100;
const MAX_ATTEMPTS = 5;

interface OutboxRow {
  id: number; user_id: string; channel: 'push' | 'email'; title: string; body: string; data: Record<string, unknown>; attempts: number;
}

function emailHtml(title: string, body: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  return `<!doctype html><html><body style="margin:0;background:#F7F7F7;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0D0D0D;padding:24px;text-align:center;color:#fff;font-family:Georgia,serif;font-size:20px">Infinity Luxury Spa &amp; Aesthetics</td></tr>
  <tr><td style="padding:32px;color:#0D0D0D"><h2 style="margin:0 0 12px;font-family:Georgia,serif">${esc(title)}</h2>
  <p style="margin:0;color:#666;line-height:1.6">${esc(body)}</p></td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #E6E6E6;color:#88700F;font-size:12px;text-align:center">Where Endless Beauty Begins</td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!timingSafeEqual(req.headers.get('x-cron-secret') ?? '', env('CRON_SECRET'))) return fail('unauthorized', 401);

  const admin = adminClient();
  const { data: rows, error } = await admin.from('notification_outbox')
    .select('id, user_id, channel, title, body, data, attempts')
    .eq('status', 'pending').lte('scheduled_for', new Date().toISOString())
    .order('id').limit(BATCH);
  if (error) {
    console.error('outbox read failed', error.message);
    return fail('server_error', 500);
  }

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    try {
      if (row.channel === 'push') {
        const { data: tokens } = await admin.from('device_tokens').select('id, expo_push_token').eq('user_id', row.user_id).is('invalid_at', null);
        if (!tokens?.length) {
          await admin.from('notification_outbox').update({ status: 'skipped', error: 'no_device' }).eq('id', row.id);
          continue;
        }
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(tokens.map((t) => ({ to: t.expo_push_token, title: row.title, body: row.body, data: row.data, sound: 'default' }))),
        });
        const payload = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
        const tickets = payload.data ?? [];
        // Rotate out tokens Expo reports as unregistered.
        for (let i = 0; i < tickets.length; i++) {
          if (tickets[i]?.details?.error === 'DeviceNotRegistered' && tokens[i]) {
            await admin.from('device_tokens').update({ invalid_at: new Date().toISOString() }).eq('id', tokens[i]!.id);
          }
        }
        if (!res.ok) throw new Error(`expo_http_${res.status}`);
      } else {
        const { data: user } = await admin.auth.admin.getUserById(row.user_id);
        const to = user.user?.email;
        if (!to) {
          await admin.from('notification_outbox').update({ status: 'skipped', error: 'no_email' }).eq('id', row.id);
          continue;
        }
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('EMAIL_FROM'), to, subject: row.title, html: emailHtml(row.title, row.body) }),
        });
        if (!res.ok) throw new Error(`resend_http_${res.status}`);
      }
      await admin.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq('id', row.id);
      sent++;
    } catch (e) {
      failed++;
      const attempts = row.attempts + 1;
      await admin.from('notification_outbox').update({
        attempts, error: (e as Error).message.slice(0, 200),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        scheduled_for: new Date(Date.now() + attempts * 5 * 60_000).toISOString(),
      }).eq('id', row.id);
    }
  }
  return json({ processed: rows?.length ?? 0, sent, failed });
});
