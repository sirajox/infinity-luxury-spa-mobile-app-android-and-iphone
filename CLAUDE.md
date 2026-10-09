# Infinity Luxury Spa & Aesthetics — engineering guide

Customer mobile app (Expo/React Native), admin dashboard (Next.js) and Supabase backend. Brand: *Where Endless Beauty Begins*.
Design source of truth: `docs/design/Infinity-Luxury-Spa-App-UI/Infinity-Luxury-Spa-App-UI.pdf` (11 pages, 29 screens). Names, prices,
ratings and photos in the PDF are **illustrative sample content** — never ship them as business data.

Engineering priorities: Security → Correctness → Reliability → Performance → Maintainability → Visual polish.

## Layout

```
apps/mobile      Expo SDK 57, Expo Router, TypeScript strict
apps/admin       Next.js App Router + Tailwind (staff dashboard)
packages/core    Shared, platform-independent: money (integer kobo), schemas (zod), status machines,
                 permissions matrix, slot maths, generated DB types (database.types.ts)
supabase/migrations  Source of truth for the database (0001…0013)
supabase/functions   Edge Functions (Deno): payment-init, payment-verify, paystack/flutterwave webhooks,
                     process-refund, delete-account, dispatch-notifications; _shared helpers
supabase/tests       DB + function tests that run every migration in an in-process Postgres (PGlite)
docs/                architecture, database, payments, security, deployment, testing, admin guide, release
```

## Commands (npm workspaces; run from the repo root)

| Task | Command |
|---|---|
| Install | `npm install` |
| Core tests / types | `npm test -w @infinity/core` · `npm run typecheck -w @infinity/core` |
| DB + RLS + function tests | `npm run test:db` |
| Regenerate DB types after a migration | `npm run gen:types -w @infinity/db-tests` |
| Mobile typecheck / dev server | `npm run typecheck -w @infinity/mobile` · `npm run start -w @infinity/mobile` |
| Mobile bundle check | `npm run export:check -w @infinity/mobile` |
| Admin build | `npm run build:admin` |

pnpm was rejected: it needs symlink privileges that are unavailable on this Windows setup. npm workspaces use junctions.

## Non-negotiable rules

- **Money is integer kobo** (`*_kobo` columns, `Kobo` type). No floats. Formatting via `formatNaira`.
- **The database is authoritative** for prices, availability, stock, coupons, delivery fees and payment state. Clients display results
  of `get_available_slots`, `quote_cart`, `create_booking`, `create_order`, `create_payment_intent`; they never compute and submit totals.
- Payments are only settled by `apply_payment_success` (service role) after the provider's own verify API confirms them.
  Webhooks verify signatures, store `(provider, event_id)` uniquely and are idempotent.
- Slot holds are `pending` bookings with `hold_expires_at`; the GiST exclusion constraint `bookings_no_overlap` prevents double booking.
- RLS is on for every public table; privileges are revoked then granted narrowly (migration 0010). Mutations of money/stock/roles/status go
  through SECURITY DEFINER functions that check `has_permission(perm, branch)`. Never expose the service-role key to apps.
- Roles are never stored on `profiles`. First Super Admin: `select public.bootstrap_super_admin('<email>')` from the SQL editor.
- New tables must `enable row level security`, get explicit grants/policies, and an audit trigger when they hold sensitive config.
- After any migration: run `npm run test:db`, then `npm run gen:types`.
- Business facts not confirmed by the owner (opening hours, membership prices, advance %, policies) are seeded as **unverified**
  (`hours_verified=false`, `bookings_enabled=false`, membership plans unpublished, legal pages unpublished).

## Conventions

- Strict TypeScript; no `any`; no disabling lint/type checks. Feature folders (`src/features/<domain>/{api,hooks,components}`),
  API access only in `api.ts`, server state in TanStack Query, UI-only state in Zustand.
- Design tokens in `apps/mobile/src/theme`. Lora = headlines, Poppins = UI. Gold `#A68917`, text-gold `#88700F`, black `#0D0D0D`.
- Touch targets ≥ 44pt, accessible labels, no emoji icons (thin-line `lucide-react-native` only).

## Status & next steps

See `docs/progress.md` (kept current at each checkpoint).
