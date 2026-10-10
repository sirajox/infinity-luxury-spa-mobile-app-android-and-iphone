# Production launch checklist

## A. Business approvals (owner)

- [ ] Opening hours for each branch confirmed and entered; `hours_verified` ticked.
- [ ] Treatment list, durations and **prices** entered and approved (no prices are pre-filled).
- [ ] Advance-payment percentage and cancellation/reschedule windows approved (defaults: 33.33%, 24h, 12h are **unverified**).
- [ ] Membership plan prices/benefits approved and published (reference ₦1m/₦3m/₦7m are **unverified**).
- [ ] Delivery states and fees entered.
- [ ] Legal documents written/approved and published: Privacy, Terms, Booking, Cancellation, Refund, Delivery, Membership.
- [ ] Support email, WhatsApp branch and FAQ content entered.
- [ ] Original brand logo supplied.
- [ ] Branch contact data verified (seeded from the brief: Abuja 0806 914 6781, Kano 0803 335 7610, Kaduna 0803 319 7942, Sokoto 0704 333 3112); coordinates added for map pins.

## B. Accounts and integrations

- [ ] Supabase staging + production; PITR on; migrations applied; first Super Admin created.
- [ ] Auth providers (Email, Google, Apple, Phone/SMS) + SMTP configured.
- [ ] Paystack (and optionally Flutterwave) business accounts verified; **test keys** in staging, live keys only in production secrets; webhooks registered.
- [ ] Resend domain verified; `dispatch-notifications` scheduled.
- [ ] Sentry projects; EAS project; Apple/Google accounts; FCM/APNs credentials.
- [ ] Admin deployed on its domain; `/pay/return` reachable publicly.

## C. Technical gates

- [ ] `npm run test:db`, `npm test` (all workspaces), `npm run typecheck`, `npm run build:admin` green in CI.
- [ ] `deno check` + local `supabase functions serve` for every Edge Function.
- [ ] End-to-end payment test matrix in test mode: success, decline, abandon, bank transfer/USSD, webhook replay, mismatched amount, late payment after hold expiry, refund (full/partial).
- [ ] Concurrency test against real Postgres: 20 parallel bookings for one slot → exactly one succeeds; 20 parallel orders for the last unit → exactly one succeeds.
- [ ] Penetration test / RLS review on staging; MFA enabled for staff accounts.
- [ ] Backup restore drill.
- [ ] Load test of availability and catalogue queries; check query plans on production-size data.
- [ ] Device QA matrix in [testing.md](testing.md) on iOS and Android.
- [ ] Accessibility pass (screen reader, large text, contrast).

## D. Go-live

- [ ] Remove seed/demo data from production (there should be none: never run `seed.sql`).
- [ ] Enable bookings per branch one at a time; place a real low-value test booking and refund it.
- [ ] Switch payment keys to live; one real transaction end-to-end.
- [ ] Submit to stores; staged rollout; monitor Sentry, `payments` failures, `refunds` queue and `notification_outbox`.
