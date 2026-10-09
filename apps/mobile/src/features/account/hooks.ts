import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERSIST } from '@/lib/queryClient';
import { useUserId } from '@/features/auth/store';
import {
  fetchSettings, createTicket, deleteAddress, fetchAddresses, fetchBanners, fetchContent, fetchFaqs, fetchMaintenance, fetchMyMemberships,
  fetchNotifications, fetchPackages, fetchPlans, fetchPrefs, fetchProfile, fetchProfileStats, fetchTourSteps, fetchUnreadCount,
  markNotificationsRead, savePrefs, saveAddress, submitReview, updateProfile, type Prefs,
} from './api';

export function useProfile() {
  const userId = useUserId();
  return useQuery({ queryKey: ['profile', userId], queryFn: () => fetchProfile(userId as string), enabled: !!userId });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateProfile>[1]) => updateProfile(userId as string, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useProfileStats() {
  const userId = useUserId();
  return useQuery({ queryKey: ['profile', 'stats', userId], queryFn: fetchProfileStats, enabled: !!userId });
}

export function useAddresses() {
  const userId = useUserId();
  return useQuery({ queryKey: ['addresses', userId], queryFn: fetchAddresses, enabled: !!userId });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (a: Parameters<typeof saveAddress>[1]) => saveAddress(userId as string, a),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['addresses'] }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deleteAddress, onSuccess: () => void qc.invalidateQueries({ queryKey: ['addresses'] }) });
}

export function usePrefs() {
  const userId = useUserId();
  return useQuery({ queryKey: ['prefs', userId], queryFn: () => fetchPrefs(userId as string), enabled: !!userId });
}

export function useSavePrefs() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (p: Prefs) => savePrefs(userId as string, p),
    // Optimistic with rollback so toggles feel instant but never lie about what the server holds.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['prefs', userId] });
      const prev = qc.getQueryData<Prefs>(['prefs', userId]);
      qc.setQueryData(['prefs', userId], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['prefs', userId], ctx.prev); },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['prefs'] }),
  });
}

export function useNotifications() {
  const userId = useUserId();
  return useQuery({ queryKey: ['notifications', userId], queryFn: fetchNotifications, enabled: !!userId, refetchInterval: 60_000 });
}

export function useUnreadCount() {
  const userId = useUserId();
  return useQuery({ queryKey: ['notifications', 'unread', userId], queryFn: fetchUnreadCount, enabled: !!userId, refetchInterval: 60_000 });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (ids?: string[]) => markNotificationsRead(ids), onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }) });
}

export const useFaqs = () => useQuery({ queryKey: ['content', 'faqs'], queryFn: fetchFaqs, meta: PERSIST });
export const useContent = (slug: string) => useQuery({ queryKey: ['content', slug], queryFn: () => fetchContent(slug), meta: PERSIST });
export const useTourSteps = (kind: 'onboarding' | 'tour') => useQuery({ queryKey: ['content', 'tour', kind], queryFn: () => fetchTourSteps(kind), meta: PERSIST });
export const useBanners = (placement: 'home_hero' | 'store_hero') => useQuery({ queryKey: ['content', 'banners', placement], queryFn: () => fetchBanners(placement), meta: PERSIST });
export const useMaintenance = () => useQuery({ queryKey: ['content', 'maintenance'], queryFn: fetchMaintenance, refetchInterval: 5 * 60_000, staleTime: 60_000 });
export const usePlans = () => useQuery({ queryKey: ['content', 'plans'], queryFn: fetchPlans });
export const usePackages = () => useQuery({ queryKey: ['content', 'packages'], queryFn: fetchPackages });

export function useMyMemberships() {
  const userId = useUserId();
  return useQuery({ queryKey: ['memberships', userId], queryFn: fetchMyMemberships, enabled: !!userId });
}

export function useCreateTicket() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Parameters<typeof createTicket>[1]) => createTicket(userId as string, p),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['support'] }),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: submitReview, onSuccess: () => void qc.invalidateQueries({ queryKey: ['catalog', 'reviews'] }) });
}

/** Public business setting (booking rules, support contact, …) with a safe fallback. */
export function useSetting<T>(key: string, fallback: T) {
  return useQuery({ queryKey: ['content', 'setting', key], queryFn: () => fetchSettings<T>(key, fallback), staleTime: 10 * 60_000, meta: PERSIST });
}
