import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { Icon, iconForKey } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { fetchSettings } from '@/features/account/api';
import { SubcategoryRow, TreatmentRow, plural } from '@/features/catalog/components';
import { useCategory } from '@/features/catalog/hooks';
import { formatNaira } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import { useBookingDraft } from '@/stores/bookingDraft';

/** Screen 08: sub-categories of a category, on the dark hero used throughout the catalogue. */
export default function CategoryScreen() {
  const router = useRouter();
  const { category: slug } = useLocalSearchParams<{ category: string }>();
  const { data, isLoading, isError, error, refetch } = useCategory(slug);
  const consultation = useQuery({ queryKey: ['content', 'consultation'], queryFn: () => fetchSettings<number | null>('consultation.fee_kobo', null), staleTime: 10 * 60_000 });
  const start = useBookingDraft((s) => s.start);

  return (
    <Screen tone="dark" padded={false} edges={['top', 'left', 'right']} contentStyle={styles.fill}>
      <View style={styles.hero}>
        <View style={styles.bar}>
          <IconButton icon="chevronLeft" label="Go back" tone="solid" onPress={() => (router.canGoBack() ? router.back() : router.replace('/treatments'))} />
          <IconButton icon="search" label="Search treatments" tone="solid" onPress={() => router.push('/search')} />
        </View>
        <View style={styles.heroText}>
          <Icon name={iconForKey(data?.category.icon)} size={26} color={colors.gold} />
          <Text variant="eyebrow" color={colors.gold}>Treatments</Text>
          <Text variant="h1" color={colors.white} accessibilityRole="header">{data?.category.name ?? ' '}</Text>
          {data ? <Text variant="body" color={colors.onDarkMuted}>{plural(data.total, 'treatment')} in {plural(data.subcategories.length, 'collection')}</Text> : null}
        </View>
      </View>
      <View style={styles.sheet}>
        {isLoading ? <SkeletonList rows={5} /> : isError ? (
          <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
        ) : !data ? (
          <EmptyState icon="search" title="Category not found" actionLabel="Browse all treatments" onAction={() => router.replace('/treatments')} />
        ) : (
          <>
            {data.subcategories.map((s) => (
              <SubcategoryRow key={s.id} sub={s} onPress={() => router.push({ pathname: '/treatments/collection/[sub]', params: { sub: s.slug } })} />
            ))}
            {data.directServices.map((s) => (
              <TreatmentRow key={s.id} service={s}
                onPress={() => router.push({ pathname: '/treatment/[slug]', params: { slug: s.slug } })}
                onBook={() => { start({ id: s.id, slug: s.slug, name: s.name, durationMinutes: s.duration_minutes, priceKobo: s.price_kobo ?? 0, priceType: s.price_type, thumbnailUrl: s.thumbnail_url }); router.push('/booking/city'); }} />
            ))}
            {data.total === 0 ? <EmptyState icon="sparkle" title="Coming soon" body="Treatments in this category will be listed shortly." /> : null}
            {consultation.data ? (
              <View style={styles.note} accessibilityRole="summary">
                <Icon name="help" size={18} color={colors.goldText} />
                <Text variant="caption" style={styles.flex}>Not sure what you need? <Text variant="label">Book a {formatNaira(consultation.data)} consultation</Text> first.</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { flexGrow: 1 },
  hero: { paddingHorizontal: layout.screenPadding, paddingTop: 8, paddingBottom: 56, gap: 22, backgroundColor: '#161614' },
  bar: { flexDirection: 'row', justifyContent: 'space-between' },
  heroText: { gap: 6 },
  sheet: { flex: 1, marginTop: -28, backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: layout.screenPadding, gap: 4, minHeight: 400 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldSoft, borderRadius: radii.lg, padding: 14, marginTop: 16 },
});
