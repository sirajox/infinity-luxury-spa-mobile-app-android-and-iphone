import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => memory.get(k) ?? null,
    setItem: async (k: string, v: string) => void memory.set(k, v),
    removeItem: async (k: string) => void memory.delete(k),
  },
}));

const { useGuestCart } = await import('./guestCart');
const { useBookingDraft } = await import('./bookingDraft');
const { useUi } = await import('./ui');

const service = { id: 's1', slug: 'swedish', name: 'Swedish Massage', durationMinutes: 60, priceKobo: 3_000_000, priceType: 'fixed' as const };
const branch = (id: string) => ({ id, name: id, area: null, timezone: 'Africa/Lagos' });

describe('guest cart', () => {
  beforeEach(() => useGuestCart.getState().clear());

  it('adds, merges and removes lines, clamped to 99', () => {
    const { add } = useGuestCart.getState();
    add('v1', 2);
    add('v1', 3);
    add('v2', 1);
    expect(useGuestCart.getState().lines).toEqual([{ variantId: 'v1', quantity: 5 }, { variantId: 'v2', quantity: 1 }]);
    add('v1', 500);
    expect(useGuestCart.getState().lines[0]?.quantity).toBe(99);
    add('v2', -1);
    expect(useGuestCart.getState().lines.map((l) => l.variantId)).toEqual(['v1']);
  });

  it('stores only ids and quantities, never prices', () => {
    useGuestCart.getState().add('v1', 1);
    expect(Object.keys(useGuestCart.getState().lines[0] ?? {}).sort()).toEqual(['quantity', 'variantId']);
  });
});

describe('booking draft', () => {
  beforeEach(() => useBookingDraft.getState().reset());

  it('invalidates dependent choices when an earlier step changes', () => {
    const d = useBookingDraft.getState();
    d.start(service);
    d.setBranch(branch('abuja'));
    d.setStaff({ id: 'st1', fullName: 'Demo A' });
    d.setSlot('2026-10-09', '14:00');
    expect(useBookingDraft.getState()).toMatchObject({ date: '2026-10-09', time: '14:00' });

    d.setStaff(null); // changing staff clears the slot (availability differs per specialist)
    expect(useBookingDraft.getState()).toMatchObject({ date: null, time: null });

    d.setSlot('2026-10-10', '10:00');
    d.setBranch(branch('kano')); // new branch clears staff and slot
    expect(useBookingDraft.getState()).toMatchObject({ staff: null, date: null, time: null });

    d.setBranch(branch('kano')); // re-selecting the same branch keeps choices
    d.setSlot('2026-10-11', '11:00');
    d.setBranch(branch('kano'));
    expect(useBookingDraft.getState().time).toBe('11:00');
  });

  it('defaults to the advance payment option and resets with each new booking', () => {
    const d = useBookingDraft.getState();
    d.start(service);
    d.setPaymentOption('full');
    d.start(service);
    expect(useBookingDraft.getState().paymentOption).toBe('advance');
  });
});

describe('ui store', () => {
  it('keeps a bounded, de-duplicated recently-viewed list', () => {
    const { pushRecent } = useUi.getState();
    for (let i = 0; i < 20; i++) pushRecent({ kind: 'product', slug: `p${i}`, name: `P${i}` });
    pushRecent({ kind: 'product', slug: 'p5', name: 'P5' });
    const list = useUi.getState().recentlyViewed;
    expect(list).toHaveLength(12);
    expect(list[0]?.slug).toBe('p5');
    expect(list.filter((r) => r.slug === 'p5')).toHaveLength(1);
  });
});
