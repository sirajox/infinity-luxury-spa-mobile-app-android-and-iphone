import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SlotPicker } from '@/features/booking/SlotPicker';
import { useDraftGuard } from '@/features/booking/useDraftGuard';
import { formatDuration } from '@/lib/format';
import { useBookingDraft } from '@/stores/bookingDraft';

/** Screen 14: date and time, from the authoritative availability functions. */
export default function DateTime() {
  const router = useRouter();
  const { draft, ready } = useDraftGuard('branch');
  const setSlot = useBookingDraft((s) => s.setSlot);
  if (!ready || !draft.service || !draft.branch) return null;

  const subtitle = `${draft.service.name} with ${draft.staff?.fullName.split(' ')[0] ?? 'any available staff'}, ${formatDuration(draft.service.durationMinutes)}`;
  return (
    <Screen
      header={<ScreenHeader title="Pick a date and time" subtitle={subtitle} />}
      footer={<Button label="Continue" disabled={!draft.date || !draft.time} onPress={() => router.push('/booking/review')} />}
      contentStyle={{ paddingTop: 4 }}
    >
      <SlotPicker
        serviceId={draft.service.id} branchId={draft.branch.id} staffId={draft.staff?.id ?? null} timezone={draft.branch.timezone}
        date={draft.date} time={draft.time}
        onChange={(d, t) => { if (t) setSlot(d, t); else useBookingDraft.setState({ date: d, time: null }); }}
      />
    </Screen>
  );
}
