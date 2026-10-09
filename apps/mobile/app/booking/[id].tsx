import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useSetting } from '@/features/account/hooks';
import { statusBadge } from '@/features/booking/components';
import { useBooking, useCancelBooking } from '@/features/booking/hooks';
import { addToCalendar } from '@/lib/calendar';
import { toUserMessage } from '@/lib/errors';
import { formatAppointment, formatNaira } from '@/lib/format';
import { callPhone, openDirections, openWhatsApp } from '@/lib/links';
import { toast } from '@/stores/toast';

/** Booking details: contact, directions, calendar, reschedule, cancel (with policy) and review. */
export default function BookingDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, isError, error, refetch } = useBooking(id);
  const cancel = useCancelBooking();
  const freeHours = useSetting<number>('booking.cancel_free_hours', 24);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (isLoading) return <Screen><SkeletonList rows={3} height={140} /></Screen>;
  if (isError) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /></Screen>;
  if (!b) return <Screen><EmptyState icon="calendar" title="Booking not found" actionLabel="My bookings" onAction={() => router.replace('/(tabs)/bookings')} /></Screen>;

  const tz = b.branches?.timezone ?? 'Africa/Lagos';
  const when = formatAppointment(b.starts_at, tz);
  const badge = statusBadge(b.status);
  const balance = b.total_kobo - b.paid_kobo;
  const active = ['pending', 'confirmed'].includes(b.status);
  const hoursUntil = (new Date(b.starts_at).getTime() - Date.now()) / 3_600_000;
  const refundable = hoursUntil >= Number(freeHours.data ?? 24);
  const branch = b.branches;

  return (
    <Screen header={<ScreenHeader title="Booking details" subtitle={b.reference} />} contentStyle={styles.gap}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text variant="h3" style={styles.flex}>{b.service_name}</Text>
          <Badge label={badge.label} tone={badge.tone} dot />
        </View>
        <Detail label="Date" value={when.date} />
        <Detail label="Time" value={when.time} />
        <Detail label="Staff" value={b.staff?.full_name ?? 'To be assigned'} />
        <Detail label="Branch" value={branch ? `${branch.name}, ${branch.address_line}` : ''} />
        <View style={styles.rule} />
        <Detail label="Total" value={formatNaira(b.total_kobo)} />
        <Detail label="Paid" value={formatNaira(b.paid_kobo)} />
        {balance > 0 && b.status !== 'cancelled' ? <Detail label="Balance at branch" value={formatNaira(balance)} strong /> : null}
      </Card>

      {branch ? (
        <View style={styles.row}>
          <Button label="Call" icon="phone" variant="outline" compact style={styles.flex} disabled={!branch.phone} onPress={() => branch.phone && void callPhone(branch.phone)} />
          <Button label="WhatsApp" icon="chat" variant="outline" compact style={styles.flex} disabled={!(branch.whatsapp ?? branch.phone)} onPress={() => void openWhatsApp((branch.whatsapp ?? branch.phone) as string, `Hello, about my booking ${b.reference}.`)} />
          <Button label="Directions" icon="directions" variant="outline" compact style={styles.flex} onPress={() => void openDirections({ ...branch, name: branch.name, area: branch.area, latitude: branch.latitude, longitude: branch.longitude })} />
        </View>
      ) : null}

      {active ? (
        <>
          <Button label="Add to Calendar" icon="calendar" variant="light" onPress={() => void addToCalendar({ title: `${b.service_name} · Infinity Luxury Spa`, startsAt: b.starts_at, endsAt: b.ends_at, timeZone: tz, location: branch ? `${branch.name}: ${branch.address_line}, ${branch.city}` : undefined, notes: `Reference ${b.reference}` }).then(() => toast.success('Added to your calendar.')).catch((e) => toast.error(toUserMessage(e)))} />
          {b.status === 'pending' ? <Button label="Pay Now" onPress={() => router.push({ pathname: '/booking/payment', params: { bookingId: b.id, purpose: 'booking' } })} /> : null}
          {b.status === 'confirmed' ? <Button label="Reschedule" variant="outline" onPress={() => router.push({ pathname: '/booking/reschedule/[id]', params: { id: b.id } })} /> : null}
          {b.status === 'confirmed' && balance > 0 ? <Button label="Pay Balance" onPress={() => router.push({ pathname: '/booking/payment', params: { bookingId: b.id, purpose: 'booking_balance' } })} /> : null}
          <Button label="Cancel booking" variant="ghost" onPress={() => setConfirmCancel(true)} />
        </>
      ) : null}
      {b.status === 'completed' ? (
        <View style={styles.gap}>
          <Button label="Rate this treatment" onPress={() => router.push({ pathname: '/review/[kind]/[id]', params: { kind: 'service', id: b.service_id } })} />
          {b.staff ? <Button label={`Rate ${b.staff.full_name.split(' ')[0]}`} variant="outline" onPress={() => router.push({ pathname: '/review/[kind]/[id]', params: { kind: 'staff', id: b.staff!.id } })} /> : null}
        </View>
      ) : null}

      <Sheet visible={confirmCancel} onClose={() => setConfirmCancel(false)}>
        <Text variant="h2">Cancel this appointment?</Text>
        <Text variant="body">
          {b.paid_kobo > 0
            ? refundable
              ? 'Because there is enough notice, we will queue a refund of what you paid. Our team processes it to your original payment method.'
              : `This is within ${freeHours.data ?? 24} hours of your appointment, so the amount you paid is not refundable under our cancellation policy.`
            : 'Your reserved time will be released.'}
        </Text>
        <View style={styles.row}>
          <Button label="Keep booking" variant="outline" style={styles.flex} onPress={() => setConfirmCancel(false)} />
          <Button
            label="Cancel booking" variant="danger" style={styles.flex} loading={cancel.isPending}
            onPress={() => cancel.mutate({ id: b.id, reason: 'Cancelled by customer' }, {
              onSuccess: () => { setConfirmCancel(false); toast.success('Booking cancelled.'); },
              onError: (e) => toast.error(toUserMessage(e)),
            })}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.detail}>
      <Text variant="caption">{label}</Text>
      <Text variant={strong ? 'title' : 'bodyStrong'} align="right" style={styles.flex} color={strong ? colors.goldText : colors.black}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  card: { padding: 18, gap: 12, borderRadius: radii.xl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 20 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.grey200 },
  row: { flexDirection: 'row', gap: 10 },
});
