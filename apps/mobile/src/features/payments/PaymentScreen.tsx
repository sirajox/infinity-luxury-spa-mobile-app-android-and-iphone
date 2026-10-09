import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Button } from '@/components/ui/Button';
import { PressableCard } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { RadioMark } from '@/features/catalog/components';
import { toUserMessage } from '@/lib/errors';
import { formatNaira } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import type { PaymentOutcome, PaymentPurpose, Provider } from './api';
import { useCheckout, useEnabledProviders, useRecheckPayment } from './hooks';

const PROVIDER_COPY: Record<Provider, { name: string; blurb: string }> = {
  paystack: { name: 'Paystack', blurb: 'Card, bank transfer or USSD' },
  flutterwave: { name: 'Flutterwave', blurb: 'Card, bank transfer or USSD' },
};

/**
 * Shared payment step (design 16) for bookings, balances, orders and memberships. The amount comes from the
 * server-created record, and the outcome from the backend's verification with the provider.
 */
export function PaymentScreen({ title, purpose, targetId, amountKobo, summaryLabel, summaryTop, heldUntilSeconds, onPaid, onExpired }: {
  title: string;
  purpose: PaymentPurpose;
  targetId: string;
  amountKobo: number;
  /** e.g. "Advance to pay now" */
  summaryTop: string;
  summaryLabel: string;
  /** Seconds left on a slot/stock hold; null when the thing being paid for has no hold. */
  heldUntilSeconds: number | null;
  onPaid: () => void;
  onExpired: () => void;
}) {
  const providers = useEnabledProviders();
  const checkout = useCheckout();
  const recheck = useRecheckPayment();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [pendingRef, setPendingRef] = useState<string | null>(null);

  const selected = provider ?? providers.data?.[0] ?? null;
  const expired = heldUntilSeconds !== null && heldUntilSeconds <= 0;

  const handleOutcome = (ref: string, outcome: PaymentOutcome | 'cancelled') => {
    if (outcome === 'succeeded') { haptics.success(); onPaid(); return; }
    if (outcome === 'pending') { setPendingRef(ref); return; }
    haptics.error();
    toast.error(outcome === 'cancelled' ? 'Payment was not completed. You can try again.' : 'The payment did not go through. You have not been charged.');
  };

  const pay = () => {
    if (!selected) return;
    setPendingRef(null);
    checkout.mutate({ purpose, targetId, provider: selected }, {
      onSuccess: (r) => handleOutcome(r.reference, r.outcome),
      onError: (e) => toast.error(toUserMessage(e)),
    });
  };

  const checkAgain = () => {
    if (!pendingRef) return;
    recheck.mutate(pendingRef, { onSuccess: (o) => handleOutcome(pendingRef, o), onError: (e) => toast.error(toUserMessage(e)) });
  };

  return (
    <Screen
      header={<ScreenHeader title={title} />}
      footer={
        expired ? (
          <Button label="Start again" onPress={onExpired} />
        ) : pendingRef ? (
          <Button label="Check payment status" variant="outline" loading={recheck.isPending} onPress={checkAgain} />
        ) : (
          <Button label={`Pay ${formatNaira(amountKobo)}`} loading={checkout.isPending} disabled={!selected} onPress={pay} accessibilityHint="Opens the secure payment page" />
        )
      }
      contentStyle={styles.gap}
    >
      <View style={styles.summary}>
        <Text variant="caption" color={colors.onDarkMuted}>{summaryTop}</Text>
        <Text style={styles.amount} accessibilityLabel={formatNaira(amountKobo)}>{formatNaira(amountKobo)}</Text>
        <Text variant="body" color={colors.white}>{summaryLabel}</Text>
        {heldUntilSeconds !== null ? (
          <View style={styles.hold}>
            <Icon name="clock" size={14} color={colors.gold} />
            <Text variant="caption" color={colors.onDarkMuted}>
              {expired ? 'Your reserved time has expired' : 'Your slot is held for '}
              {expired ? null : <Text variant="label" color={colors.white}>{`${Math.floor(heldUntilSeconds / 60).toString().padStart(2, '0')}:${(heldUntilSeconds % 60).toString().padStart(2, '0')}`}</Text>}
            </Text>
          </View>
        ) : null}
      </View>

      {pendingRef ? (
        <View style={styles.pending} accessibilityRole="alert">
          <Icon name="clock" size={18} color={colors.goldText} />
          <Text variant="caption" style={styles.flex}>We are still waiting for confirmation from your bank. Do not pay again. Check the status in a moment.</Text>
        </View>
      ) : null}

      <Text variant="title">Payment method</Text>
      {providers.isLoading ? <SkeletonList rows={2} height={72} /> : providers.isError ? (
        <ErrorState message={toUserMessage(providers.error)} onRetry={() => void providers.refetch()} />
      ) : (
        <View style={styles.gap}>
          {providers.data?.map((p) => (
            <PressableCard key={p} onPress={() => setProvider(p)} selected={selected === p} label={`${PROVIDER_COPY[p].name}. ${PROVIDER_COPY[p].blurb}`} style={styles.method}>
              <View style={styles.methodIcon}><Icon name="card" size={20} color={colors.black} /></View>
              <View style={styles.flex}>
                <Text variant="title">{PROVIDER_COPY[p].name}</Text>
                <Text variant="caption">{PROVIDER_COPY[p].blurb}</Text>
              </View>
              <RadioMark selected={selected === p} />
            </PressableCard>
          ))}
        </View>
      )}

      <View style={styles.secure}>
        <Icon name="shield" size={16} color={colors.success} />
        <Text variant="caption" style={styles.flex}>
          Payments are processed securely by {selected ? PROVIDER_COPY[selected].name : 'our payment partner'}. We never store your card details.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 14 },
  summary: { backgroundColor: colors.black, borderRadius: radii.xl, padding: 20, gap: 6 },
  amount: { fontFamily: 'Lora_500Medium', fontSize: 40, lineHeight: 48, color: colors.gold },
  hold: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.onDarkFaint },
  pending: { flexDirection: 'row', gap: 10, backgroundColor: colors.goldSoft, borderRadius: radii.lg, padding: 14, alignItems: 'center' },
  method: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  methodIcon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.grey50, alignItems: 'center', justifyContent: 'center' },
  secure: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.grey50, borderRadius: radii.lg, padding: 14 },
});
