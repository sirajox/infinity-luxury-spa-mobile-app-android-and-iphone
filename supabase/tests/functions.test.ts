import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hmacSha512Hex, timingSafeEqual, verifyFlutterwaveHash, verifyPaystackSignature } from '../functions/_shared/signature';
import { as, branchId, createDb, createUser, futureDate, ids } from './helpers';

describe('webhook signatures', () => {
  const secret = 'sk_test_example';
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'PAY-X', id: 1 } });

  it('matches an independent HMAC-SHA512 implementation', async () => {
    expect(await hmacSha512Hex(secret, body)).toBe(createHmac('sha512', secret).update(body).digest('hex'));
  });

  it('accepts a valid Paystack signature and rejects tampering, missing headers and wrong keys', async () => {
    const sig = createHmac('sha512', secret).update(body).digest('hex');
    expect(await verifyPaystackSignature(body, sig, secret)).toBe(true);
    expect(await verifyPaystackSignature(body.replace('PAY-X', 'PAY-Y'), sig, secret)).toBe(false);
    expect(await verifyPaystackSignature(body, null, secret)).toBe(false);
    expect(await verifyPaystackSignature(body, sig, 'other')).toBe(false);
    expect(await verifyPaystackSignature(body, sig, '')).toBe(false);
  });

  it('checks the Flutterwave hash in constant time', () => {
    expect(verifyFlutterwaveHash('abc123', 'abc123')).toBe(true);
    expect(verifyFlutterwaveHash('abc124', 'abc123')).toBe(false);
    expect(verifyFlutterwaveHash(null, 'abc123')).toBe(false);
    expect(verifyFlutterwaveHash('x', '')).toBe(false);
    expect(timingSafeEqual('a', 'ab')).toBe(false);
  });
});

describe('payment reference contract', () => {
  it('generates references the verify endpoint accepts', async () => {
    const db = await createDb();
    const abuja = await branchId(db, 'abuja');
    const user = await createUser(db, 'u@example.com');
    const b = await as(db, { userId: user }, () =>
      db.query<{ id: string }>(`select * from public.create_booking($1, $2, $3, $4::date, '10:00', 'full')`, [ids.swedish, abuja, ids.staffA, futureDate(3)]));
    const p = await as(db, { userId: user }, () =>
      db.query<{ reference: string }>(`select * from public.create_payment_intent('booking', $1, 'paystack')`, [b.rows[0]!.id]));
    expect(p.rows[0]!.reference).toMatch(/^PAY-[A-Z0-9]{32}$/);
    await db.close();
  });
});
