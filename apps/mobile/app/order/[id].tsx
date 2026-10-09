import { formatInZone } from '@infinity/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useCancelOrder, useOrder } from '@/features/orders/hooks';
import { OrderTimeline } from '@/features/orders/components';
import { toUserMessage } from '@/lib/errors';
import { formatNaira } from '@/lib/format';
import { openWhatsApp, callPhone } from '@/lib/links';
import { toast } from '@/stores/toast';
import { colors, radii } from '@/theme';

/** Screen 24: order tracking. Refreshes every 30 seconds while open. */
export default function OrderDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useOrder(id);
  const cancel = useCancelOrder();

  if (isLoading) return <Screen><SkeletonList rows={3} height={140} /></Screen>;
  if (isError) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /></Screen>;
  if (!data) return <Screen><EmptyState icon="package" title="Order not found" actionLabel="My orders" onAction={() => router.replace('/(tabs)/orders')} /></Screen>;

  const { order, history } = data;
  const items = order.order_items.reduce((n, i) => n + i.quantity, 0);
  const unpaid = order.status === 'placed' && !order.paid_at;
  const addr = order.shipping_address;
  const branch = order.branches;
  const contact = branch?.whatsapp ?? branch?.phone;

  return (
    <Screen
      header={<ScreenHeader title={`Order ${order.number}`} subtitle={`Placed ${formatInZone(order.created_at, 'Africa/Lagos', { weekday: 'short', day: 'numeric', month: 'short' })}, ${items} item${items === 1 ? '' : 's'}, ${formatNaira(order.total_kobo)}`} />}
      footer={contact ? <Button label={`Contact ${branch?.name} Branch`} variant="outline" icon="chat" onPress={() => void openWhatsApp(contact, `Hello, about my order ${order.number}.`)} /> : branch?.phone ? <Button label={`Call ${branch.name} Branch`} variant="outline" icon="phone" onPress={() => void callPhone(branch.phone as string)} /> : undefined}
      contentStyle={styles.gap}
    >
      {unpaid ? (
        <Card style={styles.unpaid}>
          <Text variant="title">Payment not completed</Text>
          <Text variant="caption">Your items are reserved for a short time. Complete payment to place your order.</Text>
          <View style={styles.row}>
            <Button label="Pay now" compact style={styles.flex} onPress={() => router.push({ pathname: '/pay/[purpose]/[id]', params: { purpose: 'order', id: order.id } })} />
            <Button label="Cancel order" variant="outline" compact style={styles.flex} loading={cancel.isPending} onPress={() => cancel.mutate(order.id, { onSuccess: () => toast.success('Order cancelled.'), onError: (e) => toast.error(toUserMessage(e)) })} />
          </View>
        </Card>
      ) : null}

      <OrderTimeline order={order} history={history} />

      <Card style={styles.delivery}>
        <View style={styles.truck}><Icon name={order.fulfilment === 'pickup' ? 'pin' : 'truck'} size={20} color={colors.goldText} /></View>
        <View style={styles.flex}>
          <Text variant="title">{order.fulfilment === 'pickup' ? `Pickup at ${branch?.name ?? 'branch'}` : `Delivering to ${addr?.address ?? ''}`}</Text>
          {order.tracking_number ? <Text variant="caption">Tracking number {order.tracking_number}{order.carrier ? ` · ${order.carrier}` : ''}</Text> : <Text variant="caption">{order.fulfilment === 'pickup' ? 'We will notify you when it is ready.' : 'A tracking number appears once your order ships.'}</Text>}
        </View>
      </Card>

      <Card style={styles.items}>
        {order.order_items.map((i) => (
          <View key={i.id} style={styles.item}>
            <Text variant="body" color={colors.black} style={styles.flex}>{i.quantity} × {i.name_snapshot} <Text variant="caption">{i.variant_snapshot}</Text></Text>
            <Text variant="bodyStrong">{formatNaira(i.line_total_kobo)}</Text>
          </View>
        ))}
        {order.discount_kobo > 0 ? <View style={styles.item}><Text variant="caption" style={styles.flex}>Discount</Text><Text variant="bodyStrong">-{formatNaira(order.discount_kobo)}</Text></View> : null}
        {order.delivery_fee_kobo > 0 ? <View style={styles.item}><Text variant="caption" style={styles.flex}>Delivery</Text><Text variant="bodyStrong">{formatNaira(order.delivery_fee_kobo)}</Text></View> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  unpaid: { padding: 16, gap: 10, backgroundColor: colors.goldSoft, borderColor: colors.goldSoft },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  truck: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  items: { padding: 16, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
