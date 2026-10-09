import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Photo } from '@/components/ui/Photo';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { TreatmentRow } from '@/features/catalog/components';
import { useServiceSearch } from '@/features/catalog/hooks';
import { cheapestVariant } from '@/features/store/api';
import { useProducts } from '@/features/store/hooks';
import { formatNaira } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useBookingDraft } from '@/stores/bookingDraft';
import { useUi } from '@/stores/ui';
import { colors, fonts, layout, radii } from '@/theme';

/** Unified search across treatments and products (debounced, server-side). */
export default function Search() {
  const router = useRouter();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 350);
  const services = useServiceSearch(q);
  const products = useProducts({ q: q.length >= 2 ? q : undefined });
  const recent = useUi((s) => s.recentlyViewed);
  const start = useBookingDraft((s) => s.start);
  const active = q.length >= 2;
  const productItems = active ? products.data?.pages[0]?.items.slice(0, 8) ?? [] : [];
  const loading = active && (services.isFetching || products.isFetching) && !services.data && !products.data;
  const nothing = active && !loading && (services.data?.length ?? 0) === 0 && productItems.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.bar}>
        <IconButton icon="chevronLeft" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.grey400} />
          <TextInput
            autoFocus accessibilityLabel="Search treatments or products" placeholder="Search treatments or products" placeholderTextColor={colors.grey400}
            value={text} onChangeText={setText} style={styles.input} returnKeyType="search" autoCorrect={false}
          />
          {text ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setText('')} hitSlop={12}><Icon name="close" size={16} color={colors.grey600} /></Pressable> : null}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!active ? (
          recent.length > 0 ? (
            <View style={styles.section}>
              <Text variant="h3">Recently viewed</Text>
              {recent.map((r) => (
                <Pressable key={`${r.kind}:${r.slug}`} accessibilityRole="button" accessibilityLabel={r.name} style={styles.recent}
                  onPress={() => router.push(r.kind === 'service' ? { pathname: '/treatment/[slug]', params: { slug: r.slug } } : { pathname: '/product/[slug]', params: { slug: r.slug } })}>
                  <Icon name={r.kind === 'service' ? 'sparkle' : 'bag'} size={18} color={colors.goldText} />
                  <Text variant="bodyStrong">{r.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : <Text variant="caption">Type at least two letters to search treatments and skin care products.</Text>
        ) : loading ? <SkeletonList rows={4} height={72} /> : nothing ? (
          <EmptyState icon="search" title="No matches" body="Try a different word, or browse all treatments." />
        ) : (
          <>
            {(services.data?.length ?? 0) > 0 ? (
              <View style={styles.section}>
                <Text variant="h3">Treatments</Text>
                {services.data?.map((s) => (
                  <TreatmentRow key={s.id} service={s}
                    onPress={() => router.push({ pathname: '/treatment/[slug]', params: { slug: s.slug } })}
                    onBook={() => { start({ id: s.id, slug: s.slug, name: s.name, durationMinutes: s.duration_minutes, priceKobo: s.price_kobo ?? 0, priceType: s.price_type, thumbnailUrl: s.thumbnail_url }); router.push('/booking/city'); }} />
                ))}
              </View>
            ) : null}
            {productItems.length > 0 ? (
              <View style={styles.section}>
                <Text variant="h3">Products</Text>
                {productItems.map((p) => {
                  const v = cheapestVariant(p);
                  return (
                    <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} style={styles.product} onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: p.slug } })}>
                      <Photo uri={p.thumbnail_url} fallbackIcon="drop" style={styles.productThumb} iconSize={20} />
                      <View style={styles.flex}>
                        <Text variant="title" numberOfLines={2}>{p.name}</Text>
                        {v ? <Text variant="price">{formatNaira(v.price_kobo)}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.white },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.screenPadding, paddingVertical: 10 },
  search: { flex: 1, minHeight: 48, borderRadius: radii.pill, backgroundColor: colors.grey50, borderWidth: 1, borderColor: colors.grey200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.black, paddingVertical: 8 },
  content: { padding: layout.screenPadding, gap: 20, paddingBottom: 40 },
  section: { gap: 12 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: layout.minTouch, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  productThumb: { width: 64, height: 64, borderRadius: radii.md },
});
