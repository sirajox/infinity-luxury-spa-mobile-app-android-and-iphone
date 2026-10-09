import { Pressable, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function ListRow({ icon, label, value, onPress, destructive, trailing }: {
  icon: IconName; label: string; value?: string; onPress?: () => void; destructive?: boolean; trailing?: React.ReactNode;
}) {
  const fg = destructive ? colors.error : colors.black;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={20} color={fg} />
      <Text variant="bodyStrong" color={fg} style={styles.label}>{label}</Text>
      {value ? <Text variant="caption">{value}</Text> : null}
      {trailing ?? <Icon name="chevronRight" size={18} color={colors.grey400} />}
    </Pressable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: { minHeight: layout.minTouch + 8, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  label: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.grey200 },
});
