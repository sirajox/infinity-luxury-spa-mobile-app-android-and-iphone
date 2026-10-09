import { useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { colors, layout, radii } from '@/theme';
import { useIsOnline } from '@/lib/network';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Persistent offline indicator. Cached catalogue/content may still render, but it is labelled as saved data;
 * availability, stock, prices at checkout and payment state are never served from cache for transactions.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + layout.tabBarHeight + 12 }]}>
      <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={styles.pill} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon name="wifiOff" size={18} color={colors.gold} />
        <Text variant="caption" color={colors.white} style={styles.text}>You are offline. Showing saved data.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry connection"
          hitSlop={12}
          onPress={() => { void NetInfo.refresh().then(() => queryClient.refetchQueries({ type: 'active' })); }}
        >
          <Text variant="label" color={colors.gold}>Retry</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.black, borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 14 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
