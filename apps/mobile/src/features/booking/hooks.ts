import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/store';
import {
  cancelBooking, createBooking, fetchAvailableDays, fetchBooking, fetchMyBookings, fetchSlots, rescheduleBooking, type BookingGroup,
} from './api';

export const bookingKeys = {
  list: (userId: string | null, group: BookingGroup) => ['bookings', userId, group] as const,
  detail: (id: string) => ['booking', id] as const,
  slots: (p: object) => ['booking-slots', p] as const,
  days: (p: object) => ['booking-days', p] as const,
};

type SlotParams = { serviceId: string; branchId: string; staffId: string | null; date: string };

// Availability is always fetched fresh (staleTime 0, gcTime short); it is never persisted or reused for a new transaction.
export function useSlots(p: SlotParams | null, excludeBooking?: string) {
  return useQuery({
    queryKey: bookingKeys.slots({ ...p, excludeBooking }),
    queryFn: () => fetchSlots({ ...(p as SlotParams), excludeBooking }),
    enabled: !!p,
    staleTime: 0,
    gcTime: 30_000,
  });
}

export function useAvailableDays(p: { serviceId: string; branchId: string; staffId: string | null; from: string; to: string } | null) {
  return useQuery({
    queryKey: bookingKeys.days(p ?? {}),
    queryFn: () => fetchAvailableDays(p as NonNullable<typeof p>),
    enabled: !!p,
    staleTime: 15_000,
    gcTime: 60_000,
  });
}

export function useMyBookings(group: BookingGroup) {
  const userId = useUserId();
  return useQuery({ queryKey: bookingKeys.list(userId, group), queryFn: () => fetchMyBookings(group), enabled: !!userId });
}

export function useBooking(id: string | undefined) {
  return useQuery({ queryKey: bookingKeys.detail(id ?? ''), queryFn: () => fetchBooking(id as string), enabled: !!id });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bookings'] }),
    // A lost race changes availability for everyone; refresh it so the next attempt shows reality.
    onError: () => void qc.invalidateQueries({ queryKey: ['booking-slots'] }),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelBooking(id, reason),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: bookingKeys.detail(v.id) });
    },
  });
}

export function useRescheduleBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, time }: { id: string; date: string; time: string }) => rescheduleBooking(id, date, time),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: bookingKeys.detail(v.id) });
      void qc.invalidateQueries({ queryKey: ['booking-slots'] });
    },
  });
}
