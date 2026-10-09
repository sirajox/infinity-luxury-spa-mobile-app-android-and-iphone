import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useSession } from '@/features/auth/store';
import { OrderCard } from '@/features/orders/components';
import { useOrders } from '@/features/orders/hooks';
import { toUserMessage } from '@/lib/errors';
import { colors, layout } from '@/theme';

export default function Orders() {
  const router = useRouter();
  const session = useSession();
  const query = useOrders();
  return (
    <Screen scroll={false} padded={false} header={<ScreenHeader noBack title="My orders" subtitle="Track your skin care orders" />}>
      {!session ? (
        <SignInPrompt icon="package" title="Track your orders" body="Sign in to see your orders and follow them from payment to delivery." />
      ) : query.isLoading ? <View style={styles.pad}><SkeletonList rows={3} height={110} /></View> : query.isError ? (
        <ErrorState message={toUserMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          data={query.data} keyExtractor={(o) => o.id} contentContainerStyle={styles.pad}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.gold} />}
          renderItem={({ item }) => <OrderCard order={item} onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })} />}
          ListEmptyComponent={<EmptyState icon="package" title="No orders yet" body="When you shop skin care, your orders appear here." actionLabel="Shop Skin Care" onAction={() => router.navigate('/(tabs)/store')} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ pad: { paddingHorizontal: layout.screenPadding, paddingBottom: 32 } });
