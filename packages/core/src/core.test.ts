import { describe, expect, it } from 'vitest';
import {
  BOOKING_TRANSITIONS, ORDER_TRANSITIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS,
  calculateCouponDiscount, canTransition, computeOrderTotals, formatNaira, generateSlots,
  hasPermission, nairaToKobo, normalizeNigerianPhone, percentOf, signUpSchema, splitBookingPayment, zonedTimeToUtc,
} from './index';

describe('money', () => {
  it('formats kobo as naira', () => {
    expect(formatNaira(3_000_000)).toBe('₦30,000');
    expect(formatNaira(1_850_050)).toBe('₦18,500.50');
  });
  it('avoids float drift', () => {
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
  });
  it('rounds percentages half-up in kobo', () => {
    expect(percentOf(1_001, 1_000)).toBe(100);
    expect(percentOf(1_005, 1_000)).toBe(101);
  });
  it('splits advance payments', () => {
    expect(splitBookingPayment(3_000_000, 'advance', 3_333)).toEqual({ payNow: 999_900, balance: 2_000_100 });
    expect(splitBookingPayment(3_000_000, 'full', 3_333)).toEqual({ payNow: 3_000_000, balance: 0 });
    expect(splitBookingPayment(100, 'advance', 1_000, 500)).toEqual({ payNow: 100, balance: 0 });
  });
});

describe('orders and coupons', () => {
  it('computes totals', () => {
    const t = computeOrderTotals(
      [{ unitPrice: 1_850_000, quantity: 1 }, { unitPrice: 1_200_000, quantity: 2 }],
      350_000,
    );
    expect(t).toEqual({ subtotal: 4_250_000, discount: 0, deliveryFee: 350_000, total: 4_600_000 });
  });
  it('applies capped percentage coupons and respects minimum purchase', () => {
    const rule = { kind: 'percentage' as const, value: 2_000, minPurchase: 1_000_000, maxDiscount: 500_000 };
    expect(calculateCouponDiscount(4_250_000, rule)).toBe(500_000);
    expect(calculateCouponDiscount(900_000, rule)).toBe(0);
  });
  it('never discounts below zero total', () => {
    expect(calculateCouponDiscount(1_000, { kind: 'fixed', value: 5_000, minPurchase: 0, maxDiscount: null })).toBe(1_000);
  });
  it('rejects invalid quantity', () => {
    expect(() => computeOrderTotals([{ unitPrice: 100, quantity: 0 }], 0)).toThrow();
  });
});

describe('status machines', () => {
  it('blocks illegal transitions', () => {
    expect(canTransition(BOOKING_TRANSITIONS, 'pending', 'confirmed')).toBe(true);
    expect(canTransition(BOOKING_TRANSITIONS, 'completed', 'pending')).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, 'delivered', 'processing')).toBe(false);
  });
});

describe('time', () => {
  it('converts Lagos wall time to UTC (UTC+1)', () => {
    expect(zonedTimeToUtc('2026-10-09', '14:00', 'Africa/Lagos').toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });
});

describe('availability', () => {
  it('excludes slots that clash with bookings including buffer', () => {
    const slots = generateSlots({
      workStart: '09:00', workEnd: '12:00', durationMin: 60, bufferMin: 15, stepMin: 30,
      busy: [{ start: 10 * 60, end: 11 * 60 }],
    });
    expect(slots).not.toContain('09:30'); // 09:30–10:45 overlaps the 10:00 booking
    expect(slots).not.toContain('10:00');
    expect(slots).not.toContain('09:00'); // 09:00 + 60 + 15 buffer reaches 10:15, overlapping 10:00
    expect(slots).toContain('11:00');
  });
  it('honours minimum notice', () => {
    const slots = generateSlots({
      workStart: '09:00', workEnd: '12:00', durationMin: 30, bufferMin: 0, stepMin: 30, busy: [], notBefore: 10 * 60 + 1,
    });
    expect(slots[0]).toBe('10:30');
  });
});

describe('schemas and permissions', () => {
  it('validates sign-up', () => {
    const ok = signUpSchema.safeParse({
      fullName: 'Aisha Bello', email: 'AISHA@x.com', phone: '08031234567',
      password: 'secret123', confirmPassword: 'secret123', acceptTerms: true,
    });
    expect(ok.success).toBe(true);
    const bad = signUpSchema.safeParse({
      fullName: 'A', email: 'x', phone: '1', password: 'a', confirmPassword: 'b', acceptTerms: false,
    });
    expect(bad.success).toBe(false);
  });
  it('normalises Nigerian phone numbers to +234 form', () => {
    expect(normalizeNigerianPhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('803 123 4567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('2348031234567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('+234 803 123 4567')).toBe('+2348031234567');
  });
  it('gives finance managers refunds but not inventory adjustments', () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.finance_manager, 'refunds.create')).toBe(true);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.finance_manager, 'inventory.adjust')).toBe(false);
    expect(DEFAULT_ROLE_PERMISSIONS.super_admin.length).toBe(PERMISSIONS.length);
  });
});
