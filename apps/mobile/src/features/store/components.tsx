import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Photo } from '@/components/ui/Photo';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { formatNaira } from '@/lib/format';
import { cheapestVariant, discountPercent, type ProductSummary, type ProductVariant } from './api';
import type { CartLine } from './cart';

export function PriceBlock({ variant, size = 'md' }: { variant: Pick<ProductVariant, 'price_kobo' | 'compare_at_price_kobo'>; size?: 'md' | 'lg' }) {
  const off = discountPercent(variant);
  return (
    <View style={styles.priceRow}>
      <Text variant={size === 'lg' ? 'h2' : 'price'} color={colors.goldText}>{formatNaira(variant.price_kobo)}</Text>
      {off ? (
        <>
          <Text variant="caption" style={styles.strike}>{formatNaira(variant.compare_at_price_kobo as number)}</Text>
          <Badge label={`${off}% off`} tone="dark" />
        </>
      ) : null}
    </View>
  );
}

export function ProductCard({ product, wished, onPress, onAdd, onWish, width }: {
  product: ProductSummary; wished?: boolean; onPress: () => void; onAdd: () => void; onWish: () => void; width?: number;
}) {
  const v = cheapestVariant(product);
  return (
    <Card style={[styles.card, width ? { width } : styles.cardFlex]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}${v ? `, ${formatNaira(v.price_kobo)}` : ''}`} onPress={onPress}>
        <View>
          <Photo uri={product.thumbnail_url} fallbackIcon="drop" style={styles.cardPhoto} iconSize={32} />
          <View style={styles.heart}>
            <IconButton icon="heart" label={wished ? 'Remove from wishlist' : 'Save to wishlist'} tone="solid" size={32} filled={wished} onPress={onWish} />
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text variant="title" numberOfLines={2} style={styles.cardTitle}>{product.name}</Text>
          {v ? <Text variant="caption">{v.name}</Text> : null}
        </View>
      </Pressable>
      <View style={styles.cardFooter}>
        {v ? <Text variant="price">{formatNaira(v.price_kobo)}</Text> : <Text variant="caption">Unavailable</Text>}
        {v ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Add ${product.name} to cart`} hitSlop={6} onPress={onAdd} style={styles.addBtn}>
            <Icon name="plus" size={18} color={colors.white} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

export function CartLineRow({ line, onQuantity, onRemove, onPress }: { line: CartLine; onQuantity: (q: number) => void; onRemove: () => void; onPress: () => void }) {
  return (
    <View style={styles.lineRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${line.name}, details`} onPress={onPress}>
        <Photo uri={line.image} fallbackIcon="drop" style={styles.lineThumb} iconSize={22} />
      </Pressable>
      <View style={styles.flex}>
        <View style={styles.lineTop}>
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={2}>{line.name}</Text>
            <Text variant="caption">{line.variantName}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`} hitSlop={12} onPress={onRemove}>
            <Icon name="trash" size={18} color={colors.grey600} />
          </Pressable>
        </View>
        <View style={styles.lineBottom}>
          <Text variant="price">{formatNaira(line.priceKobo)}</Text>
          <Stepper value={line.quantity} onChange={onQuantity} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  strike: { textDecorationLine: 'line-through' },
  card: { padding: 8 },
  cardFlex: { flex: 1 },
  cardPhoto: { height: 132, borderRadius: radii.md, width: '100%' },
  heart: { position: 'absolute', top: 8, right: 8 },
  cardBody: { paddingHorizontal: 4, paddingTop: 10, gap: 2, minHeight: 64 },
  cardTitle: { minHeight: 42 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', gap: 14, paddingVertical: 14 },
  lineThumb: { width: 76, height: 76, borderRadius: radii.md },
  lineTop: { flexDirection: 'row', gap: 8 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
});
