import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { fetchPurchase } from '@/features/account/api';
import { useOrder } from '@/features/orders/hooks';
import { PaymentScreen } from '@/features/payments/PaymentScreen';
import { track } from '@/lib/analytics';
import { toUserMessage } from '@/lib/errors';
import { useCountdown } from '@/lib/useCountdown';
import { toast } from '@/stores/toast';

type Purpose = 'order' | 'membership' | 'package';

/** Payment step for orders, memberships and packages. Amounts come from the server-created record. */
export default function PayScreen() {
  const router = useRouter();
  const { purpose, id } = useLocalSearchParams<{ purpose: Purpose; id: string }>();
  const order = useOrder(purpose === 'order' ? id : undefined);
  const purchase = useQuery({
    queryKey: ['memberships', 'purchase', purpose, id],
    queryFn: () => fetchPurchase(purpose as 'membership' | 'package', id),
    enabled: purpose === 'membership' || purpose === 'package',
  });
  const seconds = useCountdown(order.data?.order.reservation_expires_at);

  const loading = order.isLoading || purchase.isLoading;
  const error = order.error ?? purchase.error;
  if (loading) return <Screen><SkeletonList rows={3} height={120} /></Screen>;
  if (error) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => { void order.refetch(); void purchase.refetch(); }} /></Screen>;

  if (purpose === 'order') {
    const o = order.data?.order;
    if (!o) return <Screen><EmptyState icon="package" title="Order not found" actionLabel="My orders" onAction={() => router.replace('/(tabs)/orders')} /></Screen>;
    return (
      <PaymentScreen
        title="Payment" purpose="order" targetId={o.id} amountKobo={o.total_kobo} summaryTop="Order total" summaryLabel={`Order ${o.number}`}
        heldUntilSeconds={o.status === 'placed' ? seconds : null}
        onPaid={() => { track({ name: 'payment_completed', purpose: 'order' }); track({ name: 'product_purchased', itemCount: o.order_items.reduce((n, i) => n + i.quantity, 0) }); router.replace({ pathname: '/order-confirmed/[id]', params: { id: o.id } }); }}
        onExpired={() => router.replace('/cart')}
      />
    );
  }

  const p = purchase.data;
  if (!p) return <Screen><EmptyState icon="card" title="Purchase not found" actionLabel="Go home" onAction={() => router.replace('/(tabs)')} /></Screen>;
  return (
    <PaymentScreen
      title="Payment" purpose={purpose === 'membership' ? 'membership' : 'package'} targetId={p.id} amountKobo={p.price_kobo} summaryTop="Amount to pay now" summaryLabel={p.name}
      heldUntilSeconds={null}
      onPaid={() => {
        track({ name: 'payment_completed', purpose: purpose });
        if (purpose === 'membership') track({ name: 'membership_purchased', plan: p.name });
        toast.success(`${p.name} purchased. Thank you.`);
        router.replace('/(tabs)/profile');
      }}
      onExpired={() => router.replace('/(tabs)')}
    />
  );
}
