import { Pressable, StyleSheet, View } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PatternPlaceholder, Photo } from '@/components/ui/Photo';
import { Text } from '@/components/ui/Text';

export interface BannerData { id: string; eyebrow: string | null; title: string; subtitle: string | null; cta_label: string | null; cta_target: string | null; image_url: string | null }

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
}

/** Fake text field that opens the search screen; keeps the home screen light (no keyboard, no live queries). */
export function SearchBar({ placeholder, onPress, onFilter, filterLabel }: { placeholder: string; onPress: () => void; onFilter?: () => void; filterLabel?: string }) {
  return (
    <View style={styles.searchRow}>
      <Pressable accessibilityRole="search" accessibilityLabel={placeholder} onPress={onPress} style={styles.search}>
        <Icon name="search" size={18} color={colors.grey400} />
        <Text variant="body" color={colors.grey400} numberOfLines={1} style={styles.flex}>{placeholder}</Text>
      </Pressable>
      {onFilter ? <IconButton icon="sliders" label={filterLabel ?? 'Filters'} tone="dark" size={48} onPress={onFilter} /> : null}
    </View>
  );
}

/** Promotional banner (admin-managed). Black card, gold CTA, image block on the right. */
export function PromoBanner({ banner, onPress, width }: { banner: BannerData; onPress?: () => void; width: number }) {
  return (
    <View style={[styles.banner, { width }]}>
      <View style={styles.bannerCopy}>
        {banner.eyebrow ? <Text variant="eyebrow" color={colors.gold}>{banner.eyebrow}</Text> : null}
        <Text variant="h2" color={colors.white} numberOfLines={3} accessibilityRole="header">{banner.title}</Text>
        {banner.subtitle ? <Text variant="caption" color={colors.onDarkMuted} numberOfLines={2}>{banner.subtitle}</Text> : null}
        {banner.cta_label && onPress ? <Button label={banner.cta_label} variant="gold" compact onPress={onPress} style={styles.bannerCta} /> : null}
      </View>
      <View style={styles.bannerImage}>
        {banner.image_url ? <Photo uri={banner.image_url} style={StyleSheet.absoluteFill} alt={banner.title} /> : <PatternPlaceholder dark icon="sparkle" style={StyleSheet.absoluteFill} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: { flex: 1, minHeight: layout.inputHeight, borderRadius: radii.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.grey200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  banner: { minHeight: 148, borderRadius: radii.xl, backgroundColor: colors.black, flexDirection: 'row', overflow: 'hidden' },
  bannerCopy: { flex: 1.4, padding: 18, gap: 6, justifyContent: 'center' },
  bannerCta: { alignSelf: 'flex-start', marginTop: 6 },
  bannerImage: { flex: 1 },
});
