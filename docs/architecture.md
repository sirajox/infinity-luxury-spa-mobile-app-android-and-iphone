# Architecture

```
 Customer app (Expo)            Admin dashboard (Next.js)
   │  supabase-js (anon key,        │  @supabase/ssr (cookies, anon key,
   │  user JWT, RLS applies)        │  staff JWT, RLS applies)
   └───────────────┬────────────────┘
                   ▼
        Supabase  ─ Postgres (tables, RLS, SECURITY DEFINER functions)
                  ─ Auth  ─ Storage  ─ Edge Functions  ─ pg_cron
                   ▲                         │
   Paystack / Flutterwave  ◄── webhooks ─────┘   Expo Push · Resend
```

## Principles

1. **The database is the authority.** Prices, availability, stock, coupons, delivery fees, order totals and payment state are computed and enforced in Postgres (functions + constraints + RLS). Clients display results; they never submit totals.
2. **Money is integer kobo** (`*_kobo`, `bigint`), formatted with `formatNaira`. No floating-point arithmetic touches money.
3. **No secrets on clients.** Apps hold only the Supabase URL and anon key. Provider secrets, webhook secrets, the service-role key and email credentials live in Edge Function secrets / server environment.
4. **Least privilege.** Every table has RLS; privileges are revoked then granted narrowly (migration 0010). Mutations of money, stock, status and roles happen only through functions that check `has_permission(perm, branch)`.
5. **Everything sensitive is audited**, append-only.

## Key flows

**Booking.** `get_available_slots` (branch hours, holidays, staff hours/breaks/leave, existing bookings incl. buffers, notice window, hold expiry) → `create_booking` inserts a `pending` booking with `hold_expires_at`. A GiST exclusion constraint (`bookings_no_overlap`) makes double-booking impossible even under concurrent attempts. → payment → `apply_payment_success` confirms. Expired holds are released by `expire_stale_bookings` (cron) and opportunistically on the next booking.

**Payment.** App → `payment-init` (Edge Function, user JWT) → `create_payment_intent` derives the amount from the booking/order → provider hosted checkout (WebBrowser) → provider redirects to `/pay/return` (admin site) → deep link back → app calls `payment-verify`. In parallel the provider's webhook hits `paystack-webhook`/`flutterwave-webhook` (signature-verified, idempotent). Both paths verify with the provider's API and then call the single atomic `apply_payment_success`. See [payments.md](payments.md).

**Store.** Cart (server for members, local for guests; merged by `cart_merge` at sign-in) → `quote_cart` (server totals, coupon, delivery) → `create_order` reserves stock with row locks and snapshots items/prices → payment → `apply_payment_success` consumes reservations. Abandoned checkouts release stock (`expire_stale_orders`).

**Admin.** Server Components query with the staff member's session, so RLS is the permission system. UI hides what a role cannot use (`my_permissions()`), but hiding is cosmetic; the database enforces. A config-driven CRUD engine (`apps/admin/src/lib/resources`) handles catalogue/content tables; sensitive operations (refunds, stock, bookings, orders, roles) have dedicated, audited actions.

## Repository map

```
apps/mobile/app           Expo Router routes (file-based, typed)
apps/mobile/src           theme, components/ui, features/<domain>/{api,hooks,components}, stores, lib
apps/admin/src/app        Next routes: (dash)/… pages, login, pay/return, api/export
apps/admin/src/lib        auth, action wrapper, resources engine, settings definitions
packages/core/src         platform-independent logic + generated database.types.ts
supabase/migrations       0001…0017: the schema source of truth
supabase/functions        Edge Functions + _shared helpers
supabase/tests            DB/function tests (PGlite) + type generator
```

## Decisions worth knowing

- **npm workspaces, not pnpm**: pnpm needs symlink privileges unavailable on the Windows dev machine; npm workspaces use junctions.
- **Slot holds are pending bookings** (no separate holds table): one constraint guards both holds and bookings.
- **Types are generated from the migrations** (`npm run gen:types -w @infinity/db-tests`) in the same shape as `supabase gen types`; swap in the CLI output once a project is linked.
- **Maintenance mode** is a public setting; the app shows a branded overlay except on sign-in screens so staff accounts can pass.
- **Fonts are bundled** (Lora, Poppins) in both apps; no third-party font requests.
