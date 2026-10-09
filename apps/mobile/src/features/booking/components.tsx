import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Photo } from '@/components/ui/Photo';
import { Text } from '@/components/ui/Text';
import { formatAppointment, formatClock, formatNaira, toDateKey } from '@/lib/format';
import type { BookingRow, BookingStatus, DayAvailability, Slot } from './api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function statusBadge(status: BookingStatus): { label: string; tone: 'success' | 'gold' | 'neutral' | 'error' } {
  switch (status) {
    case 'confirmed': return { label: 'Confirmed', tone: 'success' };
    case 'pending': return { label: 'Awaiting payment', tone: 'gold' };
    case 'checked_in': return { label: 'Checked in', tone: 'success' };
    case 'in_progress': return { label: 'In progress', tone: 'success' };
    case 'completed': return { label: 'Completed', tone: 'neutral' };
    case 'cancelled': return { label: 'Cancelled', tone: 'error' };
    case 'no_show': return { label: 'No-show', tone: 'error' };
    case 'expired': return { label: 'Expired', tone: 'neutral' };
  }
}

/**
 * Month calendar (design 14). Dots show availability: a gold dot means few slots are left. Days are enabled only
 * when the backend reports bookable slots, so fully booked/closed days can never be selected.
 */
export function MonthCalendar({ month, year, today, selected, days, loading, onSelect, onMonth, canGoBack, canGoForward }: {
  month: number; year: number; today: string; selected: string | null; days: DayAvailability[]; loading?: boolean;
  onSelect: (date: string) => void; onMonth: (delta: 1 | -1) => void; canGoBack: boolean; canGoForward: boolean;
}) {
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d.slotCount])), [days]);
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.cal}>
      <View style={styles.calHeader}>
        <IconButton icon="chevronLeft" label="Previous month" size={34} onPress={() => onMonth(-1)} style={!canGoBack && styles.faded} />
        <Text variant="title" accessibilityRole="header">{MONTHS[month]} {year}</Text>
        <IconButton icon="chevronRight" label="Next month" size={34} onPress={() => onMonth(1)} style={!canGoForward && styles.faded} />
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => <Text key={d} variant="label" align="center" style={styles.weekday}>{d}</Text>)}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={styles.cell} />;
          const key = toDateKey(year, month, day);
          const count = byDay.get(key) ?? 0;
          const past = key < today;
          const bookable = !past && count > 0;
          const isSelected = selected === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${day} ${MONTHS[month]}, ${bookable ? (count <= 3 ? 'few slots left' : 'available') : 'unavailable'}`}
              accessibilityState={{ disabled: !bookable, selected: isSelected }}
              disabled={!bookable}
              onPress={() => onSelect(key)}
              style={styles.cell}
            >
              <View style={[styles.day, isSelected && styles.daySelected]}>
                <Text variant="bodyStrong" color={isSelected ? colors.white : bookable ? colors.black : colors.grey400} style={!bookable && !past && !loading ? styles.struck : undefined}>
                  {day}
                </Text>
              </View>
              {bookable && !isSelected ? <View style={[styles.dot, count <= 3 ? styles.dotFew : styles.dotOk]} /> : <View style={styles.dotSpace} />}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        <LegendItem color={colors.black} label="Available" />
        <LegendItem color={colors.gold} label="Few slots left" />
        <LegendItem color={colors.grey400} label="Fully booked" />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text variant="caption" style={styles.legendText}>{label}</Text>
    </View>
  );
}

export function SlotGrid({ slots, selected, onSelect }: { slots: Slot[]; selected: string | null; onSelect: (time: string) => void }) {
  return (
    <View style={styles.slots}>
      {slots.map((s) => {
        const active = selected === s.time;
        return (
          <Pressable
            key={s.time}
            accessibilityRole="button"
            accessibilityLabel={formatClock(`${s.time}:00`)}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(s.time)}
            style={[styles.slot, active && styles.slotActive]}
          >
            <Text variant="bodyStrong" color={active ? colors.white : colors.black}>{formatClock(`${s.time}:00`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BookingCard({ booking, onPrimary, onReschedule, onOpen }: {
  booking: BookingRow; onPrimary?: () => void; onReschedule?: () => void; onOpen: () => void;
}) {
  const tz = booking.branches?.timezone ?? 'Africa/Lagos';
  const when = formatAppointment(booking.starts_at, tz);
  const badge = statusBadge(booking.status);
  const balance = booking.total_kobo - booking.paid_kobo;
  const showBalance = balance > 0 && ['confirmed', 'checked_in', 'in_progress', 'completed'].includes(booking.status);
  const upcoming = ['pending', 'confirmed'].includes(booking.status);
  return (
    <Card style={styles.booking}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${booking.service_name}, ${when.short}`} onPress={onOpen} style={styles.bookingTop}>
        <Photo uri={booking.services?.thumbnail_url} fallbackIcon="stones" style={styles.bookingThumb} iconSize={22} />
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={1}>{booking.service_name}</Text>
          <Text variant="caption">with {booking.staff?.full_name ?? 'our team'}</Text>
          <View style={styles.badges}>
            <Badge label={badge.label} tone={badge.tone} dot />
            {showBalance ? <Badge label={`Balance ${formatNaira(balance)}`} tone="gold" /> : booking.paid_kobo >= booking.total_kobo && booking.paid_kobo > 0 ? <Badge label="Paid in full" tone="gold" /> : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.bookingMeta}>
        <View style={styles.metaItem}><Icon name="calendar" size={14} color={colors.goldText} /><Text variant="caption">{when.short}</Text></View>
        <View style={styles.metaItem}><Icon name="pin" size={14} color={colors.goldText} /><Text variant="caption">{booking.branches?.name ?? ''}</Text></View>
      </View>
      {upcoming && (onReschedule || onPrimary) ? (
        <View style={styles.actions}>
          {booking.status === 'confirmed' && onReschedule ? <Button label="Reschedule" variant="outline" compact onPress={onReschedule} style={styles.actionBtn} /> : null}
          {onPrimary ? <Button label={showBalance ? 'Pay Balance' : booking.status === 'pending' ? 'Pay Now' : 'View Details'} compact onPress={onPrimary} style={styles.actionBtn} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Controlled month state helper for pages that embed MonthCalendar. */
export function useMonthCursor(initial: { year: number; month: number }) {
  const [cursor, setCursor] = useState(initial);
  const shift = (delta: 1 | -1) => setCursor((c) => {
    const m = c.month + delta;
    return m < 0 ? { year: c.year - 1, month: 11 } : m > 11 ? { year: c.year + 1, month: 0 } : { ...c, month: m };
  });
  return { ...cursor, shift };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  faded: { opacity: 0.3 },
  cal: { gap: 10 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, color: colors.grey600 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', height: 48, gap: 2 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.black },
  struck: { textDecorationLine: 'line-through' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotOk: { backgroundColor: colors.black },
  dotFew: { backgroundColor: colors.gold },
  dotSpace: { width: 5, height: 5 },
  legend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { width: '31%', minHeight: layout.minTouch + 4, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.grey200, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  slotActive: { backgroundColor: colors.black, borderColor: colors.black },
  booking: { padding: 14, gap: 12 },
  bookingTop: { flexDirection: 'row', gap: 12 },
  bookingThumb: { width: 60, height: 60, borderRadius: radii.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  bookingMeta: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.grey200 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
});
