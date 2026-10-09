import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useSession } from '@/features/auth/store';
import type { BookingGroup } from '@/features/booking/api';
import { BookingCard } from '@/features/booking/components';
import { useMyBookings } from '@/features/booking/hooks';
import { toUserMessage } from '@/lib/errors';
import { colors, layout } from '@/theme';

const TABS = [{ value: 'upcoming', label: 'Upcoming' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }] as const;
const EMPTY: Record<BookingGroup, { title: string; body: string }> = {
  upcoming: { title: 'No upcoming appointments', body: 'Book a treatment and it will appear here.' },
  completed: { title: 'No completed appointments yet', body: 'Your visit history will appear here.' },
  cancelled: { title: 'Nothing cancelled', body: 'Cancelled and expired bookings will appear here.' },
};

/** Screen 18: my bookings. */
export default function Bookings() {
  const router = useRouter();
  const session = useSession();
  const [group, setGroup] = useState<BookingGroup>('upcoming');
  const query = useMyBookings(group);

  return (
    <Screen scroll={false} padded={false} header={<ScreenHeader noBack title="My bookings" />}>
      {!session ? (
        <SignInPrompt icon="calendarDays" title="Your appointments live here" body="Sign in to book treatments and manage your appointments." />
      ) : (
        <>
          <View style={styles.tabs}><Segmented<BookingGroup> options={TABS} value={group} onChange={setGroup} /></View>
          {query.isLoading ? <View style={styles.pad}><SkeletonList rows={3} height={170} /></View> : query.isError ? (
            <ErrorState message={toUserMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : (
            <FlashList
              data={query.data} keyExtractor={(b) => b.id} contentContainerStyle={styles.pad}
              ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
              refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.gold} />}
              renderItem={({ item }) => (
                <BookingCard
                  booking={item}
                  onOpen={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
                  onReschedule={() => router.push({ pathname: '/booking/reschedule/[id]', params: { id: item.id } })}
                  onPrimary={() => {
                    const owes = item.total_kobo - item.paid_kobo > 0;
                    if (item.status === 'pending') router.push({ pathname: '/booking/payment', params: { bookingId: item.id, purpose: 'booking' } });
                    else if (owes) router.push({ pathname: '/booking/payment', params: { bookingId: item.id, purpose: 'booking_balance' } });
                    else router.push({ pathname: '/booking/[id]', params: { id: item.id } });
                  }}
                />
              )}
              ListEmptyComponent={<EmptyState icon="calendarDays" title={EMPTY[group].title} body={EMPTY[group].body} actionLabel={group === 'upcoming' ? 'Book a treatment' : undefined} onAction={() => router.push('/treatments')} />}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: layout.screenPadding, paddingBottom: 12 },
  pad: { paddingHorizontal: layout.screenPadding, paddingBottom: 32 },
});
