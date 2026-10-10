# Testing

## What runs today

| Suite | Command | Count | Covers |
|---|---|---|---|
| Shared logic | `npm test -w @infinity/core` | 15 | kobo/format/rounding, advance split, order totals, coupon caps, status machines, timezone conversion, slot rules, phone normalisation, schemas, permission matrix |
| Database + functions | `npm run test:db` | 69 | every migration applies; RLS on all tables; permission matrix in sync; availability (hours, breaks, leave, holidays, notice, buffers, expiry); booking contention; payment settlement (idempotency, mismatch, duplicate, late payment); checkout/oversell; coupons; inventory permissions; refunds; privilege escalation; audit immutability; storage policies; reviews eligibility; account deletion; dashboard/report scoping; webhook signature helpers; cart/wishlist RPCs; admin booking/manual payment/refund rejection |
| Mobile logic | `npm test -w @infinity/mobile` | 19 | formatting, error mapping, phone conversion, chunked secure storage, cart/booking/ui stores |
| Admin logic | `npm test -w @infinity/admin` | 13 | money parsing, slugs, CSV safety, resource schemas/coupon conversion, permission-consistency of the sidebar and definitions |

Static checks: `npm run typecheck` (strict TypeScript across all workspaces, typed Expo Router routes), `npm run build:admin` (Next production build), `npm run export:check -w @infinity/mobile` (Metro/Hermes bundle for Android).

The DB suite uses **PGlite** (Postgres in WASM) with stand-ins for Supabase's `auth`, `storage` and API roles, so it needs no Docker. It exercises the real SQL, RLS policies and grants as the `anon`/`authenticated`/`service_role` roles.

## Limits you should know

- PGlite is a single connection, so the "simultaneous bookings" test runs attempts serially; the guarantee itself comes from the exclusion constraint and row locks, and a second test inserts a conflicting row directly. Re-run a true parallel test against real Postgres once a project exists.
- Edge Functions are not executed or type-checked in this repository's CI yet (Deno was not installed). Only their pure signature helpers are tested. Run `deno check supabase/functions/**/*.ts` and `supabase functions serve` before deploying.
- Provider calls (Paystack, Flutterwave, Resend, Expo push) are **not** mocked-as-live; they are untested until test keys exist. Do not treat a green suite as proof payments work end-to-end.
- No device/E2E automation (Maestro/Detox) is configured. The mobile screens have been type-checked and bundled but not driven on a simulator in this environment.
- No visual regression tooling; PDF comparison is manual (see below).

## Manual QA matrix (run on a real device against staging)

1. Fresh install → splash → onboarding → guest browse → sign up → verify email → sign in → tour.
2. Treatment → branch → staff → date → time → review → pay advance (Paystack test card) → confirmed → calendar → reminder push.
3. Two phones race for the same slot: one must get "just taken".
4. Abandon payment mid-way: hold expires; slot returns to availability.
5. Add to cart as guest → sign in (cart merges) → coupon → delivery to FCT and to an unconfigured state → pay → order timeline updates from the admin.
6. Cancel inside and outside the free window; check refund requests; process one in admin.
7. Airplane mode on every tab: offline banner, cached catalogue labelled, no stale prices at checkout.
8. VoiceOver/TalkBack through booking; largest text size; reduce-motion.
9. Delete account; confirm personal data stripped and financial records retained.
10. Maintenance mode on: customer blocked, staff can sign in.

## PDF comparison checklist (29 screens)

Check typography (Lora headings, Poppins UI), spacing, gold usage, pill buttons, bottom-nav active state, patterned image placeholders, state screens (empty cart, offline pill, delete sheet). Known deliberate differences: no "Recent work" gallery on staff profile (no data model yet); photography shows the branded pattern until images are uploaded.
