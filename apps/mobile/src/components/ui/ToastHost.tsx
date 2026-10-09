import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radii } from '@/theme';
import { useToast } from '@/stores/toast';
import { Icon } from './Icon';
import { Text } from './Text';

/** Transient feedback pill, announced to screen readers. Mount once at the root. */
export function ToastHost() {
  const { id, message, tone, hide } = useToast();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3800);
    return () => clearTimeout(t);
  }, [id, message, hide]);

  if (!message) return null;
  const icon = tone === 'error' ? 'alert' : tone === 'success' ? 'checkCircle' : 'wifi';
  const color = tone === 'error' ? '#FF8A80' : tone === 'success' ? '#7FD1A0' : colors.gold;
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + layout.tabBarHeight + 16 }]}>
      <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={styles.pill} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Icon name={icon} size={18} color={color} />
        <Text variant="caption" color={colors.white} style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.black, borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 420 },
  text: { flexShrink: 1, fontFamily: 'Poppins_500Medium', fontSize: 13, lineHeight: 18 },
});
