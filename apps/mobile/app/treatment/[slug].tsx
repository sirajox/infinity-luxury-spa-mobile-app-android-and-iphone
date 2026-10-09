import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Photo } from '@/components/ui/Photo';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useRequireAuth } from '@/features/auth/hooks';
import { useBranches, useService, useServiceReviews } from '@/features/catalog/hooks';
import { useToggleWishlist, useWishlist } from '@/features/store/hooks';
import { track } from '@/lib/analytics';
import { toUserMessage } from '@/lib/errors';
import { formatDuration, formatPrice } from '@/lib/format';
import { openWhatsApp } from '@/lib/links';
import { useBookingDraft } from '@/stores/bookingDraft';
import { useUi } from '@/stores/ui';
import { colors, layout, radii } from '@/theme';

/** Screen 10: treatment details. */
export default function TreatmentDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: service, isLoading, isError, error, refetch } = useService(slug);
  const reviews = useServiceReviews(service?.id);
  const branches = useBranches();
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();
  const requireAuth = useRequireAuth();
  const start = useBookingDraft((s) => s.start);
  const pushRecent = useUi((s) => s.pushRecent);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!service) return;
    track({ name: 'treatment_viewed', slug: service.slug });
    pushRecent({ kind: 'service', slug: service.slug, name: service.name });
  }, [service, pushRecent]);

  if (isLoading) return <Screen><View style={styles.pad}><Skeleton height={260} radius={radii.lg} /><Skeleton height={32} style={{ marginTop: 20 }} /><Skeleton height={80} style={{ marginTop: 14 }} /></View></Screen>;
  if (isError) return <Screen><ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /></Screen>;
  if (!service) return <Screen><EmptyState icon="search" title="Treatment not found" body="It may no longer be offered." actionLabel="Browse treatments" onAction={() => router.replace('/treatments')} /></Screen>;

  const quote = service.price_type === 'quote';
  const saved = !!wishlist.data?.some((w) => w.service?.id === service.id);
  const images = [service.thumbnail_url, ...service.gallery_urls].filter((u): u is string => !!u);
  const offeredBranches = (branches.data ?? []).filter((b) => service.branch_ids.includes(b.id));
  const reviewCount = reviews.data?.length ?? 0;
  const average = reviewCount ? reviews.data!.reduce((n, r) => n + r.rating, 0) / reviewCount : null;

  const book = () => {
    start({ id: service.id, slug: service.slug, name: service.name, durationMinutes: service.duration_minutes, priceKobo: service.price_kobo ?? 0, priceType: service.price_type, categoryName: service.category?.name, thumbnailUrl: service.thumbnail_url });
    track({ name: 'booking_started', serviceSlug: service.slug });
    router.push('/booking/city');
  };

  const enquire = () => {
    const main = offeredBranches.find((b) => b.is_main) ?? offeredBranches[0];
    if (main?.whatsapp ?? main?.phone) void openWhatsApp((main?.whatsapp ?? main?.phone) as string, `Hello, I would like a quote for ${service.name}.`);
    else router.push('/support');
  };

  return (
    <Screen
      padded={false} edges={['left', 'right']}
      footer={
        quote
          ? <Button label="Request a quote" icon="chat" onPress={enquire} accessibilityHint="Opens WhatsApp to ask the branch for a price" />
          : <Button label={offeredBranches.length ? 'Book This Treatment' : 'Currently unavailable'} disabled={!offeredBranches.length} onPress={book} />
      }
    >
      {/* Gallery */}
      <View>
        {images.length > 0 ? (
          <FlatList
            horizontal pagingEnabled showsHorizontalScrollIndicator={false} data={images} keyExtractor={(u) => u}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <Photo uri={item} alt={service.name} style={{ width, height: 340 }} priority="high" />}
          />
        ) : (
          <Photo fallbackIcon="stones" fallbackLabel="Photo coming soon" style={{ width, height: 340 }} iconSize={36} />
        )}
        <View style={[styles.overlayBar, { top: insets.top + 8 }]}>
          <IconButton icon="chevronLeft" label="Go back" tone="solid" onPress={() => (router.canGoBack() ? router.back() : router.replace('/treatments'))} />
          <IconButton icon="heart" label={saved ? 'Remove from wishlist' : 'Save to wishlist'} tone="solid" filled={saved} onPress={() => requireAuth(() => toggle.mutate({ serviceId: service.id }))} />
        </View>
        {images.length > 1 ? (
          <View style={styles.pager}>{images.map((u, i) => <View key={u} style={[styles.pageDot, i === page && styles.pageDotOn]} />)}</View>
        ) : null}
      </View>

      <View style={styles.sheet}>
        {service.category ? <Badge label={service.category.name} tone="gold" /> : null}
        <View style={styles.titleRow}>
          <Text variant="h1" style={styles.flex} accessibilityRole="header">{service.name}</Text>
          <Text variant="h3" color={colors.goldText}>{formatPrice(service.price_type, service.price_kobo)}</Text>
        </View>
        {service.short_description ? <Text variant="body">{service.short_description}</Text> : null}
        <Rating average={average} count={reviewCount} />

        <View style={styles.facts}>
          <Fact icon="clock" value={formatDuration(service.duration_minutes)} label="Duration" />
          <Fact icon="user" value="Expert" label="Staff" />
          <Fact icon="pin" value={`${offeredBranches.length}`} label={offeredBranches.length === 1 ? 'Branch' : 'Branches'} />
        </View>

        {quote ? (
          <View style={styles.note}>
            <Icon name="help" size={18} color={colors.goldText} />
            <Text variant="caption" style={styles.flex}>The price for this treatment depends on a consultation. Message the branch for a quote.</Text>
          </View>
        ) : null}

        {service.description ? (
          <View style={styles.block}>
            <Text variant="h3">About this treatment</Text>
            <Text variant="body">{service.description}</Text>
          </View>
        ) : null}
        {service.package_info ? (
          <View style={styles.block}>
            <Text variant="h3">Sessions and packages</Text>
            <Text variant="body">{service.package_info}</Text>
          </View>
        ) : null}

        {reviewCount > 0 ? (
          <View style={styles.block}>
            <Text variant="h3">Reviews</Text>
            {reviews.data?.slice(0, 3).map((r) => (
              <View key={r.id} style={styles.review}>
                <View style={styles.reviewHead}>
                  <Text variant="bodyStrong">{r.reviewer_name ?? 'Customer'}</Text>
                  <Rating average={r.rating} count={1} size={11} />
                </View>
                {r.body ? <Text variant="body">{r.body}</Text> : null}
                {r.verified ? <Badge label="Verified booking" tone="success" /> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function Fact({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.factIcon}><Icon name={icon} size={20} color={colors.goldText} /></View>
      <Text variant="bodyStrong">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: layout.screenPadding },
  overlayBar: { position: 'absolute', left: layout.screenPadding, right: layout.screenPadding, flexDirection: 'row', justifyContent: 'space-between' },
  pager: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  pageDotOn: { width: 20, backgroundColor: colors.white },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.white, padding: layout.screenPadding, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  facts: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.grey200 },
  fact: { alignItems: 'center', gap: 4, minWidth: 80 },
  factIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldSoft, borderRadius: radii.lg, padding: 14 },
  block: { gap: 8, marginTop: 6 },
  review: { gap: 6, paddingVertical: 8 },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
