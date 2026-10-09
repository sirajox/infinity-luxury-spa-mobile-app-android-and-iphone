import { describe, expect, it } from 'vitest';
import { AppError, isNetworkError, toUserMessage } from './errors';
import { formatClock, formatDayHeading, formatDuration, formatPrice, ilikeTerm, relativeTime, toDateKey } from './format';
import { toInternational } from './phone';

describe('formatting', () => {
  it('shows consultation instead of inventing a price', () => {
    expect(formatPrice('quote', null)).toBe('Consultation');
    expect(formatPrice('fixed', null)).toBe('Consultation');
    expect(formatPrice('fixed', 3_000_000)).toBe('₦30,000');
    expect(formatPrice('from', 15_000_000)).toBe('From ₦150,000');
  });

  it('formats durations and clock times', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatClock('14:00:00')).toBe('2:00 PM');
    expect(formatClock('00:30')).toBe('12:30 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
  });

  it('formats calendar days without timezone drift', () => {
    expect(formatDayHeading('2026-10-09')).toMatch(/Friday.*9.*October/);
    expect(toDateKey(2026, 0, 5)).toBe('2026-01-05');
  });

  it('describes relative times', () => {
    expect(relativeTime(new Date().toISOString())).toBe('Just now');
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 hours ago');
    expect(relativeTime(new Date(Date.now() - 25 * 3_600_000).toISOString())).toBe('Yesterday');
  });

  it('neutralises characters that would break a PostgREST filter', () => {
    expect(ilikeTerm('  serum, (30%)  ')).toBe('serum 30');
    expect(ilikeTerm('a_b*c')).toBe('a b c');
  });
});

describe('error messages', () => {
  it('maps stable backend codes to customer copy', () => {
    expect(toUserMessage(new Error('slot_unavailable'))).toMatch(/just taken/);
    expect(toUserMessage({ message: 'quote_required' })).toMatch(/consultation/);
    expect(toUserMessage(new Error('out_of_stock'))).toMatch(/no longer available/);
  });

  it('never leaks raw errors and handles connectivity problems', () => {
    expect(toUserMessage(new Error('duplicate key value violates constraint "x"'))).toBe('Something went wrong. Please try again.');
    expect(toUserMessage(new TypeError('Network request failed'))).toMatch(/reach the server/);
    expect(isNetworkError(new Error('timeout of 10000ms exceeded'))).toBe(true);
    expect(isNetworkError(new Error('forbidden'))).toBe(false);
  });

  it('passes through the message of intentional AppErrors', () => {
    expect(toUserMessage(new AppError('calendar_denied', 'Allow calendar access.'))).toBe('Allow calendar access.');
    expect(toUserMessage(new AppError('invalid_credentials'))).toBe('The password is incorrect.');
  });
});

describe('phone numbers', () => {
  it('converts local numbers to the international form', () => {
    expect(toInternational('0806 914 6781')).toBe('2348069146781');
    expect(toInternational('+234 806 914 6781')).toBe('2348069146781');
    expect(toInternational('2348069146781')).toBe('2348069146781');
  });
});
