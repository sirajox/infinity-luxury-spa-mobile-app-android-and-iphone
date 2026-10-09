import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface GuestLine { variantId: string; quantity: number }

interface GuestCartState {
  lines: GuestLine[];
  add: (variantId: string, delta: number) => void;
  clear: () => void;
}

/** Guest cart: variant ids and quantities only. Prices and stock are always re-read from the server. */
export const useGuestCart = create<GuestCartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (variantId, delta) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === variantId);
          const next = Math.min(99, (existing?.quantity ?? 0) + delta);
          if (next <= 0) return { lines: s.lines.filter((l) => l.variantId !== variantId) };
          return existing
            ? { lines: s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: next } : l)) }
            : { lines: [...s.lines, { variantId, quantity: next }] };
        }),
      clear: () => set({ lines: [] }),
    }),
    { name: 'infinity-guest-cart-v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
