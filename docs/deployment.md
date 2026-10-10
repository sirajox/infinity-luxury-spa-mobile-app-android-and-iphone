# Deployment

Nothing here has been run against a real project yet (no accounts were available). Follow in order and tick items in [launch-checklist.md](launch-checklist.md).

## 1. Supabase project

1. Create a project (choose a region close to Nigeria users; Europe/West is typical). Create separate **staging** and **production** projects.
2. Install the CLI and link: `npx supabase login`, `npx supabase link --project-ref <ref>`.
3. Apply the schema: `npx supabase db push` (applies `supabase/migrations/0001…0017`). **Do not run `supabase/seed.sql` in production**; it creates "(Demo)" data and enables bookings.
4. Auth → Providers: enable Email (confirmations on), Google, Apple (iOS requires it when other social logins exist) and Phone (needs an SMS provider). Auth → URL configuration: site URL `infinityspa://`, redirect URLs `infinityspa://auth-callback`, `infinityspa://reset-password`.
5. Auth → SMTP: configure a real sender (Resend/SendGrid) so verification and reset emails are branded and deliverable.
6. Create the first Super Admin: sign up as the owner, then run `select public.bootstrap_super_admin('owner@…');` in the SQL editor.
7. Regenerate types from the real project when linked: `npx supabase gen types typescript --linked > packages/core/src/database.types.ts` (same shape as the generated file).

## 2. Edge Functions

```bash
npx supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_test_... FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-... FLUTTERWAVE_WEBHOOK_HASH=<random> \
  PAYMENT_CALLBACK_URL=https://admin.<domain>/pay/return \
  RESEND_API_KEY=re_... EMAIL_FROM="Infinity Luxury Spa <no-reply@<domain>>" CRON_SECRET=<random-32+>
npx supabase functions deploy payment-init payment-verify process-refund delete-account paystack-webhook flutterwave-webhook dispatch-notifications
```

`supabase/config.toml` sets `verify_jwt = false` only for the two webhooks and `dispatch-notifications` (they authenticate by signature / secret header). Register webhook URLs in the Paystack and Flutterwave dashboards (see [payments.md](payments.md)). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase.

## 3. Scheduled jobs

Migration 0012 schedules (when `pg_cron` is available): release expired booking holds (every minute), release abandoned checkout stock (5 min), abandon stale payments (15 min), booking reminders (15 min), membership expiry (daily). All are idempotent.

The notification dispatcher is an Edge Function; schedule it with `pg_net`:

```sql
select cron.schedule('dispatch-notifications', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/dispatch-notifications',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'content-type', 'application/json'),
    body := '{}'::jsonb);
$$);
```

(Store the secret in Vault rather than in the statement if your plan supports it.)

## 4. Admin dashboard (Vercel)

1. Import the repo, set the **root directory** to `apps/admin` and enable "include source files outside root" (it uses `packages/core`).
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `MOBILE_APP_SCHEME=infinityspa`; optional `SUPABASE_SERVICE_ROLE_KEY` (server-only) to enable staff invitations.
3. Deploy, attach the domain, then set `PAYMENT_CALLBACK_URL` (above) to `https://<domain>/pay/return`.

## 5. Mobile app (EAS)

```bash
cd apps/mobile
npx eas login && npx eas init          # links the project, adds extra.eas.projectId (needed for push)
npx eas secret:create ...              # EXPO_PUBLIC_* values and SENTRY_* for each environment
npx eas build --profile development --platform all
npx eas build --profile preview --platform all
npx eas build --profile production --platform all
```

Profiles are in `apps/mobile/eas.json` (`development`, `preview`, `production`; channels match). Identifiers `com.infinityluxuryspa.app` are **placeholders**: register the real bundle ID / package name, then update `app.config.ts`. Copy `.env.example` to `.env` for local runs. OTA updates use `expo-updates` with `runtimeVersion.policy = appVersion`.

Push notifications: after `eas init`, run `npx eas credentials` to upload the FCM v1 key (Android) and let EAS manage the APNs key (iOS).

## 6. Environments

| Variable | Where | Public? |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | yes |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_*` | mobile | yes (identifiers) |
| `SENTRY_AUTH_TOKEN` | EAS build secret | **no** |
| `NEXT_PUBLIC_*` | admin | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | admin server / Edge | **no** |
| `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_*`, `RESEND_API_KEY`, `CRON_SECRET` | Edge secrets | **no** |

## 7. Rollback

Migrations are forward-only. Fix mistakes with a new migration. Payment and order data are never deleted by migrations. Keep Supabase Point-in-Time Recovery enabled in production.
