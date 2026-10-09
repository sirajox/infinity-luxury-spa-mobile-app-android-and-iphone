import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Card, PressableCard } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Photo } from '@/components/ui/Photo';
import { Text } from '@/components/ui/Text';
import { formatInZone } from '@infinity/core';
import { formatNaira } from '@/lib/format';
import { orderStatusLabel, type OrderHistoryRow, type OrderRow, type OrderStatus, ORDER_STEPS, PICKUP_STEPS } from './api';

function tone(status: OrderStatus): 'success' | 'gold' | 'neutral' | 'error' {
  if (status === 'delivered') return 'success';
  if (status === 'cancelled' || status === 'refunded') return 'error';
  if (status === 'placed') return 'gold';
  return 'gold';
}

export function OrderCard({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  const items = order.order_items.reduce((n, i) => n + i.quantity, 0);
  const first = order.order_items[0];
  return (
    <PressableCard onPress={onPress} label={`Order ${order.number}, ${orderStatusLabel(order.status)}`} style={styles.card}>
      <Photo uri={first?.image_snapshot} fallbackIcon="package" style={styles.thumb} iconSize={22} />
      <View style={styles.flex}>
        <Text variant="title">{order.number}</Text>
        <Text variant="caption" numberOfLines={1}>{first?.name_snapshot}{order.order_items.length > 1 ? ` +${order.order_items.length - 1} more` : ''}</Text>
        <View style={styles.row}>
          <Badge label={orderStatusLabel(order.status)} tone={tone(order.status)} dot />
          <Text variant="price">{formatNaira(order.total_kobo)}</Text>
        </View>
        <Text variant="caption">{items} item{items === 1 ? '' : 's'} · {formatInZone(order.created_at, 'Africa/Lagos', { day: 'numeric', month: 'short' })}</Text>
      </View>
    </PressableCard>
  );
}

/** Vertical timeline (design 24). Completed steps are filled; the current step is ringed in gold. */
export function OrderTimeline({ order, history }: { order: OrderRow; history: OrderHistoryRow[] }) {
  const steps = order.fulfilment === 'pickup' ? PICKUP_STEPS : ORDER_STEPS;
  const reached = new Map(history.map((h) => [h.to_status, h]));
  const currentIndex = steps.reduce((idx, s, i) => (reached.has(s.status) ? i : idx), -1);
  const terminal = order.status === 'cancelled' || order.status === 'refunded';
  return (
    <Card style={styles.timeline}>
      {steps.map((step, i) => {
        const hit = reached.get(step.status);
        const done = !!hit && i < currentIndex;
        const current = i === currentIndex && !terminal;
        return (
          <View key={step.status} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.node, done && styles.nodeDone, current && styles.nodeCurrent]}>
                {done ? <Icon name="check" size={12} color={colors.gold} strokeWidth={2.5} /> : current ? <View style={styles.nodeInner} /> : null}
              </View>
              {i < steps.length - 1 ? <View style={[styles.line, done && styles.lineDone]} /> : null}
            </View>
            <View style={styles.stepText}>
              <Text variant="bodyStrong" color={hit ? colors.black : colors.grey400}>{step.title}</Text>
              {hit ? (
                <Text variant="caption">{formatInZone(hit.created_at, 'Africa/Lagos', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
              ) : null}
              {hit?.note ? <Text variant="caption">{hit.note}</Text> : null}
            </View>
          </View>
        );
      })}
      {terminal ? (
        <View style={styles.step}>
          <View style={styles.rail}><View style={[styles.node, { borderColor: colors.error, backgroundColor: colors.error }]} /></View>
          <View style={styles.stepText}><Text variant="bodyStrong" color={colors.error}>{orderStatusLabel(order.status)}</Text></View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flexDirection: 'row', padding: 12, gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  timeline: { padding: 18 },
  step: { flexDirection: 'row', gap: 14, minHeight: 54 },
  rail: { alignItems: 'center', width: 22 },
  node: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.grey200, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  nodeDone: { backgroundColor: colors.black, borderColor: colors.black },
  nodeCurrent: { borderColor: colors.gold },
  nodeInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  line: { flex: 1, width: 1.5, backgroundColor: colors.grey200, marginVertical: 2 },
  lineDone: { backgroundColor: colors.black },
  stepText: { flex: 1, paddingBottom: 14, gap: 1 },
});
