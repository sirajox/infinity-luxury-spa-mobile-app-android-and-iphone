# Progress log

_Last updated: 2026-10-09_

## Done and verified
- **packages/core**: money (kobo), coupons, order totals, status machines, permission matrix, timezone + slot maths, zod schemas,
  generated DB types. 14 unit tests passing, typecheck clean.
- **Database (supabase/migrations 0001–0013)**: identity + RBAC, branches/hours/staff/schedules, settings, catalogue, bookings with
  exclusion-constraint double-booking guard and authoritative availability, store/inventory/orders/coupons with server-side pricing and
  stock reservation, memberships/packages/reviews/wishlists, payments/refunds/settlement functions, notifications + outbox, support,
  account deletion/export, dashboard summary, RLS + grants (deny by default), storage buckets/policies, pg_cron jobs, cart RPCs.
- **Tests (supabase/tests, 60 passing)** run all migrations in PGlite: schema/RLS-on, permission matrix sync, availability rules,
  booking contention, price/advance snapshots, payment settlement (idempotent, mismatch, duplicate, late payment), checkout/oversell,
  coupons, inventory permissions, refunds, privilege escalation, audit immutability, storage policies, account deletion, reporting scope,
  webhook signature helpers, cart/wishlist RPCs.
- **Edge Functions** written (payment-init, payment-verify, paystack-webhook, flutterwave-webhook, process-refund, delete-account,
  dispatch-notifications). **Not executed**: Deno is not installed locally, and no Supabase project/provider keys are configured.

## Not yet verified (needs external setup)
- Real Supabase project: apply migrations, deploy functions, configure Auth providers (Google/Apple/phone OTP), SMTP.
- Paystack/Flutterwave test keys and webhook URLs; Resend key; Expo push credentials; Sentry DSN.
- PGlite is single-connection: true parallel-transaction contention is guaranteed by the exclusion constraint/row locks but the tests
  exercise it serially. Re-run the contention test against a real Postgres when a project exists.

## Next
1. Mobile app (apps/mobile): theme + UI kit, auth, tabs, catalogue, booking flow, payments, store, orders, profile, notifications.
2. Admin dashboard (apps/admin).
3. Docs set (architecture, database, payments, security, deployment, testing, admin guide, app-store release).
4. Quality gates: typecheck, bundle, build, screen-by-screen PDF comparison.

## Decisions
- npm workspaces instead of pnpm (symlink permissions on Windows).
- Slot holds = pending bookings with expiry (no separate `booking_holds` table); `membership_payments` is covered by `payments.membership_id`.
- Branch seeds are production-shaped migrations; `seed.sql` is dev-only and marks every demo record "(Demo)".
