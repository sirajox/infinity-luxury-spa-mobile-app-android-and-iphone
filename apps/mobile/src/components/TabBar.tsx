import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useCartCount } from '@/features/store/hooks';
import { haptics } from '@/lib/haptics';
import { colors, layout } from '@/theme';

export const TAB_ORDER = ['index', 'bookings', 'store', 'orders', 'profile'] as const;

const TABS: Record<(typeof TAB_ORDER)[number], { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  bookings: { label: 'Bookings', icon: 'calendarDays' },
  store: { label: 'Store', icon: 'bag' },
  orders: { label: 'Orders', icon: 'package' },
  profile: { label: 'Profile', icon: 'user' },
};

/** Persistent five-item bottom navigation (design 06). Each tab keeps its own navigation state. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const cartCount = useCartCount();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), height: layout.tabBarHeight + Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const tab = TABS[route.name as keyof typeof TABS];
        if (!tab) return null;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptics.select();
            navigation.navigate(route.name, route.params);
          }
        };
        const color = focused ? colors.goldText : colors.grey600;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={route.name === 'store' && cartCount > 0 ? `${tab.label}, ${cartCount} items in cart` : tab.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.item}
          >
            <View>
              <Icon name={tab.icon} size={22} color={color} strokeWidth={focused ? 1.8 : 1.5} />
              {route.name === 'store' && cartCount > 0 ? (
                <View style={styles.badge}><Text variant="caption" color={colors.white} style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text></View>
              ) : null}
            </View>
            <Text variant="caption" color={color} style={[styles.label, focused && styles.labelActive]}>{tab.label}</Text>
            <View style={[styles.indicator, focused && styles.indicatorOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.grey200, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: layout.minTouch },
  label: { fontSize: 11, lineHeight: 15 },
  labelActive: { fontFamily: 'Poppins_600SemiBold' },
  indicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  indicatorOn: { backgroundColor: colors.gold },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 10, lineHeight: 12, fontFamily: 'Poppins_600SemiBold' },
});
