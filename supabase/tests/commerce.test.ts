import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, branchId, createDb, createUser, failure, futureDate, grantRole, ids, type Db } from './helpers';

let db: Db;
let abuja: string;
let kano: string;
let alice: string;
let bob: string;
let testNo = 0;
let date = futureDate(4);
beforeEach(() => {
  testNo += 1;
  date = futureDate(3 + testNo); // a fresh day per test keeps staff calendars independent
});

async function book(userId: string, time: string, option: 'full' | 'advance' = 'full') {
  return as(db, { userId }, async () => {
    const r = await db.query<{ id: string }>(
      `select * from public.create_booking($1, $2, $3, $4::date, $5::time, $6::public.payment_option)`,
      [ids.swedish, abuja, ids.staffA, date, time, option],
    );
    return r.rows[0]!.id;
  });
}
async function intent(userId: string, purpose: string, target: string) {
  return as(db, { userId }, async () => {
    const r = await db.query<{ id: string; reference: string; amount_kobo: string | number }>(
      `select * from public.create_payment_intent($1::public.payment_purpose, $2, 'paystack')`,
      [purpose, target],
    );
    return r.rows[0]!;
  });
}
async function settle(reference: string, amount: number, currency = 'NGN') {
  return as(db, 'service', async () => {
    const r = await db.query<{ status: string; failure_reason: string | null }>(
      `select * from public.apply_payment_success($1, $4, $2, $3)`,
      [reference, amount, currency, `prov-${reference}`],
    );
    return r.rows[0]!;
  });
}
async function booking(id: string) {
  const r = await db.query<{ status: string; paid_kobo: string | number }>(
    `select status, paid_kobo from public.bookings where id = $1`,
    [id],
  );
  return { status: r.rows[0]!.status, paid: Number(r.rows[0]!.paid_kobo) };
}
async function stock() {
  const r = await db.query<{ quantity: number; reserved: number }>(
    `select quantity, reserved from public.inventory where branch_id = $1 and variant_id = $2`,
    [abuja, ids.serumVariant],
  );
  return r.rows[0]!;
}
async function fillCart(userId: string, qty: number) {
  await as(db, { userId }, async () => {
    await db.query(`insert into public.carts (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
    await db.query(`delete from public.cart_items`);
    await db.query(
      `insert into public.cart_items (cart_id, variant_id, quantity)
       select id, $2, $3 from public.carts where user_id = $1`,
      [userId, ids.serumVariant, qty],
    );
  });
}
async function checkout(userId: string, fulfilment: 'delivery' | 'pickup' = 'pickup', coupon: string | null = null, state = 'FCT') {
  return as(db, { userId }, async () => {
    const r = await db.query<{ id: string; total_kobo: string | number; number: string }>(
      `select * from public.create_order($1, $2::public.fulfilment_method, 'Test', '08031234567', $3::jsonb, $4)`,
      [abuja, fulfilment, JSON.stringify({ state, city: 'Abuja', address: '12 Gana Street', landmark: 'Hilton gate' }), coupon],
    );
    return r.rows[0]!;
  });
}

beforeAll(async () => {
  db = await createDb();
  abuja = await branchId(db, 'abuja');
  kano = await branchId(db, 'kano');
  alice = await createUser(db, 'alice@example.com', 'Alice Bello');
  bob = await createUser(db, 'bob@example.com', 'Bob Musa');
});
afterAll(async () => {
  await db.close();
});

describe('payment settlement', () => {
  it('derives the amount from the booking, not from the client', async () => {
    const id = await book(alice, '09:00', 'advance');
    const p = await intent(alice, 'booking', id);
    expect(Number(p.amount_kobo)).toBe(999_900);
    expect(await failure(intent(bob, 'booking', id))).toMatch(/not_found/);
  });

  it('only the service role may settle a payment', async () => {
    const id = await book(alice, '10:30');
    const p = await intent(alice, 'booking', id);
    const msg = await failure(
      as(db, { userId: alice }, () => db.query(`select * from public.apply_payment_success($1, 'x', $2, 'NGN')`, [p.reference, 3_000_000])),
    );
    expect(msg).toMatch(/permission denied/i);
    expect(await failure(
      as(db, 'anon', () => db.query(`select * from public.apply_payment_success($1, 'x', $2, 'NGN')`, [p.reference, 3_000_000])),
    )).toMatch(/permission denied/i);
  });

  it('confirms the booking exactly once, however many times the webhook replays', async () => {
    const id = await book(alice, '12:00', 'advance');
    const p = await intent(alice, 'booking', id);
    const first = await settle(p.reference, 999_900);
    const replay = await settle(p.reference, 999_900);
    expect(first.status).toBe('succeeded');
    expect(replay.status).toBe('succeeded');
    expect(await booking(id)).toEqual({ status: 'confirmed', paid: 999_900 });
  });

  it('rejects an amount or currency mismatch and leaves the booking unpaid', async () => {
    const id = await book(alice, '13:30');
    const p = await intent(alice, 'booking', id);
    const wrongAmount = await settle(p.reference, 100);
    expect(wrongAmount.status).toBe('failed');
    expect(wrongAmount.failure_reason).toMatch(/amount_mismatch/);
    expect(await booking(id)).toEqual({ status: 'pending', paid: 0 });
    const p2 = await intent(alice, 'booking', id);
    expect((await settle(p2.reference, 3_000_000, 'USD')).status).toBe('failed');
  });

  it('collects the outstanding balance after an advance', async () => {
    const id = await book(bob, '15:00', 'advance');
    const advance = await intent(bob, 'booking', id);
    await settle(advance.reference, 999_900);
    const balance = await intent(bob, 'booking_balance', id);
    expect(Number(balance.amount_kobo)).toBe(2_000_100);
    await settle(balance.reference, 2_000_100);
    expect(await booking(id)).toEqual({ status: 'confirmed', paid: 3_000_000 });
    expect(await failure(intent(bob, 'booking_balance', id))).toMatch(/nothing_due/);
  });

  it('queues a refund instead of double-crediting a duplicate payment', async () => {
    const id = await book(alice, '16:30');
    const first = await intent(alice, 'booking', id);
    const second = await intent(alice, 'booking', id); // supersedes the first
    await settle(second.reference, 3_000_000);
    const dup = await settle(first.reference, 3_000_000);
    expect(dup.failure_reason).toBe('duplicate_payment');
    expect(await booking(id)).toEqual({ status: 'confirmed', paid: 3_000_000 });
    const refunds = await db.query<{ amount_kobo: string | number; reason: string; status: string }>(
      `select amount_kobo, reason, status from public.refunds where payment_id = (select id from public.payments where reference = $1)`,
      [first.reference],
    );
    expect(refunds.rows).toHaveLength(1);
    expect(refunds.rows[0]).toMatchObject({ reason: 'duplicate_payment', status: 'requested' });
  });

  it('revives an expired hold when the slot is still free, and refunds when it was taken', async () => {
    const id = await book(alice, '17:00');
    const p = await intent(alice, 'booking', id);
    await db.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [id]);
    await db.query(`select public.expire_stale_bookings()`);
    expect((await booking(id)).status).toBe('expired');
    expect((await settle(p.reference, 3_000_000)).status).toBe('succeeded');
    expect((await booking(id)).status).toBe('confirmed');

    const id2 = await book(bob, '09:30');
    const p2 = await intent(bob, 'booking', id2);
    await db.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [id2]);
    await db.query(`select public.expire_stale_bookings()`);
    await book(alice, '09:30'); // someone else takes the slot
    const late = await settle(p2.reference, 3_000_000);
    expect(late.failure_reason).toBe('slot_taken_after_hold_expired');
    expect((await booking(id2)).status).toBe('expired');
  });

  it('ignores duplicate provider events at the storage level', async () => {
    await db.query(`insert into public.payment_events (provider, event_id, event_type, payload) values ('paystack', 'evt_1', 'charge.success', '{}')`);
    expect(await failure(
      db.query(`insert into public.payment_events (provider, event_id, event_type, payload) values ('paystack', 'evt_1', 'charge.success', '{}')`),
    )).toMatch(/duplicate key|unique/i);
  });
});

describe('store checkout and inventory', () => {
  it('reserves stock at checkout, prices on the server and snapshots the items', async () => {
    await fillCart(alice, 2);
    const order = await checkout(alice, 'delivery');
    expect(Number(order.total_kobo)).toBe(2 * 1_850_000 + 350_000);
    expect(await stock()).toEqual({ quantity: 25, reserved: 2 });
    const items = await db.query<{ name_snapshot: string; unit_price_kobo: string | number }>(
      `select name_snapshot, unit_price_kobo from public.order_items where order_id = $1`, [order.id]);
    expect(items.rows[0]!.name_snapshot).toBe('Brightening Face Serum (Demo)');
    // A later price change must not rewrite history.
    await db.query(`update public.product_variants set compare_at_price_kobo = null, price_kobo = 9999999`);
    const again = await db.query<{ unit_price_kobo: string | number }>(`select unit_price_kobo from public.order_items where order_id = $1`, [order.id]);
    expect(Number(again.rows[0]!.unit_price_kobo)).toBe(1_850_000);
    await db.query(`update public.product_variants set price_kobo = 1850000, compare_at_price_kobo = 2200000`);
  });

  it('refuses to oversell and refuses delivery to an unconfigured state', async () => {
    await fillCart(bob, 24);
    expect(await failure(checkout(bob))).toMatch(/out_of_stock/);
    await fillCart(bob, 1);
    expect(await failure(checkout(bob, 'delivery', null, 'Lagos'))).toMatch(/delivery_unavailable/);
  });

  it('consumes the reservation on verified payment and clears the cart', async () => {
    await fillCart(alice, 2);
    const order = await checkout(alice, 'delivery');
    const p = await intent(alice, 'order', order.id);
    expect(Number(p.amount_kobo)).toBe(Number(order.total_kobo));
    await settle(p.reference, Number(order.total_kobo));
    const o = await db.query<{ status: string }>(`select status from public.orders where id = $1`, [order.id]);
    expect(o.rows[0]!.status).toBe('payment_confirmed');
    expect(await stock()).toEqual({ quantity: 23, reserved: 0 });
    const cart = await as(db, { userId: alice }, () => db.query(`select * from public.cart_items`));
    expect(cart.rows).toHaveLength(0);
    const txns = await db.query<{ kind: string }>(`select distinct kind from public.inventory_transactions`);
    expect(txns.rows.map((r) => r.kind)).toEqual(expect.arrayContaining(['reservation', 'sale']));
  });

  it('releases stock when an unpaid order is cancelled or expires', async () => {
    await fillCart(bob, 3);
    const order = await checkout(bob);
    expect((await stock()).reserved).toBe(3);
    await as(db, { userId: bob }, () => db.query(`select public.cancel_unpaid_order($1)`, [order.id]));
    expect((await stock()).reserved).toBe(0);

    await fillCart(bob, 4);
    await checkout(bob);
    await db.query(`update public.orders set reservation_expires_at = now() - interval '1 minute' where status = 'placed'`);
    await db.query(`select public.expire_stale_orders()`);
    expect((await stock()).reserved).toBe(0);
  });

  it('applies coupons server-side with caps, minimums, expiry and per-customer limits', async () => {
    await db.query(`insert into public.coupons (code, kind, value, min_purchase_kobo, max_discount_kobo, per_customer_limit)
                    values ('GLOW20', 'percentage', 2000, 1000000, 300000, 1),
                           ('EXPIRED', 'fixed', 100000, 0, null, null)`);
    await db.query(`update public.coupons set expires_at = now() - interval '1 day' where code = 'EXPIRED'`);
    await fillCart(bob, 1);
    const quote = await as(db, { userId: bob }, async () => {
      const r = await db.query<{ q: { discount_kobo: number; total_kobo: number; errors: string[] } }>(
        `select public.quote_cart($1, 'pickup', null, 'glow20') as q`, [abuja]);
      return r.rows[0]!.q;
    });
    expect(quote.errors).toEqual([]);
    expect(quote.discount_kobo).toBe(300_000); // 20% of 18,500 = 3,700 capped at 3,000
    expect(quote.total_kobo).toBe(1_850_000 - 300_000);

    const expired = await as(db, { userId: bob }, async () => {
      const r = await db.query<{ q: { errors: string[] } }>(`select public.quote_cart($1, 'pickup', null, 'EXPIRED') as q`, [abuja]);
      return r.rows[0]!.q;
    });
    expect(expired.errors).toContain('coupon_invalid');

    const order = await checkout(bob, 'pickup', 'GLOW20');
    const p = await intent(bob, 'order', order.id);
    await settle(p.reference, Number(order.total_kobo));
    await fillCart(bob, 1);
    const second = await as(db, { userId: bob }, async () => {
      const r = await db.query<{ q: { errors: string[] } }>(`select public.quote_cart($1, 'pickup', null, 'GLOW20') as q`, [abuja]);
      return r.rows[0]!.q;
    });
    expect(second.errors).toContain('coupon_limit_reached');
  });

  it('only lets authorised, branch-scoped staff change stock, and logs every movement', async () => {
    const inv = await createUser(db, 'inv@example.com');
    await grantRole(db, inv, 'inventory_manager', 'abuja');
    expect(await failure(
      as(db, { userId: alice }, () => db.query(`select public.adjust_inventory($1, $2, 5, 'x')`, [abuja, ids.serumVariant])),
    )).toMatch(/forbidden/);
    expect(await failure(
      as(db, { userId: inv }, () => db.query(`select public.adjust_inventory($1, $2, 5, 'x')`, [kano, ids.serumVariant])),
    )).toMatch(/forbidden/);
    expect(await failure(
      as(db, { userId: inv }, () => db.query(`select public.adjust_inventory($1, $2, 5, '')`, [abuja, ids.serumVariant])),
    )).toMatch(/reason_required/);
    const before = (await stock()).quantity;
    await as(db, { userId: inv }, () => db.query(`select public.adjust_inventory($1, $2, 5, 'stock take')`, [abuja, ids.serumVariant]));
    expect((await stock()).quantity).toBe(before + 5);
    const log = await db.query<{ actor_id: string; reason: string }>(
      `select actor_id, reason from public.inventory_transactions where kind = 'adjustment' order by id desc limit 1`);
    expect(log.rows[0]).toEqual({ actor_id: inv, reason: 'stock take' });
    expect(await failure(
      as(db, { userId: inv }, () => db.query(`select public.adjust_inventory($1, $2, -9999, 'oops')`, [abuja, ids.serumVariant])),
    )).toMatch(/insufficient_stock/);
    expect(await failure(db.query(`update public.inventory_transactions set reason = 'x'`))).toMatch(/append-only/);
  });
});

describe('refunds', () => {
  it('lets finance request refunds within the paid amount and the service role finalise them', async () => {
    const id = await book(alice, '11:30');
    const p = await intent(alice, 'booking', id);
    await settle(p.reference, 3_000_000);
    const finance = await createUser(db, 'fin@example.com');
    await grantRole(db, finance, 'finance_manager');
    const payment = await db.query<{ id: string }>(`select id from public.payments where reference = $1`, [p.reference]);
    const pid = payment.rows[0]!.id;

    expect(await failure(
      as(db, { userId: alice }, () => db.query(`select * from public.create_refund_request($1, 1000, 'x')`, [pid])),
    )).toMatch(/forbidden/);
    expect(await failure(
      as(db, { userId: finance }, () => db.query(`select * from public.create_refund_request($1, 99999999, 'x')`, [pid])),
    )).toMatch(/invalid_refund_amount/);
    const r = await as(db, { userId: finance }, () =>
      db.query<{ id: string }>(`select * from public.create_refund_request($1, 3000000, 'customer request')`, [pid]));
    await as(db, 'service', () => db.query(`select public.finalize_refund($1, true, 'rf_1', null, $2)`, [r.rows[0]!.id, finance]));
    const pay = await db.query<{ status: string }>(`select status from public.payments where id = $1`, [pid]);
    expect(pay.rows[0]!.status).toBe('refunded');
    expect((await booking(id)).paid).toBe(0);
    // Refunding twice is blocked.
    expect(await failure(
      as(db, { userId: finance }, () => db.query(`select * from public.create_refund_request($1, 1000, 'again')`, [pid])),
    )).toMatch(/payment_not_refundable/);
  });

  it('queues a refund when the customer cancels inside the free window and not outside it', async () => {
    const id = await book(alice, '18:00');
    const p = await intent(alice, 'booking', id);
    await settle(p.reference, 3_000_000);
    await as(db, { userId: alice }, () => db.query(`select public.cancel_booking($1, 'changed mind')`, [id]));
    const refunds = await db.query(`select 1 from public.refunds where reason = 'booking_cancelled' and payment_id = (select id from public.payments where reference = $1)`, [p.reference]);
    expect(refunds.rows).toHaveLength(1);

    const id2 = await book(bob, '10:00');
    const p2 = await intent(bob, 'booking', id2);
    await settle(p2.reference, 3_000_000);
    await db.query(`update public.bookings set starts_at = now() + interval '2 hours', ends_at = now() + interval '3 hours', blocks_until = now() + interval '3 hours 15 minutes' where id = $1`, [id2]);
    await as(db, { userId: bob }, () => db.query(`select public.cancel_booking($1, 'late')`, [id2]));
    const none = await db.query(`select 1 from public.refunds where payment_id = (select id from public.payments where reference = $1)`, [p2.reference]);
    expect(none.rows).toHaveLength(0);
  });
});
