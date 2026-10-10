# Security

## Trust boundaries

| Actor | Can | Cannot |
|---|---|---|
| Guest (`anon`) | Read public catalogue, branches, staff, banners, published content, settings flagged public; call availability functions | Read profiles, bookings, orders, payments, stock quantities, roles, audit logs |
| Customer | Read/write own cart, addresses, wishlist, notifications, preferences; create bookings/orders/payment intents via functions; read own bookings/orders/payments | Change paid amounts, status, stock, roles; read other customers' data; settle payments |
| Staff | What their role grants, optionally limited to branches (`user_roles.branch_id`) | Escalate privileges; edit audit logs or history tables |
| Service role (Edge Functions only) | Settle payments, finalise refunds, delete accounts, read the notification outbox | — (never present in apps or browsers) |

## Controls

- **RLS on every table**; `revoke all … from anon, authenticated` then explicit grants (migration 0010). Tests assert RLS is on for all tables and that sensitive tables are not granted to `anon`.
- **Privileged functions authenticate inside**: each `SECURITY DEFINER` function reads `auth.uid()`/`has_permission()` itself and uses `set search_path = ''`. Functions that must be service-only are granted to `service_role` only.
- **RBAC** (`roles`, `permissions`, `role_permissions`, `user_roles`) with branch scoping. A trigger stops anyone changing their own roles and restricts `super_admin`/`business_owner` grants to Super Admins. `bootstrap_super_admin` runs only from a privileged SQL session.
- **Column-level grants**: customers can update only `full_name, phone, avatar_url, preferred_branch_id, tour_completed` on their profile; staff can update only `status, notes` on bookings; reviews expose only rating/body/targets on insert.
- **Server-side authority** for money, stock, availability, coupons, delivery fees.
- **Payments**: provider verification, signature checks (constant-time), idempotent events, amount/currency validation. See [payments.md](payments.md).
- **Concurrency**: GiST exclusion constraint (bookings), row locks with deterministic ordering (stock, payments), `for update` in settlement.
- **Audit**: `audit_logs` (actor, before/after) via triggers on prices, products, settings, roles, bookings, orders, payments, refunds, coupons, branches, packages, plans, content. Append-only trigger; readable only with `audit.view`.
- **Storage**: bucket MIME/size limits; staff-write public buckets by permission; private owner-scoped buckets (`<user_id>/…`) for avatars and review photos.
- **Mobile**: session in the OS keychain/keystore (chunked SecureStore adapter); no tokens in AsyncStorage; PKCE OAuth; public env vars only; Sentry events scrubbed (auth headers, cookies, email, IP).
- **Admin**: signed-out redirect in `proxy.ts` plus per-page `requireAccess`; zod validation on every action; CSV export neutralises formula injection; security headers (HSTS, frame-deny, nosniff, referrer, permissions); service-role key only in the optional staff-invite action; open-redirect-safe login.
- **Account deletion**: password (or typed confirmation for social logins) re-authentication → cancels upcoming bookings, queues refunds, strips personal data from retained financial records → deletes the auth user.
- **Notifications**: marketing is opt-in; transactional messages are separate; per-user preferences enforced in `private.notify`.

## Secrets

Never committed (`.gitignore` blocks `.env*` except `.env.example`). Apps get only `*_URL` and the anon key. Server-only: `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions are given it by Supabase; the admin app uses it only for invitations), `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_*`, `RESEND_API_KEY`, `CRON_SECRET`.

## Known gaps to close before launch

- No automated penetration test; do one against the staging project.
- Rate limiting relies on Supabase Auth defaults and provider limits; add edge rate limits for `payment-init` if abuse appears.
- Edge Functions have not been type-checked or executed (Deno was unavailable); run `supabase functions serve` + `deno check` in CI.
- Admin has no MFA yet; enable Supabase Auth MFA for staff accounts.
- Legal documents are placeholders until the business supplies approved text.
