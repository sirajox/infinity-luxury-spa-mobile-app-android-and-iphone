# Database

Source of truth: `supabase/migrations/*.sql`, applied in order. Tests run all of them: `npm run test:db`.

| Migration | Contents |
|---|---|
| 0001 | Profiles, RBAC (roles, permissions, user_roles), `has_permission`, escalation guards, audit log, role seed, `bootstrap_super_admin` |
| 0002 | Branches (real contact data, hours **unverified**, bookings **disabled**), branch hours/holidays, staff + schedules/breaks/leave, settings |
| 0003 | Treatment categories (from the design), subcategories, services, branch/staff eligibility |
| 0004 | Bookings, exclusion constraint, status history, `get_available_slots`, `get_available_days`, `create_booking`, `admin_create_booking`, `reschedule_booking` |
| 0005 | Products/variants/images, branch inventory + movements, carts, delivery fees, coupons, orders, reservations, `quote_cart`, `create_order`, `adjust_inventory`, `transfer_inventory` |
| 0006 | Membership plans (**unpublished**), packages, reviews with eligibility trigger + rating views, wishlists |
| 0007 | Payments, payment events (idempotency), refunds, `create_payment_intent`, `apply_payment_success`, refund workflow, receipts |
| 0008 | Banners, policies (unpublished placeholders), FAQs, tour steps, notifications + outbox + triggers, support tickets, reminder/expiry jobs, broadcasts |
| 0009 | Account deletion/export, `dashboard_summary` |
| 0010 | **RLS and grants for every table**, storage-safe helpers, `cancel_booking` |
| 0011 | Storage buckets and object policies |
| 0012 | pg_cron schedules (when the extension is available) |
| 0013 | `cart_add`, `cart_merge`, `toggle_wishlist` |
| 0014 | Category/subcategory stats views |
| 0015 | Optional public settings (consultation fee, support contact) |
| 0016 | `my_permissions`, `record_manual_payment`, `reject_refund`, `find_user_by_email` |
| 0017 | `revenue_by_day` |

## Conventions

- UUID keys; `timestamptz` UTC; branch-local scheduling uses `branches.timezone` (default `Africa/Lagos`).
- Money: `bigint` kobo. Basis points for percentages (`2000` = 20%).
- Statuses are enums; transitions are enforced by triggers and mirrored in `packages/core/src/statuses.ts`.
- Immutable snapshots: `bookings.service_name/total_kobo`, `order_items.*_snapshot`, `memberships.plan_snapshot`, `package_purchases.package_snapshot`.
- User FKs on retained records point to `profiles(id) on delete set null`, so financial records survive account deletion.
- Append-only tables (trigger-enforced): `audit_logs`, `booking_status_history`, `order_status_history`, `inventory_transactions`.

## Not implemented as separate tables (by design)

- `booking_holds`: a hold is a `pending` booking with `hold_expires_at` guarded by the same exclusion constraint.
- `membership_payments`: `payments.membership_id` links a payment to its membership.
- `staff_accounts`: `staff.user_id` maps a staff profile to a login; dashboard access comes from `user_roles`.

## Regenerating types

After any migration: `npm run test:db` then `npm run gen:types -w @infinity/db-tests` (writes `packages/core/src/database.types.ts`).

## First Super Admin

Create the owner's account (sign up in the app or Auth dashboard), then in the Supabase SQL editor:

```sql
select public.bootstrap_super_admin('owner@example.com');
```

It runs only from a privileged SQL session (not through the API) and only if no Super Admin exists.
