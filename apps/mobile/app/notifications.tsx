import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import type { NotificationRow } from '@/features/account/api';
import { useMarkRead, useNotifications } from '@/features/account/hooks';
import { toUserMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/format';
import { colors, layout } from '@/theme';

type Filter = 'all' | 'booking' | 'order' | 'offer';
const FILTERS: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'booking', label: 'Bookings' }, { value: 'order', label: 'Orders' }, { value: 'offer', label: 'Offers' }];
const ICONS: Record<NotificationRow['kind'], IconName> = { booking: 'calendar', order: 'truck', payment: 'wallet', membership: 'sparkle', offer: 'tag', system: 'bell' };

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Screen 26: notifications with filters and mark-all-as-read. */
export default function Notifications() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useNotifications();
  const markRead = useMarkRead();
  const [filter, setFilter] = useState<Filter>('all');

  const sections = useMemo(() => {
    const rows = (data ?? []).filter((n) => filter === 'all' || n.kind === filter || (filter === 'order' && n.kind === 'payment'));
    const today = rows.filter((n) => isToday(n.created_at));
    const earlier = rows.filter((n) => !isToday(n.created_at));
    return [{ title: 'Today', data: today }, { title: 'Earlier', data: earlier }].filter((s) => s.data.length > 0);
  }, [data, filter]);
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  const open = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate([n.id]);
    const d = n.data ?? {};
    if (d.booking_id) router.push({ pathname: '/booking/[id]', params: { id: d.booking_id } });
    else if (d.order_id) router.push({ pathname: '/order/[id]', params: { id: d.order_id } });
    else if (d.membership_id) router.push('/memberships' as Href);
  };

  return (
    <Screen
      scroll={false} padded={false}
      header={<ScreenHeader title="Notifications" right={unread > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Mark all as read" onPress={() => markRead.mutate(undefined)} hitSlop={12}><Text variant="label" color={colors.goldText}>Mark all as read</Text></Pressable> : undefined} />}
    >
      <View style={styles.filters}>
        {FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />)}
      </View>
      {isLoading ? <View style={styles.pad}><SkeletonList rows={4} height={72} /></View> : isError ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <SectionList
          sections={sections} keyExtractor={(n) => n.id} contentContainerStyle={styles.pad} stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text variant="label" color={colors.grey600} style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.body}. ${relativeTime(item.created_at)}${item.read_at ? '' : '. Unread'}`} onPress={() => open(item)} style={styles.row}>
              <View style={[styles.icon, !item.read_at && styles.iconUnread]}><Icon name={ICONS[item.kind]} size={18} color={item.read_at ? colors.grey600 : colors.gold} /></View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{item.title}</Text>
                <Text variant="caption" numberOfLines={2}>{item.body}</Text>
                <Text variant="caption" color={colors.grey400}>{relativeTime(item.created_at)}</Text>
              </View>
              {!item.read_at ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="bell" title="You are all caught up" body="Appointment reminders, order updates and offers will appear here." />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: layout.screenPadding, paddingBottom: 12, flexWrap: 'wrap' },
  pad: { paddingHorizontal: layout.screenPadding, paddingBottom: 32 },
  sectionTitle: { marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200, minHeight: layout.minTouch + 20 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.grey50, alignItems: 'center', justifyContent: 'center' },
  iconUnread: { backgroundColor: colors.black },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginTop: 6 },
});
