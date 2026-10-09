import { formatInZone } from '@infinity/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useProfile } from '@/features/account/hooks';
import { useOrder } from '@/features/orders/hooks';
import { formatNaira } from '@/lib/format';
import { colors, layout, radii } from '@/theme';

/** Screen 23: order confirmed (only reachable after verified payment). */
export default function OrderConfirmed() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refetch } = useOrder(id);
  const profile = useProfile();
  const order = data?.order;
  const first = profile.data?.full_name?.split(' ')[0];

  useEffect(() => {
    if (order && order.status === 'placed') {
      const t = setInterval(() => void refetch(), 3000);
      return () => clearInterval(t);
    }
  }, [order, refetch]);

  const items = order?.order_items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  const where = order?.fulfilment === 'pickup' ? `Pickup at ${order.branches?.name ?? 'branch'}` : [order?.shipping_address?.address, order?.shipping_address?.city].filter(Boolean).join(', ');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Animated.View entering={ZoomIn.duration(400)} style={styles.ring}>
          <View style={styles.badge}><Icon name="check" size={34} color={colors.gold} strokeWidth={2.5} /></View>
        </Animated.View>
        <Text variant="h1" align="center" accessibilityRole="header">{order?.status === 'placed' ? 'Confirming your payment…' : 'Order confirmed'}</Text>
        <Text variant="body" align="center">
          {order?.fulfilment === 'pickup'
            ? `Thank you${first ? `, ${first}` : ''}. Your order is being prepared at our ${order.branches?.name ?? ''} branch.`
            : `Thank you${first ? `, ${first}` : ''}. Your order is being prepared${order?.branches ? ` at our ${order.branches.name} branch` : ''}.`}
        </Text>
        {order ? (
          <View style={styles.card}>
            <Row label="Order number" value={order.number} />
            <Row label="Items" value={String(items)} />
            <Row label="Total paid" value={formatNaira(order.status === 'placed' ? 0 : order.total_kobo)} />
            <Row label={order.fulfilment === 'pickup' ? 'Collect from' : 'Delivering to'} value={where || '—'} />
            {order.estimated_delivery ? <Row label="Estimated delivery" value={formatInZone(`${order.estimated_delivery}T12:00:00Z`, 'Africa/Lagos', { weekday: 'short', day: 'numeric', month: 'short' })} /> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button label="Track Order" onPress={() => router.replace({ pathname: '/order/[id]', params: { id } })} />
        <Button label="Continue Shopping" variant="outline" onPress={() => router.replace('/(tabs)/store')} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption">{label}</Text>
      <Text variant="bodyStrong" align="right" style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.screenPadding, gap: 12 },
  ring: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  badge: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  card: { alignSelf: 'stretch', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.grey200, padding: 18, gap: 12, marginTop: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  rowValue: { flex: 1 },
  footer: { paddingHorizontal: layout.screenPadding, paddingBottom: 12, gap: 10 },
});
