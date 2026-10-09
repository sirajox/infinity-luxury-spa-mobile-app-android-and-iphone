import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useBanners, usePackages, usePlans, useProfile, useUnreadCount } from '@/features/account/hooks';
import { useSession } from '@/features/auth/store';
import { CategoryChip, StaffCard, TreatmentRow } from '@/features/catalog/components';
import { useCategories, useFeaturedServices, useTopStaff } from '@/features/catalog/hooks';
import { greeting, PromoBanner, SearchBar } from '@/features/home/components';
import { ProductCard } from '@/features/store/components';
import { useAddToCart, useProducts, useToggleWishlist, useWishlist } from '@/features/store/hooks';
import { useRequireAuth } from '@/features/auth/hooks';
import { formatNaira } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { useBookingDraft } from '@/stores/bookingDraft';
import { useUi } from '@/stores/ui';
import { colors, layout, radii } from '@/theme';

function isInAppRoute(target: string | null): target is string {
  return !!target && target.startsWith('/') && !target.startsWith('//');
}

export default function Home() {
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const session = useSession();
  const requireAuth = useRequireAuth();
  const profile = useProfile();
  const unread = useUnreadCount();
  const categories = useCategories();
  const banners = useBanners('home_hero');
  const featured = useFeaturedServices();
  const staff = useTopStaff();
  const best = useProducts({ flag: 'best' });
  const fresh = useProducts({ flag: 'new' });
  const plans = usePlans();
  const packages = usePackages();
  const wishlist = useWishlist();
  const toggleWish = useToggleWishlist();
  const addToCart = useAddToCart();
  const recent = useUi((s) => s.recentlyViewed);
  const startBooking = useBookingDraft((s) => s.start);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = (profile.data?.full_name ?? session?.user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? 'Guest';
  const bannerWidth = width - layout.screenPadding * 2;
  const wished = new Set((wishlist.data ?? []).flatMap((w) => (w.product ? [w.product.id] : [])));
  const bestItems = best.data?.pages[0]?.items.slice(0, 6) ?? [];
  const newItems = fresh.data?.pages[0]?.items.slice(0, 6) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([qc.invalidateQueries({ queryKey: ['catalog'] }), qc.invalidateQueries({ queryKey: ['store'] }), qc.invalidateQueries({ queryKey: ['content'] })]);
    setRefreshing(false);
  }, [qc]);

  const quickAdd = (variantId: string) =>
    addToCart.mutate({ variantId, delta: 1 }, { onSuccess: () => toast.success('Added to cart.'), onError: (e) => toast.error(toUserMessage(e)) });

  return (
    <Screen
      scroll
      padded={false}
      tone="white"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />}
      contentStyle={styles.content}
    >
      {/* Warm greeting header */}
      <View style={styles.header}>
        <View style={styles.greetRow}>
          <View style={styles.flex}>
            <Text variant="caption">{greeting()}</Text>
            <Text variant="h1" numberOfLines={1} accessibilityRole="header">{firstName}</Text>
          </View>
          <IconButton icon="bell" label={unread.data ? `Notifications, ${unread.data} unread` : 'Notifications'} dot={!!unread.data} onPress={() => requireAuth(() => router.push('/notifications'))} />
          <IconButton icon="user" label="Profile" tone="soft" size={44} onPress={() => router.navigate('/(tabs)/profile')} />
        </View>
        <SearchBar placeholder="Search treatments or products" onPress={() => router.push('/search')} onFilter={() => router.push('/treatments')} filterLabel="Browse all treatments" />
      </View>

      <View style={styles.body}>
        {/* Treatment categories */}
        <View style={styles.section}>
          <SectionHeader title="Top treatments" actionLabel="See all" onAction={() => router.push('/treatments')} />
          {categories.isLoading ? (
            <View style={styles.rowSkeleton}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} width={56} height={80} radius={radii.lg} />)}</View>
          ) : (
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={categories.data ?? []} keyExtractor={(c) => c.id}
              contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => <CategoryChip category={item} onPress={() => router.push({ pathname: '/treatments/[category]', params: { category: item.slug } })} />}
              ListEmptyComponent={<Text variant="caption">Treatments will appear here soon.</Text>}
            />
          )}
        </View>

        {/* Admin-managed promotions */}
        {(banners.data?.length ?? 0) > 0 ? (
          <FlatList
            horizontal pagingEnabled={false} snapToInterval={bannerWidth + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false}
            data={banners.data} keyExtractor={(b) => b.id} contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item }) => (
              <PromoBanner banner={item} width={bannerWidth} onPress={isInAppRoute(item.cta_target) ? () => router.push(item.cta_target as Href) : undefined} />
            )}
          />
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <Button label="Book a treatment" icon="calendarDays" compact onPress={() => router.push('/treatments')} style={styles.flex} />
          <Button label="Shop skin care" icon="bag" variant="outline" compact onPress={() => router.navigate('/(tabs)/store')} style={styles.flex} />
        </View>

        {/* Featured treatments */}
        {(featured.data?.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Popular treatments" />
            {featured.data?.slice(0, 4).map((s) => (
              <TreatmentRow
                key={s.id} service={s}
                onPress={() => router.push({ pathname: '/treatment/[slug]', params: { slug: s.slug } })}
                onBook={() => {
                  startBooking({ id: s.id, slug: s.slug, name: s.name, durationMinutes: s.duration_minutes, priceKobo: s.price_kobo ?? 0, priceType: s.price_type, thumbnailUrl: s.thumbnail_url });
                  router.push('/booking/city');
                }}
              />
            ))}
          </View>
        ) : null}

        {/* Top staff */}
        {(staff.data?.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Top staff" actionLabel="View all" onAction={() => router.push('/staff')} />
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={staff.data} keyExtractor={(s) => s.id}
              contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => <StaffCard staff={item} onPress={() => router.push({ pathname: '/staff/[id]', params: { id: item.id } })} />}
            />
          </View>
        ) : null}

        {/* Products */}
        {bestItems.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Best sellers" actionLabel="See all" onAction={() => router.navigate('/(tabs)/store')} />
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={bestItems} keyExtractor={(p) => p.id}
              contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => (
                <ProductCard
                  product={item} width={164} wished={wished.has(item.id)}
                  onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
                  onAdd={() => { const v = item.product_variants[0]; if (v) quickAdd(v.id); }}
                  onWish={() => requireAuth(() => toggleWish.mutate({ productId: item.id }))}
                />
              )}
            />
          </View>
        ) : null}
        {newItems.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="New arrivals" actionLabel="See all" onAction={() => router.navigate('/(tabs)/store')} />
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={newItems} keyExtractor={(p) => p.id}
              contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => (
                <ProductCard
                  product={item} width={164} wished={wished.has(item.id)}
                  onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
                  onAdd={() => { const v = item.product_variants[0]; if (v) quickAdd(v.id); }}
                  onWish={() => requireAuth(() => toggleWish.mutate({ productId: item.id }))}
                />
              )}
            />
          </View>
        ) : null}

        {/* Membership and packages: only when the business has published them */}
        {(plans.data?.length ?? 0) > 0 ? (
          <PromoLink icon="sparkle" title="Infinity membership" body={`Plans from ${formatNaira(Math.min(...(plans.data ?? []).map((p) => p.price_kobo)))}`} onPress={() => router.push('/memberships')} />
        ) : null}
        {(packages.data?.length ?? 0) > 0 ? (
          <PromoLink icon="lotus" title="Packages" body="Bridal, mom & daughter, couples and more" onPress={() => router.push('/packages')} />
        ) : null}

        {/* Recently viewed */}
        {recent.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Recently viewed" />
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={recent} keyExtractor={(r) => `${r.kind}:${r.slug}`}
              contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              renderItem={({ item }) => (
                <Button
                  label={item.name} variant="light" compact
                  onPress={() => router.push(item.kind === 'service' ? { pathname: '/treatment/[slug]', params: { slug: item.slug } } : { pathname: '/product/[slug]', params: { slug: item.slug } })}
                />
              )}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function PromoLink({ icon, title, body, onPress }: { icon: 'sparkle' | 'lotus'; title: string; body: string; onPress: () => void }) {
  return (
    <View style={styles.promoLinkWrap}>
      <View style={styles.promoLink}>
        <View style={styles.promoIcon}><Icon name={icon} size={20} color={colors.gold} /></View>
        <View style={styles.flex}>
          <Text variant="title">{title}</Text>
          <Text variant="caption">{body}</Text>
        </View>
        <IconButton icon="chevronRight" label={`Open ${title}`} size={36} onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24 },
  header: { backgroundColor: colors.warm, paddingHorizontal: layout.screenPadding, paddingTop: 8, paddingBottom: 18, gap: 16 },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { gap: 24, paddingTop: 20 },
  section: { gap: 14, paddingHorizontal: layout.screenPadding },
  rail: { paddingHorizontal: layout.screenPadding },
  rowSkeleton: { flexDirection: 'row', gap: 12 },
  quickRow: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screenPadding },
  promoLinkWrap: { paddingHorizontal: layout.screenPadding },
  promoLink: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radii.lg, backgroundColor: colors.goldSoft },
  promoIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
});
