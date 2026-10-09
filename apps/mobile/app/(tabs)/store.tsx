import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useBanners } from '@/features/account/hooks';
import { useRequireAuth } from '@/features/auth/hooks';
import { PromoBanner } from '@/features/home/components';
import type { ProductSummary } from '@/features/store/api';
import { ProductCard } from '@/features/store/components';
import { useAddToCart, useCartCount, useProductCategories, useProducts, useToggleWishlist, useWishlist } from '@/features/store/hooks';
import { toUserMessage } from '@/lib/errors';
import { useDebounced } from '@/lib/useDebounced';
import { toast } from '@/stores/toast';
import { colors, fonts, layout, radii } from '@/theme';

/** Screen 19: skin care store. Search is debounced; the grid is paginated and virtualised. */
export default function Store() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const requireAuth = useRequireAuth();
  const cartCount = useCartCount();
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 350);
  const categories = useProductCategories();
  const banners = useBanners('store_hero');
  const all = useProducts({ categoryId: category, q });
  const best = useProducts({ flag: 'best' });
  const wishlist = useWishlist();
  const toggleWish = useToggleWishlist();
  const addToCart = useAddToCart();

  const products = useMemo(() => all.data?.pages.flatMap((p) => p.items) ?? [], [all.data]);
  const wished = useMemo(() => new Set((wishlist.data ?? []).flatMap((w) => (w.product ? [w.product.id] : []))), [wishlist.data]);
  const showRails = !category && !q;

  const open = (p: ProductSummary) => router.push({ pathname: '/product/[slug]', params: { slug: p.slug } });
  const add = (p: ProductSummary) => {
    const v = p.product_variants[0];
    if (!v) return;
    addToCart.mutate({ variantId: v.id, delta: 1 }, { onSuccess: () => toast.success('Added to cart.'), onError: (e) => toast.error(toUserMessage(e)) });
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="h1" accessibilityRole="header">Skin Care Store</Text>
          <Text variant="caption">Chosen by our therapists</Text>
        </View>
        <IconButton icon="bag" label={cartCount ? `Cart, ${cartCount} items` : 'Cart'} badge={cartCount} onPress={() => router.push('/cart')} />
      </View>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.grey400} />
        <TextInput
          accessibilityLabel="Search serums, creams, sets" placeholder="Search serums, creams, sets" placeholderTextColor={colors.grey400}
          value={text} onChangeText={setText} style={styles.input} returnKeyType="search" autoCorrect={false}
        />
        {text ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setText('')} hitSlop={12}><Icon name="close" size={16} color={colors.grey600} /></Pressable> : null}
      </View>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={[{ id: 'all', name: 'All' }, ...(categories.data ?? [])]} keyExtractor={(c) => c.id}
        contentContainerStyle={styles.chips} ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        renderItem={({ item }) => <Chip label={item.name} selected={(item.id === 'all' && !category) || item.id === category} onPress={() => setCategory(item.id === 'all' ? null : item.id)} />}
      />
      {showRails && (banners.data?.length ?? 0) > 0 ? <PromoBanner banner={banners.data![0]!} width={width - layout.screenPadding * 2} /> : null}
      {showRails && (best.data?.pages[0]?.items.length ?? 0) > 0 ? (
        <View style={styles.rail}>
          <SectionHeader title="Best sellers" />
          <FlatList
            horizontal showsHorizontalScrollIndicator={false} data={best.data?.pages[0]?.items.slice(0, 8)} keyExtractor={(p) => p.id}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item }) => <ProductCard product={item} width={164} wished={wished.has(item.id)} onPress={() => open(item)} onAdd={() => add(item)} onWish={() => requireAuth(() => toggleWish.mutate({ productId: item.id }))} />}
          />
        </View>
      ) : null}
      <SectionHeader title={q ? `Results for “${q}”` : category ? categories.data?.find((c) => c.id === category)?.name ?? 'Products' : 'All products'} />
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      {all.isError ? (
        <ErrorState message={toUserMessage(all.error)} onRetry={() => void all.refetch()} />
      ) : (
        <FlashList
          data={products} numColumns={2} keyExtractor={(p) => p.id} ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={all.isRefetching && !all.isFetchingNextPage} onRefresh={() => void all.refetch()} tintColor={colors.gold} />}
          onEndReached={() => { if (all.hasNextPage && !all.isFetchingNextPage) void all.fetchNextPage(); }}
          onEndReachedThreshold={0.6}
          renderItem={({ item, index }) => (
            <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
              <ProductCard product={item} wished={wished.has(item.id)} onPress={() => open(item)} onAdd={() => add(item)} onWish={() => requireAuth(() => toggleWish.mutate({ productId: item.id }))} />
            </View>
          )}
          ListEmptyComponent={all.isLoading ? (
            <View style={styles.skeletons}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={230} radius={radii.lg} style={styles.skel} />)}</View>
          ) : <EmptyState icon="bag" title={q ? 'No products found' : 'The store is being stocked'} body={q ? 'Try a different search.' : 'Skin care products will appear here soon.'} />}
          ListFooterComponent={all.isFetchingNextPage ? <ActivityIndicator style={styles.spinner} color={colors.gold} /> : null}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: layout.screenPadding, paddingTop: 12, gap: 16, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: { minHeight: layout.inputHeight, borderRadius: radii.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.grey200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.black, paddingVertical: 10 },
  chips: { paddingRight: layout.screenPadding },
  rail: { gap: 12 },
  list: { paddingBottom: 32 },
  cell: { paddingBottom: 12, flex: 1 },
  cellLeft: { paddingLeft: layout.screenPadding, paddingRight: 6 },
  cellRight: { paddingRight: layout.screenPadding, paddingLeft: 6 },
  skeletons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: layout.screenPadding },
  skel: { width: '47%' },
  spinner: { padding: 16 },
});
