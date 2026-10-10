import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, branchId, createDb, createUser, failure, futureDate, grantRole, ids, type Db } from './helpers';

let db: Db;
let abuja: string;
let customer: string;
const date = futureDate(6);

beforeAll(async () => {
  db = await createDb();
  abuja = await branchId(db, 'abuja');
  customer = await createUser(db, 'customer@example.com', 'Walk In');
});
afterAll(async () => {
  await db.close();
});

describe('my_permissions', () => {
  it('reports effective permissions with their branch scope, and nothing for customers', async () => {
    const mgr = await createUser(db, 'mgr@example.com');
    await grantRole(db, mgr, 'booking_manager', 'abuja');
    const rows = await as(db, { userId: mgr }, () => db.query<{ permission_key: string; branch_id: string }>(`select * from public.my_permissions()`));
    expect(rows.rows.map((r) => r.permission_key)).toEqual(expect.arrayContaining(['bookings.view', 'bookings.create']));
    expect(rows.rows.every((r) => r.branch_id === abuja)).toBe(true);
    expect(rows.rows.some((r) => r.permission_key === 'refunds.create')).toBe(false);

    const none = await as(db, { userId: customer }, () => db.query(`select * from public.my_permissions()`));
    expect(none.rows).toHaveLength(0);
    expect(await failure(as(db, 'anon', () => db.query(`select * from public.my_permissions()`)))).toMatch(/permission denied/i);
  });

  it('gives a super admin every permission', async () => {
    const root = await createUser(db, 'root@example.com');
    await grantRole(db, root, 'super_admin');
    const rows = await as(db, { userId: root }, () => db.query(`select * from public.my_permissions()`));
    expect(rows.rows).toHaveLength(33);
  });
});

describe('staff-created bookings', () => {
  it('lets authorised staff book for a customer, confirms immediately and respects the slot rules', async () => {
    const mgr = await createUser(db, 'booker@example.com');
    await grantRole(db, mgr, 'booking_manager', 'abuja');
    const b = await as(db, { userId: mgr }, () =>
      db.query<{ id: string; status: string; user_id: string; hold_expires_at: string | null }>(
        `select * from public.admin_create_booking($1, $2, $3, $4, $5::date, '10:00')`, [customer, ids.swedish, abuja, ids.staffA, date]));
    expect(b.rows[0]).toMatchObject({ status: 'confirmed', user_id: customer, hold_expires_at: null });
    expect(await failure(as(db, { userId: mgr }, () =>
      db.query(`select * from public.admin_create_booking($1, $2, $3, $4, $5::date, '10:00')`, [customer, ids.swedish, abuja, ids.staffA, date])),
    )).toMatch(/slot_unavailable/);
  });

  it('refuses staff without bookings.create for the branch and unknown customers', async () => {
    const kano = await createUser(db, 'kano@example.com');
    await grantRole(db, kano, 'booking_manager', 'kano');
    expect(await failure(as(db, { userId: kano }, () =>
      db.query(`select * from public.admin_create_booking($1, $2, $3, $4, $5::date, '12:00')`, [customer, ids.swedish, abuja, ids.staffA, date])),
    )).toMatch(/forbidden/);
    const mgr = await createUser(db, 'booker2@example.com');
    await grantRole(db, mgr, 'booking_manager', 'abuja');
    expect(await failure(as(db, { userId: mgr }, () =>
      db.query(`select * from public.admin_create_booking($1, $2, $3, $4, $5::date, '12:00')`, ['00000000-0000-0000-0000-0000000000aa', ids.swedish, abuja, ids.staffA, date])),
    )).toMatch(/customer_not_found/);
    expect(await failure(as(db, { userId: customer }, () =>
      db.query(`select * from public.admin_create_booking($1, $2, $3, $4, $5::date, '12:00')`, [customer, ids.swedish, abuja, ids.staffA, date])),
    )).toMatch(/forbidden/);
  });
});

describe('manual payments', () => {
  it('records branch payments within the outstanding balance and only for authorised staff', async () => {
    const owner = await createUser(db, 'owner@example.com');
    await grantRole(db, owner, 'business_owner');
    const mgr = await createUser(db, 'booker3@example.com');
    await grantRole(db, mgr, 'booking_manager', 'abuja');
    const b = await as(db, { userId: owner }, () =>
      db.query<{ id: string }>(`select * from public.admin_create_booking($1, $2, $3, $4, $5::date, '14:00')`, [customer, ids.swedish, abuja, ids.staffA, date]));
    const id = b.rows[0]!.id;

    // booking_manager can update bookings but cannot see payments, so cannot record money.
    expect(await failure(as(db, { userId: mgr }, () => db.query(`select * from public.record_manual_payment($1, 1000000, 'cash')`, [id])))).toMatch(/forbidden/);
    expect(await failure(as(db, { userId: owner }, () => db.query(`select * from public.record_manual_payment($1, 99999999, 'too much')`, [id])))).toMatch(/invalid_amount/);

    await as(db, { userId: owner }, () => db.query(`select * from public.record_manual_payment($1, 1000000, 'cash at desk')`, [id]));
    await as(db, { userId: owner }, () => db.query(`select * from public.record_manual_payment($1, 2000000, 'balance')`, [id]));
    const after = await db.query<{ paid_kobo: string | number }>(`select paid_kobo from public.bookings where id = $1`, [id]);
    expect(Number(after.rows[0]!.paid_kobo)).toBe(3_000_000);
    expect(await failure(as(db, { userId: owner }, () => db.query(`select * from public.record_manual_payment($1, 100, 'over')`, [id])))).toMatch(/invalid_amount/);
    const pay = await db.query<{ provider: string; status: string }>(`select provider, status from public.payments where booking_id = $1`, [id]);
    expect(pay.rows.every((p) => p.provider === 'manual' && p.status === 'succeeded')).toBe(true);
  });
});

describe('revenue_by_day', () => {
  it('returns a continuous daily series scoped to permitted branches', async () => {
    const kano = await createUser(db, 'kano-report@example.com');
    await grantRole(db, kano, 'branch_manager', 'kano');
    const owner = await createUser(db, 'owner-report@example.com');
    await grantRole(db, owner, 'business_owner');
    const from = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();

    const full = await as(db, { userId: owner }, () => db.query<{ day: string; revenue_kobo: string | number }>(`select * from public.revenue_by_day($1, $2, null)`, [from, to]));
    expect(full.rows.length).toBeGreaterThanOrEqual(4);
    expect(full.rows.reduce((n, r) => n + Number(r.revenue_kobo), 0)).toBe(3_000_000); // the manual payment from the previous suite

    const scoped = await as(db, { userId: kano }, () => db.query<{ revenue_kobo: string | number }>(`select * from public.revenue_by_day($1, $2, null)`, [from, to]));
    expect(scoped.rows.reduce((n, r) => n + Number(r.revenue_kobo), 0)).toBe(0);
    expect(await failure(as(db, { userId: kano }, () => db.query(`select * from public.revenue_by_day($1, $2, $3)`, [from, to, abuja])))).toMatch(/forbidden/);
    expect(await failure(as(db, { userId: customer }, () => db.query(`select * from public.revenue_by_day($1, $2, null)`, [from, to])))).toMatch(/forbidden/);
    expect(await failure(as(db, { userId: owner }, () => db.query(`select * from public.revenue_by_day($1, $2, null)`, ['2020-01-01', '2026-01-01'])))).toMatch(/range_too_large/);
  });
});

describe('reject_refund', () => {
  it('lets finance decline a pending refund once, with a reason, and no one else', async () => {
    const finance = await createUser(db, 'fin-reject@example.com');
    await grantRole(db, finance, 'finance_manager');
    const pay = await db.query<{ id: string }>(`select id from public.payments where status = 'succeeded' limit 1`);
    await db.query(`insert into public.refunds (payment_id, amount_kobo, reason) values ($1, 1000, 'test')`, [pay.rows[0]!.id]);
    const refund = (await db.query<{ id: string }>(`select id from public.refunds where status = 'requested' limit 1`)).rows[0]!.id;
    expect(await failure(as(db, { userId: customer }, () => db.query(`select public.reject_refund($1, 'no')`, [refund])))).toMatch(/forbidden/);
    expect(await failure(as(db, { userId: finance }, () => db.query(`select public.reject_refund($1, '')`, [refund])))).toMatch(/reason_required/);
    await as(db, { userId: finance }, () => db.query(`select public.reject_refund($1, 'Outside the free cancellation window')`, [refund]));
    const row = await db.query<{ status: string; processed_by: string }>(`select status, processed_by from public.refunds where id = $1`, [refund]);
    expect(row.rows[0]).toEqual({ status: 'rejected', processed_by: finance });
    expect(await failure(as(db, { userId: finance }, () => db.query(`select public.reject_refund($1, 'again')`, [refund])))).toMatch(/refund_not_pending/);
  });
});

describe('find_user_by_email', () => {
  it('resolves exact emails for user managers only', async () => {
    const hr = await createUser(db, 'hr-find@example.com');
    await db.query(`insert into public.roles (key, name) values ('finder', 'Finder') on conflict do nothing`);
    await db.query(`insert into public.role_permissions (role_id, permission_key) select id, 'users.manage' from public.roles where key = 'finder' on conflict do nothing`);
    await grantRole(db, hr, 'finder');
    const hit = await as(db, { userId: hr }, () => db.query<{ id: string }>(`select * from public.find_user_by_email(' CUSTOMER@example.com ')`));
    expect(hit.rows[0]?.id).toBe(customer);
    const partial = await as(db, { userId: hr }, () => db.query(`select * from public.find_user_by_email('customer')`));
    expect(partial.rows).toHaveLength(0);
    const denied = await as(db, { userId: customer }, () => db.query(`select * from public.find_user_by_email('customer@example.com')`));
    expect(denied.rows).toHaveLength(0);
  });
});
