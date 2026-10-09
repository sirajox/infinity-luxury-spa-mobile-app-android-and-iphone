import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { haptics } from '@/lib/haptics';
import { Icon } from './Icon';
import { Text } from './Text';

export function Stepper({ value, onChange, min = 1, max = 99, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean;
}) {
  const set = (v: number) => { haptics.select(); onChange(Math.min(max, Math.max(min, v))); };
  return (
    <View style={styles.wrap} accessibilityRole="adjustable" accessibilityLabel="Quantity" accessibilityValue={{ now: value, min, max }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" disabled={disabled || value <= min} onPress={() => set(value - 1)} style={styles.btn} hitSlop={6}>
        <Icon name="minus" size={16} color={value <= min ? colors.grey400 : colors.black} />
      </Pressable>
      <Text variant="bodyStrong" style={styles.value}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" disabled={disabled || value >= max} onPress={() => set(value + 1)} style={styles.btn} hitSlop={6}>
        <Icon name="plus" size={16} color={value >= max ? colors.grey400 : colors.black} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.grey200, borderRadius: radii.pill, backgroundColor: colors.white },
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 24, textAlign: 'center' },
});
