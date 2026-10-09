import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useSetting } from '@/features/account/hooks';
import { formatDayHeading, todayIn, toDateKey } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import { MonthCalendar, SlotGrid, useMonthCursor } from './components';
import { useAvailableDays, useSlots } from './hooks';

/**
 * Month calendar + time grid driven entirely by the backend's availability functions. Shared by new bookings and
 * rescheduling (which excludes the booking being moved so its own slot stays selectable).
 */
export function SlotPicker({ serviceId, branchId, staffId, timezone, date, time, onChange, excludeBooking }: {
  serviceId: string; branchId: string; staffId: string | null; timezone: string; date: string | null; time: string | null;
  onChange: (date: string, time: string | null) => void; excludeBooking?: string;
}) {
  const today = todayIn(timezone);
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  const cursor = useMonthCursor({ year: ty, month: tm - 1 });
  const windowDays = useSetting<number>('booking.max_window_days', 60);

  const monthStart = toDateKey(cursor.year, cursor.month, 1);
  const monthEnd = toDateKey(cursor.year, cursor.month, new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate());
  const from = monthStart < today ? today : monthStart;

  const lastBookable = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(windowDays.data ?? 60));
    return d.toISOString().slice(0, 10);
  }, [today, windowDays.data]);

  const days = useAvailableDays(from <= monthEnd ? { serviceId, branchId, staffId, from, to: monthEnd } : null);
  const slots = useSlots(date ? { serviceId, branchId, staffId, date } : null, excludeBooking);

  const canGoBack = cursor.year > ty || cursor.month > tm - 1;
  const nextMonthStart = toDateKey(cursor.month === 11 ? cursor.year + 1 : cursor.year, (cursor.month + 1) % 12, 1);
  const canGoForward = nextMonthStart <= lastBookable;

  return (
    <View style={styles.gap}>
      <MonthCalendar
        month={cursor.month} year={cursor.year} today={today} selected={date} days={(days.data ?? []).filter((d) => d.day <= lastBookable)}
        loading={days.isLoading} onSelect={(d) => onChange(d, null)} onMonth={cursor.shift} canGoBack={canGoBack} canGoForward={canGoForward}
      />
      {days.isError ? <ErrorState message={toUserMessage(days.error)} onRetry={() => void days.refetch()} /> : null}
      {date ? (
        <View style={styles.gap}>
          <Text variant="h3" accessibilityRole="header">{formatDayHeading(date)}</Text>
          {slots.isLoading ? <SkeletonList rows={3} height={48} /> : slots.isError ? (
            <ErrorState message={toUserMessage(slots.error)} onRetry={() => void slots.refetch()} />
          ) : (slots.data?.length ?? 0) === 0 ? (
            <Text variant="body">No times left on this day. Please choose another date.</Text>
          ) : (
            <SlotGrid slots={slots.data ?? []} selected={time} onSelect={(t) => onChange(date, t)} />
          )}
        </View>
      ) : (
        <Text variant="caption">Choose a date to see available times.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ gap: { gap: 14 } });
