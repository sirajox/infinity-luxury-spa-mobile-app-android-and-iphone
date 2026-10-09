import { create } from 'zustand';
import type { PaymentOption } from '@infinity/core';

export interface DraftService {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  priceType: 'fixed' | 'from' | 'quote';
  categoryName?: string;
  thumbnailUrl?: string | null;
}

export interface DraftBranch { id: string; name: string; area: string | null; timezone: string }
export interface DraftStaff { id: string; fullName: string }

interface BookingDraft {
  service: DraftService | null;
  branch: DraftBranch | null;
  /** null = "Any available staff". */
  staff: DraftStaff | null;
  date: string | null;
  time: string | null; // HH:MM
  paymentOption: PaymentOption;
  start: (service: DraftService) => void;
  setBranch: (branch: DraftBranch) => void;
  setStaff: (staff: DraftStaff | null) => void;
  setSlot: (date: string, time: string) => void;
  setPaymentOption: (o: PaymentOption) => void;
  reset: () => void;
}

/** In-memory only: an unfinished booking is intentionally not persisted (availability changes quickly). */
export const useBookingDraft = create<BookingDraft>((set) => ({
  service: null,
  branch: null,
  staff: null,
  date: null,
  time: null,
  paymentOption: 'advance',
  start: (service) => set({ service, branch: null, staff: null, date: null, time: null, paymentOption: 'advance' }),
  // Changing branch invalidates staff and slot choices.
  setBranch: (branch) => set((s) => (s.branch?.id === branch.id ? { branch } : { branch, staff: null, date: null, time: null })),
  setStaff: (staff) => set({ staff, date: null, time: null }),
  setSlot: (date, time) => set({ date, time }),
  setPaymentOption: (paymentOption) => set({ paymentOption }),
  reset: () => set({ service: null, branch: null, staff: null, date: null, time: null, paymentOption: 'advance' }),
}));
