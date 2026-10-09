import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radii } from '@/theme';

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

export function PressableCard({
  onPress, style, children, label, selected,
}: { onPress?: () => void; style?: StyleProp<ViewStyle>; children: React.ReactNode; label: string; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, { opacity: pressed ? 0.9 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.grey200, overflow: 'hidden' },
  selected: { borderColor: colors.black, borderWidth: 1.5 },
});
