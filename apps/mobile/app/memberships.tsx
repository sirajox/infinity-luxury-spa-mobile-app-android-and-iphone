import { formatInZone } from '@infinity/core';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { startMembershipPurchase } from '@/features/account/api';
import { useMyMemberships, usePlans } from '@/features/account/hooks';
import { useRequireAuth } from '@/features/auth/hooks';
import { toUserMessage } from '@/lib/errors';
import { formatNaira } from '@/lib/format';
import { toast } from '@/stores/toast';
import { useState } from 'react';

/** Only plans the business has published are listed; prices come from the database, never from the app. */
export default function Memberships() {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const plans = usePlans();
  const mine = useMyMemberships();
  const [busy, setBusy] = useState<string | null>(null);
  const active = mine.data?.filter((m) => m.status === 'active') ?? [];

  const buy = (planId: string) =>
    requireAuth(() => {
      setBusy(planId);
      startMembershipPurchase(planId)
        .then((m) => router.push({ pathname: '/pay/[purpose]/[id]', params: { purpose: 'membership', id: m.id } }))
        .catch((e) => toast.error(toUserMessage(e)))
        .finally(() => setBusy(null));
    });

  return (
    <Screen header={<ScreenHeader title="Membership" subtitle="Exclusive benefits across all branches" />} contentStyle={styles.gap}>
      {active.map((m) => (
        <Card key={m.id} style={styles.current}>
          <Badge label="Active" tone="success" dot />
          <Text variant="h3" color={colors.white}>{m.plan_snapshot.name ?? 'Membership'}</Text>
          {m.expires_at ? <Text variant="caption" color={colors.onDarkMuted}>Valid until {formatInZone(m.expires_at, 'Africa/Lagos', { day: 'numeric', month: 'long', year: 'numeric' })}</Text> : null}
        </Card>
      ))}
      {plans.isLoading ? <SkeletonList rows={3} height={150} /> : plans.isError ? <ErrorState message={toUserMessage(plans.error)} onRetry={() => void plans.refetch()} /> : (plans.data?.length ?? 0) === 0 ? (
        <EmptyState icon="sparkle" title="Memberships are coming soon" body="Our membership plans will be announced shortly." />
      ) : plans.data?.map((p) => (
        <Card key={p.id} style={styles.plan}>
          <Text variant="h3">{p.name}</Text>
          <Text variant="h2" color={colors.goldText}>{formatNaira(p.price_kobo)}</Text>
          <Text variant="caption">{p.duration_days} days</Text>
          {p.description ? <Text variant="body">{p.description}</Text> : null}
          {p.benefits.map((b) => (
            <View key={b} style={styles.benefit}><Icon name="check" size={16} color={colors.gold} /><Text variant="body" style={styles.flex}>{b}</Text></View>
          ))}
          <Button label={`Choose ${p.name.replace(/ Membership$/, '')}`} loading={busy === p.id} onPress={() => buy(p.id)} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 14 },
  current: { backgroundColor: colors.black, borderColor: colors.black, padding: 18, gap: 8, borderRadius: radii.xl },
  plan: { padding: 18, gap: 8 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
