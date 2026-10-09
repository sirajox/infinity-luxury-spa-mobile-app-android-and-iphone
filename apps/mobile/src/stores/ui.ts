import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface RecentItem { kind: 'service' | 'product'; slug: string; name: string }

interface UiState {
  hydrated: boolean;
  onboardingSeen: boolean;
  /** Local fallback for guests; signed-in users track completion in profiles.tour_completed. */
  tourSeenLocal: boolean;
  preferredBranchId: string | null;
  recentlyViewed: RecentItem[];
  setOnboardingSeen: () => void;
  setTourSeenLocal: (v: boolean) => void;
  setPreferredBranch: (id: string | null) => void;
  pushRecent: (item: RecentItem) => void;
}

/** Non-sensitive UI preferences only. Never put tokens, personal data or payment details here. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboardingSeen: false,
      tourSeenLocal: false,
      preferredBranchId: null,
      recentlyViewed: [],
      setOnboardingSeen: () => set({ onboardingSeen: true }),
      setTourSeenLocal: (v) => set({ tourSeenLocal: v }),
      setPreferredBranch: (id) => set({ preferredBranchId: id }),
      pushRecent: (item) =>
        set((s) => ({
          recentlyViewed: [item, ...s.recentlyViewed.filter((r) => !(r.kind === item.kind && r.slug === item.slug))].slice(0, 12),
        })),
    }),
    {
      name: 'infinity-ui-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        onboardingSeen: s.onboardingSeen, tourSeenLocal: s.tourSeenLocal,
        preferredBranchId: s.preferredBranchId, recentlyViewed: s.recentlyViewed,
      }),
      onRehydrateStorage: () => () => useUi.setState({ hydrated: true }),
    },
  ),
);
