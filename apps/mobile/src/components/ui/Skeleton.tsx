import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radii } from '@/theme';

/** Pulsing placeholder; falls back to a static block when the user prefers reduced motion. */
export function Skeleton({ width = '100%', height = 16, radius = radii.sm, style }: {
  width?: DimensionValue; height?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduce) opacity.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [reduce, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.grey200 }, animated, style]}
    />
  );
}

export function SkeletonList({ rows = 4, height = 72 }: { rows?: number; height?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={radii.lg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 } });
