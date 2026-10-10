# Progress log

_Last updated: 2026-10-09_

## Verified locally (commands in README)

| Area | Result |
|---|---|
| `packages/core` | 15 tests pass; typecheck clean |
| Database (17 migrations) + Edge Function helpers | 69 tests pass (RLS, grants, availability, booking contention, payments, stock, coupons, refunds, escalation, audit, storage, deletion, reporting, admin functions) |
| Mobile (`apps/mobile`) | typecheck clean with typed routes (200+ routes); 19 unit tests; Android **and** iOS Metro/Hermes bundles build |
| Admin (`apps/admin`) | typecheck clean; 13 unit tests; `next build` succeeds (27 routes); live smoke test: security headers, signed-out redirects, `/pay/return` deep link and param sanitising |
| Secrets | scan clean; service-role key only in `apps/admin/src/lib/supabase/admin.ts` and the invite action |

## Built

- **Mobile (all 29 PDF screens plus supporting flows)**: splash, onboarding (CMS-driven), sign in/up, Google/Apple/phone OTP, password reset, first-time tour, home (CMS banners, categories, featured, staff, products, memberships/packages, recently viewed), categories → collections → treatments → details, branch/staff/date/time/review/payment/confirmation, my bookings (reschedule, cancel with policy, balance payment, calendar, reviews), staff profiles, store (search, filters, pagination, variants, stock, wishlist), cart (guest + member, coupons), checkout (delivery/pickup), order confirmation and tracking, notifications, help & support (FAQs, tickets), privacy/data export/account deletion, profile pages (personal info + photo, addresses, wishlist, notification settings, preferred branch), memberships, packages, offline/empty/error states, maintenance screen.
- **Admin (26 requested modules)**: dashboard with charts, bookings (+new, status workflow, manual payment, reschedule, cancel), calendar, customers, staff (+schedules/breaks/leave), branches (+hours/holidays), treatments, categories/subcategories, products (+variants/gallery), inventory (adjust/transfer/history), orders (fulfilment), payments (+CSV), refunds (process/decline/request), packages, memberships, coupons, reviews moderation, banners, notifications (broadcast), content/policies, FAQs, tour, email templates, reports (+CSV exports), users, roles & permissions, settings (booking rules, providers, maintenance, support, business), audit logs, support tickets.
- **Backend**: migrations 0001–0017, Edge Functions (payment-init, payment-verify, paystack/flutterwave webhooks, process-refund, delete-account, dispatch-notifications), pg_cron jobs, storage buckets/policies.

## NOT verified / external setup required

1. A real Supabase project: nothing has been applied to or run against a live database or Auth.
2. Edge Functions have never been executed or type-checked (Deno not installed here). Only the signature helpers are unit-tested.
3. Paystack/Flutterwave live behaviour (init, verify, webhooks, refunds), Resend email, Expo push, Google/Apple/phone sign-in: need keys/accounts.
4. No on-device run: screens are type-checked and bundled, not seen on a simulator. The PDF comparison and the accessibility audit (VoiceOver/TalkBack) are still to do.
5. True parallel contention tests need real Postgres (PGlite is single-connection).
6. Business inputs: hours, prices, advance %, membership prices, policies, original logo (the logo in `assets/` is a low-res crop of the PDF), coordinates, support email. See `launch-checklist.md`.

## Known limitations / follow-ups

- Staff profile has no "Recent work" gallery (no data model).
- Phone OTP needs an SMS provider in Supabase.
- Admin has no MFA yet; enable Supabase MFA for staff.
- Packages purchase creates an active package record but redeeming package sessions against bookings is not implemented.
- Membership benefits are descriptive text; no automatic discounts are applied.
- Review photos: bucket and policies exist; upload UI is not built.
- Customer "Download my data" returns JSON via the share sheet (not a file).
- Admin lists use offset pagination; move to keyset if tables grow very large.
- `supabase/config.toml` and the generated `database.types.ts` should be replaced by CLI output once a project is linked.

## Next steps

1. Create staging Supabase; `db push`; deploy functions with Paystack/Flutterwave **test** keys; run the end-to-end payment matrix.
2. Build a development client (`eas build --profile development`) and walk every screen against the PDF; fix visual drift.
3. Add Maestro E2E flows and CI (GitHub Actions: typecheck, tests, admin build, `deno check`).
4. Real-Postgres concurrency tests; load test availability.
5. Supply real branding assets and business data; run the launch checklist.

## Decisions

- npm workspaces (pnpm needs symlink privileges); slot holds as pending bookings; generated types mirror `supabase gen types`; branch seeds are production-shaped with bookings disabled; `seed.sql` is dev-only and every record says "(Demo)".
