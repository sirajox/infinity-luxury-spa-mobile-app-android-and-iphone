import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { CategoryTile, plural } from '@/features/catalog/components';
import { useBranches, useCategories } from '@/features/catalog/hooks';
import { SearchBar } from '@/features/home/components';
import { toUserMessage } from '@/lib/errors';
import { layout, radii } from '@/theme';

/** Screen 07: all treatment categories. */
export default function AllCategories() {
  const router = useRouter();
  const categories = useCategories();
  const branches = useBranches();
  const subtitle = categories.data
    ? `${plural(categories.data.length, 'category', 'categories')}${branches.data ? ` across our ${plural(branches.data.length, 'branch', 'branches')}` : ''}`
    : undefined;

  return (
    <Screen scroll={false} padded={false} header={<ScreenHeader title="Treatments" subtitle={subtitle} />}>
      <View style={styles.pad}>
        <SearchBar placeholder="Search treatments" onPress={() => router.push('/search')} />
      </View>
      {categories.isError ? (
        <ErrorState message={toUserMessage(categories.error)} onRetry={() => void categories.refetch()} />
      ) : categories.isLoading ? (
        <View style={styles.grid}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={124} radius={radii.lg} style={styles.skel} />)}</View>
      ) : (
        <FlatList
          data={categories.data} numColumns={2} keyExtractor={(c) => c.id}
          contentContainerStyle={styles.grid} columnWrapperStyle={styles.col}
          renderItem={({ item }) => <CategoryTile category={item} onPress={() => router.push({ pathname: '/treatments/[category]', params: { category: item.slug } })} />}
          ListEmptyComponent={<ErrorState message="Treatments will be listed here soon." />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: layout.screenPadding, paddingBottom: 14 },
  grid: { paddingHorizontal: layout.screenPadding, paddingBottom: 32, gap: 12 },
  col: { gap: 12 },
  skel: { flex: 1 },
});
