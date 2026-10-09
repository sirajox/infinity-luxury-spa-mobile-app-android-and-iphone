import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, createUser, failure, ids, type Db } from './helpers';

let db: Db;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, 'alice@example.com');
  bob = await createUser(db, 'bob@example.com');
});
afterAll(async () => {
  await db.close();
});

const add = (user: string, delta: number) =>
  as(db, { userId: user }, async () => {
    const r = await db.query<{ q: number }>(`select public.cart_add($1, $2) as q`, [ids.serumVariant, delta]);
    return r.rows[0]!.q;
  });

describe('cart', () => {
  it('increments, decrements and removes lines atomically, clamped to 99', async () => {
    expect(await add(alice, 2)).toBe(2);
    expect(await add(alice, 3)).toBe(5);
    expect(await add(alice, -1)).toBe(4);
    expect(await add(alice, 500)).toBe(99);
    expect(await add(alice, -99)).toBe(0);
    const rows = await as(db, { userId: alice }, () => db.query(`select * from public.cart_items`));
    expect(rows.rows).toHaveLength(0);
    expect(await add(alice, -1)).toBe(0); // removing a missing line is a no-op
  });

  it('requires authentication and an active product', async () => {
    expect(await failure(as(db, 'anon', () => db.query(`select public.cart_add($1, 1)`, [ids.serumVariant])))).toMatch(/permission denied/i);
    await db.query(`update public.products set is_active = false`);
    expect(await failure(as(db, { userId: alice }, () => db.query(`select public.cart_add($1, 1)`, [ids.serumVariant])))).toMatch(/product_unavailable/);
    await db.query(`update public.products set is_active = true`);
  });

  it('merges a guest cart into the account cart without losing existing lines', async () => {
    await add(bob, 1);
    const merged = await as(db, { userId: bob }, () =>
      db.query<{ n: number }>(`select public.cart_merge($1::jsonb) as n`, [
        JSON.stringify([
          { variant_id: ids.serumVariant, quantity: 2 },
          { variant_id: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }, // unknown variant is skipped
        ]),
      ]));
    expect(merged.rows[0]!.n).toBe(1);
    const row = await as(db, { userId: bob }, () => db.query<{ quantity: number }>(`select quantity from public.cart_items`));
    expect(row.rows[0]!.quantity).toBe(3);
  });
});

describe('wishlist', () => {
  it('toggles items on and off for the caller only', async () => {
    const toggle = (user: string) =>
      as(db, { userId: user }, async () => {
        const r = await db.query<{ saved: boolean }>(`select public.toggle_wishlist($1, null) as saved`, [ids.serum]);
        return r.rows[0]!.saved;
      });
    expect(await toggle(alice)).toBe(true);
    expect(await toggle(alice)).toBe(false);
    expect(await toggle(alice)).toBe(true);
    const bobsItems = await as(db, { userId: bob }, () => db.query(`select * from public.wishlist_items`));
    expect(bobsItems.rows).toHaveLength(0);
    expect(await failure(as(db, { userId: alice }, () => db.query(`select public.toggle_wishlist(null, null)`)))).toMatch(/exactly one/);
  });
});
