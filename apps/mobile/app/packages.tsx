import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Photo } from '@/components/ui/Photo';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { startPackagePurchase } from '@/features/account/api';
import { usePackages } from '@/features/account/hooks';
import { useRequireAuth } from '@/features/auth/hooks';
import { toUserMessage } from '@/lib/errors';
import { formatNaira } from '@/lib/format';
import { toast } from '@/stores/toast';

/** Bridal, mom & daughter, couples and custom packages, all configured in the admin dashboard. */
export default function Packages() {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const { data, isLoading, isError, error, refetch } = usePackages();
  const [busy, setBusy] = useState<string | null>(null);

  const buy = (id: string) =>
    requireAuth(() => {
      setBusy(id);
      startPackagePurchase(id)
        .then((p) => router.push({ pathname: '/pay/[purpose]/[id]', params: { purpose: 'package', id: p.id } }))
        .catch((e) => toast.error(toUserMessage(e)))
        .finally(() => setBusy(null));
    });

  return (
    <Screen header={<ScreenHeader title="Packages" subtitle="Curated bundles for special occasions" />} contentStyle={styles.gap}>
      {isLoading ? <SkeletonList rows={3} height={200} /> : isError ? <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="lotus" title="Packages are coming soon" body="Bridal, mom & daughter and couples packages will appear here." />
      ) : data?.map((p) => (
        <Card key={p.id} style={styles.card}>
          <Photo uri={p.image_url} fallbackIcon="lotus" style={styles.image} iconSize={30} />
          <View style={styles.body}>
            <View style={styles.row}>
              <Text variant="h3" style={styles.flex}>{p.name}</Text>
              {p.original_price_kobo && p.original_price_kobo > p.price_kobo ? <Badge label={`Save ${formatNaira(p.original_price_kobo - p.price_kobo)}`} tone="dark" /> : null}
            </View>
            {p.description ? <Text variant="body">{p.description}</Text> : null}
            <View style={styles.row}>
              <Text variant="h2" color={colors.goldText}>{formatNaira(p.price_kobo)}</Text>
              {p.original_price_kobo && p.original_price_kobo > p.price_kobo ? <Text variant="caption" style={styles.strike}>{formatNaira(p.original_price_kobo)}</Text> : null}
            </View>
            {p.validity_days ? <Text variant="caption">Valid for {p.validity_days} days</Text> : null}
            {p.terms ? <Text variant="caption">{p.terms}</Text> : null}
            <Button label="Buy package" loading={busy === p.id} onPress={() => buy(p.id)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 14 },
  card: { overflow: 'hidden' },
  image: { height: 150, width: '100%' },
  body: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  strike: { textDecorationLine: 'line-through' },
});
