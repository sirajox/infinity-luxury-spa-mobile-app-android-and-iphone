import { Pressable, StyleSheet, View } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PressableCard } from '@/components/ui/Card';
import { Icon, iconForKey } from '@/components/ui/Icon';
import { Photo } from '@/components/ui/Photo';
import { Rating } from '@/components/ui/Rating';
import { Text } from '@/components/ui/Text';
import { formatNaira, formatPrice } from '@/lib/format';
import type { Branch, Category, ServiceSummary, StaffSummary, Subcategory } from './api';

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Home "Top treatments": icon tile with label beneath. */
export function CategoryChip({ category, onPress }: { category: Pick<Category, 'name' | 'icon'>; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${category.name} treatments`} onPress={onPress} style={styles.chip}>
      <View style={styles.chipIcon}>
        <Icon name={iconForKey(category.icon)} size={22} color={colors.gold} />
      </View>
      <Text variant="caption" align="center" numberOfLines={2} style={styles.chipLabel}>{category.name}</Text>
    </Pressable>
  );
}

/** "All categories" grid card. */
export function CategoryTile({ category, onPress }: { category: Category; onPress: () => void }) {
  return (
    <PressableCard onPress={onPress} label={`${category.name}, ${plural(category.stats.treatment_count, 'treatment')}`} style={styles.tile}>
      <View style={styles.tileIcon}>
        <Icon name={iconForKey(category.icon)} size={20} color={colors.gold} />
      </View>
      <Text variant="title" numberOfLines={2}>{category.name}</Text>
      <Text variant="caption">{plural(category.stats.treatment_count, 'treatment')}</Text>
    </PressableCard>
  );
}

export function SubcategoryRow({ sub, onPress }: { sub: Subcategory; onPress: () => void }) {
  const from = sub.stats.from_price_kobo;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={sub.name} onPress={onPress} style={styles.subRow}>
      <Photo uri={sub.image_url} fallbackIcon="drop" style={styles.subThumb} iconSize={20} />
      <View style={styles.flex}>
        <Text variant="title" numberOfLines={2}>{sub.name}</Text>
        <Text variant="caption">
          {plural(sub.stats.treatment_count, 'treatment')}{from != null ? `, from ${formatNaira(from)}` : ''}
        </Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.grey400} />
    </Pressable>
  );
}

/** Treatment list item (design 09). */
export function TreatmentRow({ service, onPress, onBook }: { service: ServiceSummary; onPress: () => void; onBook: () => void }) {
  const quote = service.price_type === 'quote';
  return (
    <Card style={styles.treatment}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${service.name}, details`} onPress={onPress} style={styles.treatmentMain}>
        <Photo uri={service.thumbnail_url} fallbackIcon="drop" style={styles.treatmentThumb} iconSize={20} />
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={2}>{service.name}</Text>
          <Text variant="caption">{service.session_count ? `${service.session_count} sessions` : 'Per session'}</Text>
          <Text variant="price" style={styles.priceGap}>{formatPrice(service.price_type, service.price_kobo)}</Text>
        </View>
      </Pressable>
      <Button label={quote ? 'Enquire' : 'Book'} variant="gold" compact onPress={onBook} accessibilityHint={`Start booking ${service.name}`} style={styles.bookBtn} />
    </Card>
  );
}

/** Home "Top staff" card. */
export function StaffCard({ staff, onPress }: { staff: StaffSummary; onPress: () => void }) {
  return (
    <PressableCard onPress={onPress} label={`${staff.full_name}, ${staff.job_title}`} style={styles.staffCard}>
      <Photo uri={staff.photo_url} fallbackIcon="user" fallbackLabel={staff.photo_url ? undefined : 'Photo coming soon'} style={styles.staffPhoto} />
      <View style={styles.staffBody}>
        <Text variant="title" numberOfLines={1}>{staff.full_name}</Text>
        <Text variant="caption" numberOfLines={1}>{staff.job_title}</Text>
        <View style={styles.staffMeta}>
          <Rating average={staff.rating_average} count={staff.review_count} />
          {staff.branches[0] ? (
            <View style={styles.pinRow}>
              <Icon name="pin" size={12} color={colors.grey600} />
              <Text variant="caption" numberOfLines={1}>{staff.branches[0].name}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </PressableCard>
  );
}

/** Select-staff row (design 12): radio-style selection with a "View profile" link. */
export function StaffOption({ staff, selected, onSelect, onProfile }: { staff: StaffSummary; selected: boolean; onSelect: () => void; onProfile: () => void }) {
  return (
    <PressableCard onPress={onSelect} selected={selected} label={`${staff.full_name}, ${staff.job_title}`} style={styles.optionRow}>
      <Photo uri={staff.photo_url} fallbackIcon="user" style={styles.optionAvatar} iconSize={18} />
      <View style={styles.flex}>
        <Text variant="title">{staff.full_name}</Text>
        <Text variant="caption">{staff.job_title}</Text>
        <View style={styles.optionMeta}>
          <Rating average={staff.rating_average} count={staff.review_count} />
          <Pressable accessibilityRole="link" accessibilityLabel={`View ${staff.full_name}'s profile`} onPress={onProfile} hitSlop={10}>
            <Text variant="label" color={colors.goldText}>View profile</Text>
          </Pressable>
        </View>
      </View>
      <RadioMark selected={selected} />
    </PressableCard>
  );
}

export function RadioMark({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioOn]}>
      {selected ? <Icon name="check" size={13} color={colors.white} strokeWidth={2.5} /> : null}
    </View>
  );
}

/** Choose-your-city card (design 11). */
export function BranchOption({ branch, selected, onSelect, unavailable }: { branch: Branch; selected: boolean; onSelect: () => void; unavailable?: boolean }) {
  return (
    <PressableCard onPress={unavailable ? undefined : onSelect} selected={selected} label={`${branch.name} branch${unavailable ? ', not available' : ''}`} style={[styles.optionRow, unavailable && { opacity: 0.55 }]}>
      <Photo fallbackIcon="pin" style={styles.branchThumb} iconSize={20} />
      <View style={styles.flex}>
        <View style={styles.branchTitle}>
          <Text variant="h3">{branch.name}</Text>
          {branch.is_main ? <Badge label="Main branch" tone="dark" /> : null}
        </View>
        <Text variant="caption" numberOfLines={2}>{[branch.area, branch.city].filter(Boolean).join(', ')}</Text>
        {unavailable ? <Text variant="caption" color={colors.error}>Not offered at this branch</Text> : null}
      </View>
      <RadioMark selected={selected} />
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chip: { width: 64, alignItems: 'center', gap: 8, minHeight: layout.minTouch },
  chipIcon: { width: 56, height: 56, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.grey200, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 11, lineHeight: 15 },
  tile: { flex: 1, padding: 16, gap: 4, minHeight: 124 },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200 },
  subThumb: { width: 52, height: 52, borderRadius: radii.md },
  treatment: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  treatmentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  treatmentThumb: { width: 64, height: 64, borderRadius: radii.md },
  priceGap: { marginTop: 4 },
  bookBtn: { alignSelf: 'flex-end', minWidth: 68 },
  staffCard: { width: 168 },
  staffPhoto: { height: 132, width: '100%' },
  staffBody: { padding: 12, gap: 2 },
  staffMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  optionAvatar: { width: 56, height: 56, borderRadius: 28 },
  optionMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  branchThumb: { width: 60, height: 60, borderRadius: radii.md },
  branchTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.grey200, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
