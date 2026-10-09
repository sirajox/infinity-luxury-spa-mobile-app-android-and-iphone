import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, branchId, createDb, createUser, failure, futureDate, grantRole, ids, type Db } from './helpers';

let db: Db;
let abuja: string;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createDb();
  abuja = await branchId(db, 'abuja');
  alice = await createUser(db, 'alice@example.com', 'Alice Bello');
  bob = await createUser(db, 'bob@example.com', 'Bob Musa');
});
afterAll(async () => {
  await db.close();
});

describe('guests (anon)', () => {
  it('can browse public catalogue data', async () => {
    const r = await as(db, 'anon', async () => ({
      branches: await db.query(`select id from public.branches`),
      services: await db.query(`select id from public.services`),
      settings: await db.query(`select key from public.settings`),
    }));
    expect(r.branches.rows).toHaveLength(4);
    expect(r.services.rows.length).toBeGreaterThan(0);
    const keys = r.settings.rows.map((x) => (x as { key: string }).key);
    expect(keys).toContain('booking.min_notice_hours');
    expect(keys).not.toContain('inventory.reservation_minutes'); // private setting
  });

  it('cannot see inactive items, private tables or exact stock', async () => {
    await db.query(`update public.products set is_active = false`);
    const products = await as(db, 'anon', () => db.query(`select id from public.products`));
    expect(products.rows).toHaveLength(0);
    await db.query(`update public.products set is_active = true`);
    for (const table of ['profiles', 'bookings', 'orders', 'payments', 'inventory', 'audit_logs', 'user_roles']) {
      expect(await failure(as(db, 'anon', () => db.query(`select * from public.${table}`))), table).toMatch(/permission denied/i);
    }
  });

  it('can see in/out of stock but not quantities', async () => {
    const r = await as(db, 'anon', () => db.query(`select * from public.product_stock_status`));
    expect(Object.keys(r.rows[0] as object).sort()).toEqual(['branch_id', 'in_stock', 'low_stock', 'variant_id']);
  });
});

describe('privilege escalation', () => {
  it('stops customers granting themselves roles or editing permissions', async () => {
    const roleId = (await db.query<{ id: string }>(`select id from public.roles where key = 'super_admin'`)).rows[0]!.id;
    const insert = as(db, { userId: alice }, () =>
      db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [alice, roleId]));
    expect(await failure(insert)).toMatch(/row-level security|permission denied|own roles/i);
    const edit = as(db, { userId: alice }, () =>
      db.query(`insert into public.role_permissions (role_id, permission_key) values ($1, 'users.manage')`, [roleId]));
    expect(await failure(edit)).toMatch(/row-level security|permission denied|roles\.manage/i);
  });

  it('stops customers editing privileged profile columns or other people\'s profiles', async () => {
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`update public.profiles set email = 'x@y.z' where id = $1`, [alice])),
    )).toMatch(/permission denied/i);
    const other = await as(db, { userId: alice }, () =>
      db.query(`update public.profiles set full_name = 'Hacked' where id = $1 returning id`, [bob]));
    expect(other.rows).toHaveLength(0);
    const own = await as(db, { userId: alice }, () =>
      db.query(`update public.profiles set full_name = 'Alice B.', tour_completed = true where id = $1 returning id`, [alice]));
    expect(own.rows).toHaveLength(1);
    const seen = await as(db, { userId: alice }, () => db.query(`select id from public.profiles`));
    expect(seen.rows).toHaveLength(1);
  });

  it('lets only a super admin assign super_admin or owner roles, and nobody change their own', async () => {
    const manager = await createUser(db, 'hr@example.com');
    await grantRole(db, manager, 'branch_manager');
    // Give the manager users.manage via a custom role so the policy passes and the trigger is what stops them.
    await db.query(`insert into public.roles (key, name) values ('people_admin', 'People admin')`);
    await db.query(`insert into public.role_permissions (role_id, permission_key) select id, 'users.manage' from public.roles where key = 'people_admin'`);
    await grantRole(db, manager, 'people_admin');
    const superId = (await db.query<{ id: string }>(`select id from public.roles where key = 'super_admin'`)).rows[0]!.id;
    const ownerId = (await db.query<{ id: string }>(`select id from public.roles where key = 'business_owner'`)).rows[0]!.id;
    expect(await failure(
      as(db, { userId: manager }, () => db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [bob, superId])),
    )).toMatch(/super admin/i);
    expect(await failure(
      as(db, { userId: manager }, () => db.query(`insert into public.user_roles (user_id, role_id) values ($1, $2)`, [bob, ownerId])),
    )).toMatch(/super admin/i);
    expect(await failure(
      as(db, { userId: manager }, () => db.query(`insert into public.user_roles (user_id, role_id) values ($1, (select id from public.roles where key='booking_manager'))`, [manager])),
    )).toMatch(/own roles/i);
    // A normal grant to someone else works and records who granted it.
    await as(db, { userId: manager }, () =>
      db.query(`insert into public.user_roles (user_id, role_id) values ($1, (select id from public.roles where key='booking_manager'))`, [bob]));
    const granted = await db.query<{ granted_by: string }>(
      `select granted_by from public.user_roles where user_id = $1 and role_id = (select id from public.roles where key = 'booking_manager')`, [bob]);
    expect(granted.rows[0]!.granted_by).toBe(manager);
    await db.query(`delete from public.user_roles where user_id = $1`, [bob]);
  });

  it('bootstraps the first super admin only from a privileged session, and only once', async () => {
    expect(await failure(as(db, { userId: alice }, () => db.query(`select public.bootstrap_super_admin('alice@example.com')`)))).toMatch(/permission denied/i);
    expect(await failure(as(db, 'anon', () => db.query(`select public.bootstrap_super_admin('alice@example.com')`)))).toMatch(/permission denied/i);
    expect(await failure(db.query(`select public.bootstrap_super_admin('nobody@example.com')`))).toMatch(/No auth user/);
    await db.query(`select public.bootstrap_super_admin('alice@example.com')`);
    expect(await failure(db.query(`select public.bootstrap_super_admin('bob@example.com')`))).toMatch(/already exists/);
    const can = await as(db, { userId: alice }, () => db.query<{ ok: boolean }>(`select public.has_permission('refunds.create') as ok`));
    expect(can.rows[0]!.ok).toBe(true);
    await db.query(`delete from public.user_roles where user_id = $1`, [alice]);
  });
});

describe('audit logging', () => {
  it('records sensitive changes with the actor and keeps them immutable and private', async () => {
    const owner = await createUser(db, 'owner@example.com');
    await grantRole(db, owner, 'business_owner');
    await as(db, { userId: owner }, () => db.query(`update public.services set price_kobo = 3500000 where id = $1`, [ids.swedish]));
    const log = await db.query<{ actor_id: string; before_data: { price_kobo: number }; after_data: { price_kobo: number } }>(
      `select actor_id, before_data, after_data from public.audit_logs where table_name = 'services' order by id desc limit 1`);
    expect(log.rows[0]!.actor_id).toBe(owner);
    expect(log.rows[0]!.before_data.price_kobo).toBe(3_000_000);
    expect(log.rows[0]!.after_data.price_kobo).toBe(3_500_000);

    expect(await failure(db.query(`update public.audit_logs set action = 'x'`))).toMatch(/append-only/);
    expect(await failure(db.query(`delete from public.audit_logs`))).toMatch(/append-only/);
    expect(await failure(as(db, { userId: owner }, () => db.query(`delete from public.audit_logs`)))).toMatch(/permission denied/i);
    const hidden = await as(db, { userId: alice }, () => db.query(`select * from public.audit_logs`));
    expect(hidden.rows).toHaveLength(0);
    const visible = await as(db, { userId: owner }, () => db.query(`select * from public.audit_logs limit 1`));
    expect(visible.rows).toHaveLength(1);
    await db.query(`update public.services set price_kobo = 3000000 where id = $1`, [ids.swedish]);
  });

  it('stops catalogue edits by users without the permission', async () => {
    const r = await as(db, { userId: alice }, () =>
      db.query(`update public.services set price_kobo = 1 where id = $1 returning id`, [ids.swedish]));
    expect(r.rows).toHaveLength(0);
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`insert into public.products (slug, name) values ('x', 'x')`)),
    )).toMatch(/row-level security/i);
  });
});

describe('customer-owned data isolation', () => {
  it('isolates carts, addresses, wishlists, notifications and preferences per user', async () => {
    await as(db, { userId: alice }, async () => {
      await db.query(`insert into public.addresses (user_id, state, city, address_line, phone) values ($1, 'FCT', 'Abuja', '1 Test St', '08031234567')`, [alice]);
      await db.query(`insert into public.carts (user_id) values ($1)`, [alice]);
    });
    const bobView = await as(db, { userId: bob }, async () => ({
      addresses: await db.query(`select * from public.addresses`),
      carts: await db.query(`select * from public.carts`),
    }));
    expect(bobView.addresses.rows).toHaveLength(0);
    expect(bobView.carts.rows).toHaveLength(0);
    expect(await failure(
      as(db, { userId: bob }, () => db.query(`insert into public.addresses (user_id, state, city, address_line, phone) values ($1, 'FCT', 'Abuja', 'x', '1')`, [alice])),
    )).toMatch(/row-level security/i);
  });

  it('stores marketing consent as opt-in and respects it for broadcasts', async () => {
    const prefs = await db.query<{ offers: boolean }>(`select offers from public.notification_preferences where user_id = $1`, [alice]);
    expect(prefs.rows[0]!.offers).toBe(false);
    const sender = await createUser(db, 'content@example.com');
    await grantRole(db, sender, 'content_manager');
    await as(db, { userId: bob }, () => db.query(`update public.notification_preferences set offers = true where user_id = $1`, [bob]));
    const count = await as(db, { userId: sender }, () =>
      db.query<{ n: number }>(`select public.send_broadcast('Weekend offer', '20% off Hydrafacial') as n`));
    expect(count.rows[0]!.n).toBeGreaterThan(0);
    const bobs = await as(db, { userId: bob }, () => db.query(`select title from public.notifications where kind = 'offer'`));
    const alices = await as(db, { userId: alice }, () => db.query(`select title from public.notifications where kind = 'offer'`));
    expect(bobs.rows).toHaveLength(1);
    expect(alices.rows).toHaveLength(0); // opted out
    expect(await failure(as(db, { userId: alice }, () => db.query(`select public.send_broadcast('Spam', 'x')`)))).toMatch(/forbidden/);
  });

  it('keeps the notification outbox and payment events away from the API', async () => {
    expect(await failure(as(db, { userId: alice }, () => db.query(`select * from public.notification_outbox`)))).toMatch(/permission denied/i);
    expect(await failure(as(db, 'anon', () => db.query(`select * from public.payment_events`)))).toMatch(/permission denied/i);
  });
});

describe('reviews', () => {
  it('requires a completed booking, forces moderation and shows only approved reviews publicly', async () => {
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`insert into public.reviews (target, service_id, rating, body) values ('service', $1, 5, 'great')`, [ids.swedish])),
    )).toMatch(/review_not_eligible/);

    const date = futureDate(10);
    const booking = await as(db, { userId: alice }, () =>
      db.query<{ id: string }>(`select * from public.create_booking($1, $2, $3, $4::date, '10:00', 'full')`, [ids.swedish, abuja, ids.staffA, date]));
    const id = booking.rows[0]!.id;
    for (const s of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
      await db.query(`update public.bookings set status = $2::public.booking_status where id = $1`, [id, s]);
    }
    await as(db, { userId: alice }, () =>
      db.query(`insert into public.reviews (target, service_id, rating, body) values ('service', $1, 5, 'Lovely')`, [ids.swedish]));
    // second review for the same booking is refused
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`insert into public.reviews (target, service_id, rating) values ('service', $1, 4)`, [ids.swedish])),
    )).toMatch(/review_not_eligible/);

    const row = await db.query<{ status: string; verified: boolean; reviewer_name: string }>(`select status, verified, reviewer_name from public.reviews`);
    expect(row.rows[0]).toEqual({ status: 'pending', verified: true, reviewer_name: 'Alice B.' });
    expect((await as(db, 'anon', () => db.query(`select * from public.service_ratings`))).rows).toHaveLength(0);

    // Customers cannot approve their own reviews.
    const selfApprove = await as(db, { userId: alice }, () => db.query(`update public.reviews set status = 'approved' returning id`));
    expect(selfApprove.rows).toHaveLength(0); // RLS hides every row from a non-moderator
    const stillPending = await db.query<{ status: string }>(`select status from public.reviews`);
    expect(stillPending.rows[0]!.status).toBe('pending');

    const moderator = await createUser(db, 'mod@example.com');
    await grantRole(db, moderator, 'store_manager');
    await as(db, { userId: moderator }, () => db.query(`update public.reviews set status = 'approved'`));
    const ratings = await as(db, 'anon', () => db.query<{ average: string; review_count: number }>(`select * from public.service_ratings`));
    expect(ratings.rows[0]!.review_count).toBe(1);
    expect(Number(ratings.rows[0]!.average)).toBe(5);
  });
});

describe('storage', () => {
  it('lets users manage only files under their own folder and staff manage catalogue buckets', async () => {
    const own = as(db, { userId: alice }, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${alice}/me.png`]));
    await own;
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${bob}/me.png`])),
    )).toMatch(/row-level security/i);
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`insert into storage.objects (bucket_id, name) values ('product-images', 'x.png')`)),
    )).toMatch(/row-level security/i);
    const seen = await as(db, { userId: bob }, () => db.query(`select name from storage.objects where bucket_id = 'avatars'`));
    expect(seen.rows).toHaveLength(0);

    const store = await createUser(db, 'store@example.com');
    await grantRole(db, store, 'store_manager');
    await as(db, { userId: store }, () => db.query(`insert into storage.objects (bucket_id, name) values ('product-images', 'serum.png')`));
    const buckets = await db.query<{ id: string; public: boolean; file_size_limit: number }>(`select id, public, file_size_limit from storage.buckets order by id`);
    expect(buckets.rows.find((b) => b.id === 'avatars')?.public).toBe(false);
    expect(buckets.rows.find((b) => b.id === 'product-images')?.public).toBe(true);
    expect(buckets.rows.every((b) => b.file_size_limit > 0)).toBe(true);
  });
});

describe('account deletion and data export', () => {
  it('cancels upcoming bookings, queues refunds, strips personal data and keeps financial records', async () => {
    const carol = await createUser(db, 'carol@example.com', 'Carol Ade');
    const date = futureDate(12);
    const booking = await as(db, { userId: carol }, () =>
      db.query<{ id: string }>(`select * from public.create_booking($1, $2, $3, $4::date, '12:00', 'full')`, [ids.swedish, abuja, ids.staffA, date]));
    const pay = await as(db, { userId: carol }, () =>
      db.query<{ reference: string }>(`select * from public.create_payment_intent('booking', $1, 'paystack')`, [booking.rows[0]!.id]));
    await as(db, 'service', () => db.query(`select public.apply_payment_success($1, 'ref-del', 3000000, 'NGN')`, [pay.rows[0]!.reference]));

    const exported = await as(db, { userId: carol }, () => db.query<{ d: { profile: { full_name: string }; bookings: unknown[] } }>(`select public.export_my_data() as d`));
    expect(exported.rows[0]!.d.profile.full_name).toBe('Carol Ade');
    expect(exported.rows[0]!.d.bookings).toHaveLength(1);

    expect(await failure(as(db, { userId: carol }, () => db.query(`select public.prepare_account_deletion($1)`, [carol])))).toMatch(/permission denied/i);
    const result = await as(db, 'service', () => db.query<{ r: { cancelled_bookings: number } }>(`select public.prepare_account_deletion($1) as r`, [carol]));
    expect(result.rows[0]!.r.cancelled_bookings).toBe(1);

    const b = await db.query<{ status: string }>(`select status from public.bookings where id = $1`, [booking.rows[0]!.id]);
    expect(b.rows[0]!.status).toBe('cancelled');
    const refund = await db.query(`select 1 from public.refunds where reason = 'account_deleted'`);
    expect(refund.rows).toHaveLength(1);
    const profile = await db.query<{ full_name: string | null; deleted_at: string | null }>(`select full_name, deleted_at from public.profiles where id = $1`, [carol]);
    expect(profile.rows[0]!.full_name).toBeNull();
    expect(profile.rows[0]!.deleted_at).not.toBeNull();

    // Removing the auth user (done by the Edge Function) must not delete the financial records.
    await db.query(`delete from auth.users where id = $1`, [carol]);
    expect((await db.query(`select 1 from public.payments`)).rows.length).toBeGreaterThan(0);
    expect((await db.query(`select 1 from public.bookings where id = $1`, [booking.rows[0]!.id])).rows).toHaveLength(1);
    expect((await db.query(`select 1 from public.profiles where id = $1`, [carol])).rows).toHaveLength(0);
  });
});

describe('reporting scope', () => {
  it('limits the dashboard to permitted branches', async () => {
    const kanoMgr = await createUser(db, 'kanomgr@example.com');
    await grantRole(db, kanoMgr, 'branch_manager', 'kano');
    const owner = await createUser(db, 'owner2@example.com');
    await grantRole(db, owner, 'business_owner');
    const range = [new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 86_400_000).toISOString()];
    expect(await failure(
      as(db, { userId: kanoMgr }, () => db.query(`select public.dashboard_summary($1, $2, $3)`, [...range, abuja])),
    )).toMatch(/forbidden/);
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`select public.dashboard_summary($1, $2, null)`, range)),
    )).toMatch(/forbidden/);
    const scoped = await as(db, { userId: kanoMgr }, () =>
      db.query<{ s: { revenue_kobo: number; new_customers: number | null } }>(`select public.dashboard_summary($1, $2, null) as s`, range));
    expect(scoped.rows[0]!.s.revenue_kobo).toBe(0);
    expect(scoped.rows[0]!.s.new_customers).toBeNull(); // global metric hidden from branch-scoped users
    const full = await as(db, { userId: owner }, () =>
      db.query<{ s: { revenue_kobo: number; branch_performance: unknown[] } }>(`select public.dashboard_summary($1, $2, null) as s`, range));
    expect(full.rows[0]!.s.revenue_kobo).toBeGreaterThan(0);
    expect(full.rows[0]!.s.branch_performance).toHaveLength(4);
  });
});
