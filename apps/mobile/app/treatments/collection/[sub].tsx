import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { TreatmentRow } from '@/features/catalog/components';
import { useSubcategory } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';
import { ilikeTerm } from '@/lib/format';
import { useBookingDraft } from '@/stores/bookingDraft';
import { colors, fonts, layout, radii } from '@/theme';

/** Screen 09: treatments in one collection with an in-collection search. */
export default function Collection() {
  const router = useRouter();
  const { sub } = useLocalSearchParams<{ sub: string }>();
  const { data, isLoading, isError, error, refetch } = useSubcategory(sub);
  const start = useBookingDraft((s) => s.start);
  const [term, setTerm] = useState('');
  const services = useMemo(() => {
    const t = ilikeTerm(term).toLowerCase();
    return (data?.services ?? []).filter((s) => !t || s.name.toLowerCase().includes(t));
  }, [data, term]);

  return (
    <Screen tone="warm" scroll={false} padded={false} header={
      <ScreenHeader title={data?.subcategory.name ?? ' '} subtitle={data?.subcategory.description ?? undefined} />
    }>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.grey400} />
          <TextInput accessibilityLabel="Search in this collection" placeholder="Search in this collection" placeholderTextColor={colors.grey400} value={term} onChangeText={setTerm} style={styles.input} returnKeyType="search" />
          {term ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setTerm('')} hitSlop={12}><Icon name="close" size={16} color={colors.grey600} /></Pressable> : null}
        </View>
      </View>
      <View style={styles.list}>
        {isLoading ? <SkeletonList rows={5} /> : isError ? (
          <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
        ) : (
          <FlashList
            data={services} keyExtractor={(s) => s.id} contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item }) => (
              <TreatmentRow
                service={item}
                onPress={() => router.push({ pathname: '/treatment/[slug]', params: { slug: item.slug } })}
                onBook={() => { start({ id: item.id, slug: item.slug, name: item.name, durationMinutes: item.duration_minutes, priceKobo: item.price_kobo ?? 0, priceType: item.price_type, thumbnailUrl: item.thumbnail_url }); router.push('/booking/city'); }}
              />
            )}
            ListEmptyComponent={<EmptyState icon="search" title={term ? 'No matches' : 'Nothing here yet'} body={term ? 'Try a different search.' : 'Treatments in this collection will be listed soon.'} />}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: layout.screenPadding, paddingBottom: 14, backgroundColor: colors.warm },
  search: { minHeight: layout.inputHeight, borderRadius: radii.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.grey200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.black, paddingVertical: 10 },
  list: { flex: 1, backgroundColor: colors.white },
  listContent: { padding: layout.screenPadding, paddingBottom: 32 },
});
