import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { PressableCard } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useDraftGuard } from '@/features/booking/useDraftGuard';
import { RadioMark, StaffOption } from '@/features/catalog/components';
import { useEligibleStaff } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';
import { useBookingDraft } from '@/stores/bookingDraft';
import { colors } from '@/theme';

/** Screen 12: pick a specific specialist or let the system assign the first free one. */
export default function SelectStaff() {
  const router = useRouter();
  const { draft, ready } = useDraftGuard('branch');
  const setStaff = useBookingDraft((s) => s.setStaff);
  const staff = useEligibleStaff(draft.service?.id, draft.branch?.id);
  if (!ready) return null;

  const anyStaff = draft.staff === null;
  const chosen = staff.data?.find((s) => s.id === draft.staff?.id);
  const label = anyStaff ? 'Continue' : `Continue with ${chosen?.full_name.split(' ')[0] ?? 'specialist'}`;

  return (
    <Screen
      header={<ScreenHeader title="Select staff" subtitle={`${draft.branch?.name} branch${draft.branch?.area ? `, ${draft.branch.area}` : ''}`} />}
      footer={<Button label={label} disabled={staff.isLoading || (staff.data?.length ?? 0) === 0} onPress={() => router.push('/booking/datetime')} />}
      contentStyle={styles.list}
    >
      {staff.isLoading ? <SkeletonList rows={3} height={92} /> : staff.isError ? (
        <ErrorState message={toUserMessage(staff.error)} onRetry={() => void staff.refetch()} />
      ) : (staff.data?.length ?? 0) === 0 ? (
        <EmptyState icon="user" title="No specialists available" body="No one is assigned to this treatment at this branch yet. Try another branch." actionLabel="Choose another branch" onAction={() => router.back()} />
      ) : (
        <View style={styles.list}>
          <PressableCard onPress={() => setStaff(null)} selected={anyStaff} label="Any available staff. We assign the first free specialist." style={styles.any}>
            <View style={styles.anyIcon}><Icon name="sparkle" size={20} color={colors.gold} /></View>
            <View style={styles.flex}>
              <Text variant="title">Any available staff</Text>
              <Text variant="caption">We assign the first free specialist</Text>
            </View>
            <RadioMark selected={anyStaff} />
          </PressableCard>
          {staff.data?.map((s) => (
            <StaffOption key={s.id} staff={s} selected={draft.staff?.id === s.id}
              onSelect={() => setStaff({ id: s.id, fullName: s.full_name })}
              onProfile={() => router.push({ pathname: '/staff/[id]', params: { id: s.id } })} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 12 },
  any: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.goldSoft, borderColor: colors.goldSoft },
  anyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
});
