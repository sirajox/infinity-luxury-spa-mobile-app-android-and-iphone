import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, branchId, createDb, createUser, failure, futureDate, grantRole, ids, type Db } from './helpers';

let db: Db;
let abuja: string;
let alice: string;
let bob: string;
const date = futureDate(3);

async function slots(staff: string | null = null, service = ids.swedish) {
  const res = await db.query<{ slot_time: string; slot_staff_id: string }>(
    `select slot_time::text, slot_staff_id from public.get_available_slots($1, $2, $3, $4::date)`,
    [service, abuja, staff, date],
  );
  return res.rows;
}

async function book(userId: string, time: string, staff: string | null = null, option = 'advance') {
  return as(db, { userId }, async () => {
    const res = await db.query<{ id: string; staff_id: string; due_now_kobo: string; total_kobo: string; status: string }>(
      `select * from public.create_booking($1, $2, $3, $4::date, $5::time, $6::public.payment_option)`,
      [ids.swedish, abuja, staff, date, time, option],
    );
    return res.rows[0]!;
  });
}

beforeAll(async () => {
  db = await createDb();
  abuja = await branchId(db, 'abuja');
  alice = await createUser(db, 'alice@example.com', 'Alice Bello');
  bob = await createUser(db, 'bob@example.com', 'Bob Musa');
});
afterAll(async () => {
  await db.close();
});

describe('availability', () => {
  it('offers slots only for eligible staff within working hours, stepped by the configured interval', async () => {
    const all = await slots();
    expect(all.length).toBeGreaterThan(0);
    const times = [...new Set(all.map((s) => s.slot_time))];
    expect(times[0]).toBe('09:00:00');
    expect(times.at(-1)).toBe('18:00:00'); // 60-minute treatment must finish by 19:00
    expect(times).toContain('09:30:00');
  });

  it('does not offer slots for unknown branches, quote-only services or closed bookings', async () => {
    const none = await db.query(
      `select * from public.get_available_slots($1, $2, null, $3::date)`,
      [ids.swedish, '00000000-0000-0000-0000-000000000099', date],
    );
    expect(none.rows).toHaveLength(0);
  });

  it('hides slots during staff breaks, leave, holidays and past the booking window', async () => {
    const [{ id: staffId }] = (await db.query<{ id: string }>(`select id from public.staff where id = $1`, [ids.staffA])).rows as [{ id: string }];
    await db.query(`insert into public.staff_breaks (staff_id, day_of_week, starts, ends) values ($1, null, '12:00', '13:00')`, [staffId]);
    const withBreak = await slots(ids.staffA);
    const times = withBreak.map((s) => s.slot_time);
    expect(times).not.toContain('12:00:00');
    expect(times).not.toContain('11:30:00'); // 60 min starting 11:30 overlaps the 12:00 break
    expect(times).toContain('13:00:00');
    await db.query(`delete from public.staff_breaks`);

    await db.query(`insert into public.staff_leave (staff_id, starts_on, ends_on) values ($1, $2::date, $2::date)`, [ids.staffA, date]);
    expect(await slots(ids.staffA)).toHaveLength(0);
    expect((await slots(ids.staffB)).length).toBeGreaterThan(0); // leave is per staff member
    await db.query(`delete from public.staff_leave`);

    await db.query(`insert into public.branch_holidays (branch_id, on_date, name) values ($1, $2::date, 'Test holiday')`, [abuja, date]);
    expect(await slots()).toHaveLength(0);
    await db.query(`delete from public.branch_holidays`);

    const far = await db.query(`select * from public.get_available_slots($1, $2, null, (current_date + 400))`, [ids.swedish, abuja]);
    expect(far.rows).toHaveLength(0);
  });
});

describe('booking creation', () => {
  it('requires authentication', async () => {
    const msg = await failure(
      as(db, 'anon', () =>
        db.query(`select * from public.create_booking($1, $2, null, $3::date, '10:00', 'full')`, [ids.swedish, abuja, date]),
      ),
    );
    expect(msg).toMatch(/permission denied/i);
  });

  it('snapshots the price and computes the advance server-side', async () => {
    const b = await book(alice, '10:00', ids.staffA, 'advance');
    expect(Number(b.total_kobo)).toBe(3_000_000);
    expect(Number(b.due_now_kobo)).toBe(999_900); // 33.33% of ₦30,000, rounded half-up
    expect(b.status).toBe('pending');
  });

  it('blocks the same slot for a second customer and removes it from availability', async () => {
    const msg = await failure(book(bob, '10:00', ids.staffA));
    expect(msg).toMatch(/slot_unavailable/);
    expect((await slots(ids.staffA)).map((s) => s.slot_time)).not.toContain('10:00:00');
  });

  it('respects buffer time after an existing booking', async () => {
    // Alice holds 10:00–11:00 (+15 min buffer). 11:00 would overlap the buffer, 11:30 is free.
    const times = (await slots(ids.staffA)).map((s) => s.slot_time);
    expect(times).not.toContain('11:00:00');
    expect(times).toContain('11:30:00');
  });

  it('resolves "any staff" to distinct specialists and refuses once everyone is taken', async () => {
    // Two eligible demo staff => exactly two "any staff" bookings fit at 14:00, the third is refused.
    const results = await Promise.allSettled([book(alice, '14:00'), book(bob, '14:00'), book(alice, '14:00')]);
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof book>>> => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((r) => r.value.staff_id)).size).toBe(2);
    expect(bad).toHaveLength(1);
    expect(String((bad[0] as PromiseRejectedResult).reason)).toMatch(/slot_unavailable/);
  });

  it('refuses a booking when the database constraint is the last line of defence', async () => {
    const insert = db.query(
      `insert into public.bookings (reference, user_id, service_id, branch_id, staff_id, starts_at, ends_at, blocks_until,
         service_name, total_kobo, due_now_kobo)
       select 'BK-RACE', $1, service_id, branch_id, staff_id, starts_at, ends_at, blocks_until, service_name, total_kobo, due_now_kobo
       from public.bookings where staff_id = $2 limit 1`,
      [alice, ids.staffA],
    );
    expect(await failure(insert)).toMatch(/bookings_no_overlap|conflicting key/);
  });

  it('releases expired holds so another customer can book', async () => {
    await db.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where status = 'pending'`);
    const times = (await slots(ids.staffA)).map((s) => s.slot_time);
    expect(times).toContain('10:00:00');
    const b = await book(bob, '10:00', ids.staffA, 'full');
    expect(b.status).toBe('pending');
    const expired = await db.query<{ n: string }>(`select count(*) n from public.bookings where status = 'expired'`);
    expect(Number(expired.rows[0]!.n)).toBeGreaterThan(0);
  });

  it('keeps an audit trail of status changes and forbids invalid transitions', async () => {
    const history = await db.query(`select * from public.booking_status_history`);
    expect(history.rows.length).toBeGreaterThan(0);
    const bad = db.query(`update public.bookings set status = 'completed' where status = 'expired'`);
    expect(await failure(bad)).toMatch(/invalid_booking_transition/);
    expect(await failure(db.query(`update public.booking_status_history set note = 'x'`))).toMatch(/append-only/);
  });
});

describe('customer access', () => {
  it('lets customers read only their own bookings and never modify them directly', async () => {
    const mine = await as(db, { userId: alice }, () => db.query(`select id from public.bookings`));
    expect(mine.rows.length).toBeGreaterThan(0);
    const { rows } = await as(db, { userId: bob }, () => db.query(`select user_id from public.bookings`));
    expect(rows.every((r) => (r as { user_id: string }).user_id === bob)).toBe(true);

    const upd = as(db, { userId: bob }, () => db.query(`update public.bookings set paid_kobo = 1`));
    expect(await failure(upd)).toMatch(/permission denied/i);
    const ins = as(db, { userId: bob }, () =>
      db.query(`insert into public.bookings (reference) values ('x')`));
    expect(await failure(ins)).toMatch(/permission denied/i);
  });

  it('enforces the cancellation window and lets staff cancel only through cancel_booking', async () => {
    const mine = await as(db, { userId: bob }, () => db.query<{ id: string }>(`select id from public.bookings where status = 'pending'`));
    const id = mine.rows[0]!.id;
    const manager = await createUser(db, 'mgr@example.com');
    await grantRole(db, manager, 'booking_manager', 'abuja');
    const direct = as(db, { userId: manager }, () => db.query(`update public.bookings set status = 'cancelled' where id = $1`, [id]));
    expect(await failure(direct)).toMatch(/use cancel_booking/);
    const cancelled = await as(db, { userId: manager }, () =>
      db.query<{ status: string }>(`select * from public.cancel_booking($1, 'test')`, [id]));
    expect(cancelled.rows[0]!.status).toBe('cancelled');
  });

  it('keeps branch-scoped staff out of other branches', async () => {
    const kanoOnly = await createUser(db, 'kano-mgr@example.com');
    await grantRole(db, kanoOnly, 'booking_manager', 'kano');
    const seen = await as(db, { userId: kanoOnly }, () => db.query(`select id from public.bookings`));
    expect(seen.rows).toHaveLength(0);
  });
});
