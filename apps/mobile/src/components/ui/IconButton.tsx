import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { haptics } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: 'outline' | 'dark' | 'solid' | 'soft';
  size?: number;
  badge?: number;
  dot?: boolean;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const tones = {
  outline: { bg: colors.white, fg: colors.black, border: colors.grey200 },
  dark: { bg: colors.black, fg: colors.white, border: colors.black },
  solid: { bg: colors.white, fg: colors.black, border: colors.white },
  soft: { bg: colors.goldSoft, fg: colors.goldText, border: colors.goldSoft },
} as const;

/** Circular icon control. Always at least 44pt to hit; `size` only changes the visible circle. */
export function IconButton({ icon, label, onPress, tone = 'outline', size = 40, badge, dot, filled, style }: IconButtonProps) {
  const t = tones[tone];
  const hit = Math.max(0, (layout.minTouch - size) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hit}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: radii.pill, backgroundColor: t.bg, borderColor: t.border, opacity: pressed ? 0.8 : 1 },
        styles.base,
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={filled ? colors.gold : t.fg} filled={filled} />
      {badge ? (
        <View style={styles.badge}>
          <Text variant="caption" color={colors.white} style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, lineHeight: 12, fontFamily: 'Poppins_600SemiBold' },
  dot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
});
