import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useBooking } from '@/features/booking/hooks';
import { useSession } from '@/features/auth/store';
import { pushPermissionStatus, registerForPush } from '@/features/push/register';
import { addToCalendar } from '@/lib/calendar';
import { toUserMessage } from '@/lib/errors';
import { formatAppointment, formatNaira } from '@/lib/format';
import { openWhatsApp } from '@/lib/links';
import { toast } from '@/stores/toast';
import { colors, layout, radii } from '@/theme';
import { useEffect } from 'react';

/** Screen 17: booking confirmed. Only reachable after the backend has confirmed the payment. */
export default function BookingConfirmed() {
  const router = useRouter();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, refetch } = useBooking(id);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [offerReminders, setOfferReminders] = useState(false);

  // The webhook can trail the verify call by a moment; keep refreshing until the booking shows as confirmed.
  useEffect(() => {
    if (b && b.status === 'pending') {
      const t = setInterval(() => void refetch(), 3000);
      return () => clearInterval(t);
    }
  }, [b, refetch]);
  useEffect(() => { void pushPermissionStatus().then((s) => setOfferReminders(s === 'undetermined')); }, []);

  const tz = b?.branches?.timezone ?? 'Africa/Lagos';
  const when = b ? formatAppointment(b.starts_at, tz) : null;
  const balance = b ? b.total_kobo - b.paid_kobo : 0;
  const whatsapp = b?.branches?.whatsapp ?? b?.branches?.phone;

  const calendar = async () => {
    if (!b) return;
    setCalendarBusy(true);
    try {
      await addToCalendar({
        title: `${b.service_name} · Infinity Luxury Spa`, startsAt: b.starts_at, endsAt: b.ends_at, timeZone: tz,
        location: b.branches ? `${b.branches.name}: ${b.branches.address_line}, ${b.branches.city}` : undefined, notes: `Reference ${b.reference}`,
      });
      toast.success('Added to your calendar.');
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setCalendarBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.scroll}>
        <Animated.View entering={ZoomIn.duration(400)} style={styles.badgeRing}>
          <View style={styles.badge}><Icon name="check" size={36} color={colors.black} strokeWidth={2.5} /></View>
        </Animated.View>
        <Text variant="h1" color={colors.white} align="center" accessibilityRole="header">
          {b?.status === 'pending' ? 'Confirming your payment…' : 'Your appointment is confirmed'}
        </Text>
        <Text variant="caption" color={colors.onDarkMuted} align="center">We have sent the details to your email</Text>

        {b && when ? (
          <View style={styles.card}>
            <Row label="Reference" value={b.reference} />
            <Row label="Treatment" value={b.service_name} />
            <Row label="Staff" value={b.staff?.full_name ?? 'To be assigned'} />
            <Row label="Branch" value={b.branches ? `${b.branches.name}${b.branches.area ? `, ${b.branches.area}` : ''}` : ''} />
            <Row label="Date" value={when.short} />
            <Row label="Paid" value={formatNaira(b.paid_kobo)} />
            {balance > 0 ? <Row label="Balance at branch" value={formatNaira(balance)} /> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button label="View Booking" variant="gold" onPress={() => router.replace({ pathname: '/booking/[id]', params: { id } })} />
        <Button label="Add to Calendar" variant="outline" loading={calendarBusy} onPress={() => void calendar()} style={styles.outline} />
        {offerReminders && session ? (
          <Button label="Turn on appointment reminders" variant="ghost" compact onPress={() => void registerForPush(session.user.id, true).then(() => setOfferReminders(false))} />
        ) : null}
        {whatsapp ? <Button label="Contact branch on WhatsApp" variant="ghost" compact onPress={() => void openWhatsApp(whatsapp, `Hello, about my booking ${b?.reference ?? ''}.`)} /> : null}
        <Button label="Done" variant="ghost" compact onPress={() => router.replace('/(tabs)')} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color={colors.onDarkMuted}>{label}</Text>
      <Text variant="bodyStrong" color={colors.white} align="right" style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  scroll: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.screenPadding, gap: 10 },
  badgeRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: 'rgba(166,137,23,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  badge: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  card: { alignSelf: 'stretch', backgroundColor: '#1A1A1A', borderRadius: radii.lg, padding: 18, gap: 12, marginTop: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  rowValue: { flex: 1 },
  footer: { paddingHorizontal: layout.screenPadding, paddingBottom: 12, gap: 8 },
  outline: { backgroundColor: 'transparent', borderColor: colors.white },
});
