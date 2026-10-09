import { splitBookingPayment, type PaymentOption } from '@infinity/core';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card, PressableCard } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Photo } from '@/components/ui/Photo';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSetting } from '@/features/account/hooks';
import { useSession } from '@/features/auth/store';
import { useCreateBooking } from '@/features/booking/hooks';
import { useDraftGuard } from '@/features/booking/useDraftGuard';
import { toUserMessage } from '@/lib/errors';
import { formatClock, formatDayHeading, formatDuration, formatNaira } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import { useBookingDraft } from '@/stores/bookingDraft';

/** Screen 15: review the booking and choose full or advance payment. Amounts shown here are previews; the server decides. */
export default function ReviewBooking() {
  const router = useRouter();
  const session = useSession();
  const { draft, ready } = useDraftGuard('slot');
  const setPaymentOption = useBookingDraft((s) => s.setPaymentOption);
  const advanceBps = useSetting<number>('booking.advance_bps', 3333);
  const create = useCreateBooking();

  // Booking needs an identifiable customer. The draft survives the detour through sign-in.
  useEffect(() => {
    if (ready && !session) router.replace({ pathname: '/(auth)/sign-in', params: { next: '/booking/review' } });
  }, [ready, session, router]);

  if (!ready || !session || !draft.service || !draft.branch || !draft.date || !draft.time) return null;

  const total = draft.service.priceKobo;
  const full = splitBookingPayment(total, 'full', Number(advanceBps.data ?? 3333));
  const advance = splitBookingPayment(total, 'advance', Number(advanceBps.data ?? 3333));
  const chosen = draft.paymentOption === 'full' ? full : advance;
  const startingPrice = draft.service.priceType === 'from';

  const submit = () => {
    create.mutate(
      { serviceId: draft.service!.id, branchId: draft.branch!.id, staffId: draft.staff?.id ?? null, date: draft.date!, time: draft.time!, paymentOption: draft.paymentOption },
      {
        onSuccess: (booking) => { haptics.success(); router.push({ pathname: '/booking/payment', params: { bookingId: booking.id, purpose: 'booking' } }); },
        onError: (e) => {
          haptics.error();
          toast.error(toUserMessage(e));
          // A lost race or lapsed slot means the picker needs a fresh look.
          if (/slot_unavailable/.test(String(e.message))) router.replace('/booking/datetime');
        },
      },
    );
  };

  return (
    <Screen
      header={<ScreenHeader title="Review booking" subtitle="Check the details before you pay" />}
      footer={<Button label="Continue to Payment" loading={create.isPending} onPress={submit} accessibilityHint="Reserves your time slot for a few minutes while you pay" />}
      contentStyle={styles.gap}
    >
      <Card style={styles.summary}>
        <View style={styles.summaryTop}>
          <Photo uri={draft.service.thumbnailUrl} fallbackIcon="stones" style={styles.thumb} iconSize={22} />
          <View style={styles.flex}>
            <Text variant="title">{draft.service.name}</Text>
            <Text variant="caption">with {draft.staff?.fullName ?? 'any available staff'}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <Line icon="calendar" text={formatDayHeading(draft.date)} />
        <Line icon="clock" text={`${formatClock(`${draft.time}:00`)}, ${formatDuration(draft.service.durationMinutes)}`} />
        <Line icon="pin" text={`${draft.branch.name} branch${draft.branch.area ? `, ${draft.branch.area}` : ''}`} />
      </Card>

      <Text variant="title">How would you like to pay?</Text>
      <View style={styles.options}>
        <PayOption selected={draft.paymentOption === 'full'} onPress={() => setPaymentOption('full')} title="Pay in full" amount={formatNaira(full.payNow)} note="Nothing to pay later" />
        <PayOption selected={draft.paymentOption === 'advance'} onPress={() => setPaymentOption('advance')} title="Pay advance" amount={formatNaira(advance.payNow)} note={`${formatNaira(advance.balance)} at the branch`} />
      </View>

      <View style={styles.totals}>
        <Row label="Treatment" value={formatNaira(total)} />
        <Row label="Balance at branch" value={formatNaira(chosen.balance)} />
        <View style={styles.divider} />
        <Row label="Pay now" value={formatNaira(chosen.payNow)} strong />
      </View>
      {startingPrice ? <Text variant="caption">This is a starting price. Your therapist confirms the final price at the branch.</Text> : null}
    </Screen>
  );
}

function Line({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}><Icon name={icon} size={16} color={colors.goldText} /></View>
      <Text variant="body" color={colors.black}>{text}</Text>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'title' : 'body'}>{label}</Text>
      <Text variant={strong ? 'h3' : 'bodyStrong'}>{value}</Text>
    </View>
  );
}

function PayOption({ selected, onPress, title, amount, note }: { selected: boolean; onPress: () => void; title: string; amount: string; note: string }) {
  return (
    <PressableCard onPress={onPress} selected={selected} label={`${title}, ${amount}, ${note}`} style={[styles.option, selected && styles.optionOn]}>
      <View style={styles.optionHead}>
        <Text variant="label">{title}</Text>
        <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      </View>
      <Text variant="h3" color={colors.goldText}>{amount}</Text>
      <Text variant="caption">{note}</Text>
    </PressableCard>
  );
}

export type { PaymentOption };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 16, paddingTop: 4 },
  summary: { padding: 16, gap: 12 },
  summaryTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radii.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.grey200 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  options: { flexDirection: 'row', gap: 12 },
  option: { flex: 1, padding: 14, gap: 6 },
  optionOn: { backgroundColor: colors.warm, borderColor: colors.gold },
  optionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.grey200, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.gold },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  totals: { gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
