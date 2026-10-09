import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useProfile } from '@/features/account/hooks';
import { useDraftGuard } from '@/features/booking/useDraftGuard';
import { BranchOption } from '@/features/catalog/components';
import { useBranches, useService } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';
import { useBookingDraft } from '@/stores/bookingDraft';

/** Screen 11: choose the branch. Only branches that offer the treatment and have bookings enabled are selectable. */
export default function ChooseCity() {
  const router = useRouter();
  const { draft, ready } = useDraftGuard('service');
  const setBranch = useBookingDraft((s) => s.setBranch);
  const service = useService(draft.service?.slug);
  const branches = useBranches();
  const profile = useProfile();
  const [selected, setSelected] = useState<string | null>(draft.branch?.id ?? null);

  const offered = (branches.data ?? []).filter((b) => service.data?.branch_ids.includes(b.id) && b.bookings_enabled);

  // Default to the customer's preferred branch when it offers this treatment.
  useEffect(() => {
    if (selected || offered.length === 0) return;
    const preferred = offered.find((b) => b.id === profile.data?.preferred_branch_id) ?? (offered.length === 1 ? offered[0] : undefined);
    if (preferred) setSelected(preferred.id);
  }, [offered, profile.data?.preferred_branch_id, selected]);

  if (!ready) return null;
  const loading = service.isLoading || branches.isLoading;
  const error = service.error ?? branches.error;

  const next = () => {
    const b = offered.find((x) => x.id === selected);
    if (!b) return;
    setBranch({ id: b.id, name: b.name, area: b.area, timezone: b.timezone });
    router.push('/booking/staff');
  };

  return (
    <Screen
      header={<ScreenHeader title="Choose your city" subtitle={service.data ? `${draft.service?.name} is available at ${offered.length} ${offered.length === 1 ? 'branch' : 'branches'}` : undefined} />}
      footer={<Button label="Continue" disabled={!selected} onPress={next} />}
      contentStyle={styles.list}
    >
      {loading ? <SkeletonList rows={4} height={96} /> : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => { void service.refetch(); void branches.refetch(); }} />
      ) : offered.length === 0 ? (
        <EmptyState icon="pin" title="Booking is not open yet" body="This treatment cannot be booked online at any branch right now. Please contact a branch to arrange it." actionLabel="Contact a branch" onAction={() => router.push('/support')} />
      ) : (
        <View style={styles.list}>
          {offered.map((b) => <BranchOption key={b.id} branch={b} selected={selected === b.id} onSelect={() => setSelected(b.id)} />)}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 } });
