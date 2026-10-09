import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Photo } from '@/components/ui/Photo';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { useProfile } from '@/features/account/hooks';
import { useRequireAuth } from '@/features/auth/hooks';
import { fetchReviews } from '@/features/catalog/api';
import { useBranches } from '@/features/catalog/hooks';
import { PriceBlock, ProductCard } from '@/features/store/components';
import { useAddToCart, useCartCount, useProduct, useProductRating, useRelatedProducts, useStockStatus, useToggleWishlist, useWishlist } from '@/features/store/hooks';
import { useQuery } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { useUi } from '@/stores/ui';
import { colors, layout, radii } from '@/theme';

type Tab = 'description' | 'how' | 'ingredients';

/** Screen 20: product details with variants, stock at the chosen branch, tabs and reviews. */
export default function ProductDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: product, isLoading, isError, error, refetch } = useProduct(slug);
  const rating = useProductRating(product?.id);
  const reviews = useQuery({ queryKey: ['catalog', 'reviews', 'product', product?.id], queryFn: () => fetchReviews({ productId: product!.id }, 5), enabled: !!product });
  const related = useRelatedProducts(product);
  const branches = useBranches();
  const profile = useProfile();
  const preferred = useUi((s) => s.preferredBranchId);
  const pushRecent = useUi((s) => s.pushRecent);
  const wishlist = useWishlist();
  const toggleWish = useToggleWishlist();
  const addToCart = useAddToCart();
  const cartCount = useCartCount();
  const requireAuth = useRequireAuth();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>('description');
  const [page, setPage] = useState(0);

  const branch = useMemo(() => {
    const list = branches.data ?? [];
    return list.find((b) => b.id === (profile.data?.preferred_branch_id ?? preferred)) ?? list.find((b) => b.is_main) ?? list[0] ?? null;
  }, [branches.data, profile.data?.preferred_branch_id, preferred]);
  const variants = useMemo(() => [...(product?.product_variants ?? [])].sort((a, b) => a.price_kobo - b.price_kobo), [product]);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const stock = useStockStatus(variants.map((v) => v.id), branch?.id);
  const inStock = variant ? stock.data?.[variant.id]?.inStock ?? false : false;
  const lowStock = variant ? stock.data?.[variant.id]?.lowStock ?? false : false;

  useEffect(() => {
    if (!product) return;
    track({ name: 'product_viewed', slug: product.slug });
    pushRecent({ kind: 'product', slug: product.slug, name: product.name });
  }, [product, pushRecent]);

  if (isLoading) return <Screen><View style={{ padding: layout.screenPadding, gap: 16 }}><Skeleton height={320} radius={radii.lg} /><Skeleton height={28} /><Skeleton height={80} /></View></Screen>;
  if (isError) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /></Screen>;
  if (!product || !variant) return <Screen><EmptyState icon="bag" title="Product not found" body="It may no longer be available." actionLabel="Back to the store" onAction={() => router.replace('/(tabs)/store')} /></Screen>;

  const images = [product.thumbnail_url, ...product.product_images.map((i) => i.url)].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
  const saved = !!wishlist.data?.some((w) => w.product?.id === product.id);
  const tabText = tab === 'description' ? product.description : tab === 'how' ? product.how_to_use : product.ingredients;

  const add = () =>
    addToCart.mutate({ variantId: variant.id, delta: qty }, {
      onSuccess: () => toast.success(`${qty > 1 ? `${qty} × ` : ''}${product.name} added to cart.`),
      onError: (e) => toast.error(toUserMessage(e)),
    });

  return (
    <Screen
      padded={false} edges={['left', 'right']}
      footer={
        <View style={styles.footer}>
          <Stepper value={qty} onChange={setQty} disabled={!inStock} />
          <Button label={inStock ? 'Add to Cart' : 'Out of stock'} disabled={!inStock} loading={addToCart.isPending} onPress={add} style={styles.flex} />
        </View>
      }
    >
      <View>
        {images.length > 0 ? (
          <FlatList
            horizontal pagingEnabled showsHorizontalScrollIndicator={false} data={images} keyExtractor={(u) => u}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <Photo uri={item} alt={product.name} style={{ width, height: 340 }} priority="high" />}
          />
        ) : <Photo fallbackIcon="drop" fallbackLabel="Product photo coming soon" style={{ width, height: 340 }} iconSize={36} />}
        <View style={[styles.overlay, { top: insets.top + 8 }]}>
          <IconButton icon="chevronLeft" label="Go back" tone="solid" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/store'))} />
          <View style={styles.overlayRight}>
            <IconButton icon="heart" label={saved ? 'Remove from wishlist' : 'Save to wishlist'} tone="solid" filled={saved} onPress={() => requireAuth(() => toggleWish.mutate({ productId: product.id }))} />
            <IconButton icon="bag" label={`Cart, ${cartCount} items`} tone="solid" badge={cartCount} onPress={() => router.push('/cart')} />
          </View>
        </View>
        {images.length > 1 ? <View style={styles.pager}>{images.map((u, i) => <View key={u} style={[styles.dot, i === page && styles.dotOn]} />)}</View> : null}
      </View>

      <View style={styles.sheet}>
        <View style={styles.metaRow}>
          <Text variant="eyebrow">{product.product_categories?.name ?? 'Skincare'}</Text>
          {branch && stock.data ? <Badge label={inStock ? (lowStock ? `Low stock in ${branch.name}` : `In stock in ${branch.name}`) : `Out of stock in ${branch.name}`} tone={inStock ? 'success' : 'error'} dot /> : null}
        </View>
        <Text variant="h1" accessibilityRole="header">{product.name}</Text>
        <View style={styles.ratingRow}>
          <Rating average={rating.data?.average} count={rating.data?.count} />
          <Text variant="caption">{variant.name}</Text>
        </View>
        <PriceBlock variant={variant} size="lg" />
        {variants.length > 1 ? (
          <View style={styles.chips}>{variants.map((v) => <Chip key={v.id} label={v.name} selected={v.id === variant.id} onPress={() => setVariantId(v.id)} />)}</View>
        ) : null}

        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'description', label: 'Description' }, { value: 'how', label: 'How to use' }, { value: 'ingredients', label: 'Ingredients' }]} />
        <Text variant="body">{tabText || 'Details for this product will be added soon.'}</Text>

        {(reviews.data?.length ?? 0) > 0 ? (
          <View style={styles.block}>
            <SectionHeader title="Reviews" />
            {reviews.data?.map((r) => (
              <View key={r.id} style={styles.review}>
                <View style={styles.reviewHead}><Text variant="bodyStrong">{r.reviewer_name ?? 'Customer'}</Text><Rating average={r.rating} count={1} size={11} /></View>
                {r.body ? <Text variant="body">{r.body}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {(related.data?.length ?? 0) > 0 ? (
          <View style={styles.block}>
            <SectionHeader title="You may also like" />
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={related.data} keyExtractor={(p) => p.id} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => (
                <ProductCard product={item} width={164} onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
                  onAdd={() => { const v = item.product_variants[0]; if (v) addToCart.mutate({ variantId: v.id, delta: 1 }, { onSuccess: () => toast.success('Added to cart.') }); }}
                  onWish={() => requireAuth(() => toggleWish.mutate({ productId: item.id }))} />
              )}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overlay: { position: 'absolute', left: layout.screenPadding, right: layout.screenPadding, flexDirection: 'row', justifyContent: 'space-between' },
  overlayRight: { flexDirection: 'row', gap: 10 },
  pager: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotOn: { width: 20, backgroundColor: colors.white },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.white, padding: layout.screenPadding, gap: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  block: { gap: 12, marginTop: 8 },
  review: { gap: 6, paddingVertical: 6 },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
