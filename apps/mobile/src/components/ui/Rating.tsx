import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Shows nothing for items without approved reviews: ratings are never fabricated. */
export function Rating({ average, count, size = 12 }: { average?: number | string | null; count?: number | null; size?: number }) {
  if (!count || average == null) return null;
  return (
    <View style={styles.row} accessible accessibilityLabel={`Rated ${average} out of 5 from ${count} reviews`}>
      <Icon name="star" size={size} color={colors.gold} filled strokeWidth={1} />
      <Text variant="label">{Number(average).toFixed(1)}</Text>
      <Text variant="caption">({count})</Text>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 4 } });
