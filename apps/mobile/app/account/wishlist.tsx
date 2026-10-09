import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Photo } from '@/components/ui/Photo';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { cheapestVariant } from '@/features/store/api';
import { useToggleWishlist, useWishlist } from '@/features/store/hooks';
import { toUserMessage } from '@/lib/errors';
import { formatNaira, formatPrice } from '@/lib/format';

export default function Wishlist() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useWishlist();
  const toggle = useToggleWishlist();
  return (
    <Screen header={<ScreenHeader title="Wishlist" subtitle="Treatments and products you have saved" />} contentStyle={styles.gap}>
      {isLoading ? <SkeletonList rows={3} height={88} /> : isError ? <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="heart" title="Nothing saved yet" body="Tap the heart on any treatment or product to save it here." actionLabel="Browse the store" onAction={() => router.navigate('/(tabs)/store')} />
      ) : data?.map((w) => {
        const p = w.product;
        const s = w.service;
        const v = p ? cheapestVariant(p) : undefined;
        const title = p?.name ?? s?.name ?? '';
        const image = p?.thumbnail_url ?? s?.thumbnail_url ?? null;
        return (
          <Card key={w.id} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={title} style={styles.main}
              onPress={() => (p ? router.push({ pathname: '/product/[slug]', params: { slug: p.slug } }) : s && router.push({ pathname: '/treatment/[slug]', params: { slug: s.slug } }))}>
              <Photo uri={image} fallbackIcon={p ? 'drop' : 'sparkle'} style={styles.thumb} iconSize={20} />
              <View style={styles.flex}>
                <Text variant="title" numberOfLines={2}>{title}</Text>
                <Text variant="price">{v ? formatNaira(v.price_kobo) : s ? formatPrice(s.price_type, s.price_kobo) : ''}</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${title} from wishlist`} hitSlop={12} onPress={() => toggle.mutate(p ? { productId: p.id } : { serviceId: s?.id })}>
              <Icon name="heart" size={20} color={colors.gold} filled />
            </Pressable>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
});
