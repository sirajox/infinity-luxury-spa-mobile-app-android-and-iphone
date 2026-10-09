import { Pressable, StyleSheet } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={() => { haptics.select(); onPress?.(); }}
      style={[styles.base, selected ? styles.on : styles.off]}
    >
      <Text variant="label" color={selected ? colors.white : colors.black}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: layout.minTouch - 4, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.black, borderColor: colors.black },
  off: { backgroundColor: colors.white, borderColor: colors.grey200 },
});
