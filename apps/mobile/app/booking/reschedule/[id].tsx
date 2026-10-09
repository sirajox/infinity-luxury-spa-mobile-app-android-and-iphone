import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { SlotPicker } from '@/features/booking/SlotPicker';
import { useBooking, useRescheduleBooking } from '@/features/booking/hooks';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';

/** Reschedule within policy; the database re-validates the new slot and enforces the notice window. */
export default function Reschedule() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, isError, error, refetch } = useBooking(id);
  const mutation = useRescheduleBooking();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  if (isLoading) return <Screen><SkeletonList rows={3} height={120} /></Screen>;
  if (isError) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /></Screen>;
  if (!b) return <Screen><EmptyState icon="calendar" title="Booking not found" actionLabel="My bookings" onAction={() => router.replace('/(tabs)/bookings')} /></Screen>;

  const submit = () => {
    if (!date || !time) return;
    mutation.mutate({ id: b.id, date, time }, {
      onSuccess: () => { haptics.success(); toast.success('Your appointment has been rescheduled.'); router.replace({ pathname: '/booking/[id]', params: { id: b.id } }); },
      onError: (e) => { haptics.error(); toast.error(toUserMessage(e)); },
    });
  };

  return (
    <Screen
      header={<ScreenHeader title="Reschedule" subtitle={`${b.service_name} with ${b.staff?.full_name ?? 'our team'}`} />}
      footer={<Button label="Confirm new time" disabled={!date || !time} loading={mutation.isPending} onPress={submit} />}
    >
      <SlotPicker
        serviceId={b.service_id} branchId={b.branch_id} staffId={b.staff_id} timezone={b.branches?.timezone ?? 'Africa/Lagos'}
        date={date} time={time} excludeBooking={b.id}
        onChange={(d, t) => { setDate(d); setTime(t); }}
      />
    </Screen>
  );
}
