import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { haptics } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger' | 'light';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.black, fg: colors.white, border: colors.black },
  gold: { bg: colors.gold, fg: colors.black, border: colors.gold },
  outline: { bg: colors.white, fg: colors.black, border: colors.black },
  ghost: { bg: 'transparent', fg: colors.goldText, border: 'transparent' },
  danger: { bg: colors.error, fg: colors.white, border: colors.error },
  light: { bg: colors.white, fg: colors.black, border: colors.grey200 },
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, compact, style, accessibilityHint }: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: inactive ? 0.45 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={18} color={p.fg} /> : null}
          <Text variant="button" color={p.fg}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.buttonHeight,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: layout.minTouch, paddingHorizontal: 16, borderRadius: radii.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
