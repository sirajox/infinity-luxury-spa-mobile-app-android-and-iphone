import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { TAB_ORDER } from '@/components/TabBar';
import { useSession } from '@/features/auth/store';
import { colors, layout, radii } from '@/theme';
import { useProfile, useTourSteps, useUpdateProfile } from './hooks';

const TARGET_TO_TAB: Record<string, (typeof TAB_ORDER)[number]> = { home: 'index', bookings: 'bookings', store: 'store', orders: 'orders', profile: 'profile' };
const TARGET_ICON: Record<string, IconName> = { home: 'home', bookings: 'calendarDays', store: 'bag', orders: 'package', profile: 'user' };

/**
 * First-time tour (design 05). Shown once after sign-up; completion is stored in profiles.tour_completed and the
 * steps/copy are managed in the admin dashboard. Replayable from Profile → Help & Support.
 */
export function TourOverlay() {
  const session = useSession();
  const profile = useProfile();
  const steps = useTourSteps('tour');
  const update = useUpdateProfile();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  const show = !!session && profile.data?.tour_completed === false && (steps.data?.length ?? 0) > 0;
  if (!show || !steps.data) return null;

  const step = steps.data[Math.min(index, steps.data.length - 1)]!;
  const last = index >= steps.data.length - 1;
  const tabIndex = step.target ? TAB_ORDER.indexOf(TARGET_TO_TAB[step.target] ?? 'index') : -1;
  const barHeight = layout.tabBarHeight + Math.max(insets.bottom, 8);
  const finish = () => update.mutate({ tour_completed: true });

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={styles.overlay} accessibilityViewIsModal>
      {tabIndex >= 0 ? (
        <View pointerEvents="none" style={[styles.ring, { left: (width / 5) * (tabIndex + 0.5) - 32, bottom: barHeight / 2 - 32 + Math.max(insets.bottom, 8) / 2 }]}>
          <Icon name={TARGET_ICON[step.target ?? 'home'] ?? 'home'} size={22} color={colors.goldText} />
        </View>
      ) : null}
      <View style={[styles.card, { marginBottom: barHeight + 18 }]} accessibilityLiveRegion="polite">
        <View style={styles.cardHead}>
          <View style={styles.cardIcon}><Icon name={TARGET_ICON[step.target ?? 'home'] ?? 'sparkle'} size={18} color={colors.gold} /></View>
          <Text variant="h3" style={styles.flex}>{step.title}</Text>
        </View>
        <Text variant="body">{step.body}</Text>
        <View style={styles.footer}>
          <View style={styles.dots}>{steps.data.map((s, i) => <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />)}</View>
          <View style={styles.actions}>
            <Button label="Skip" variant="ghost" compact onPress={finish} />
            <Button label={last ? 'Done' : 'Next'} compact onPress={() => (last ? finish() : setIndex((i) => i + 1))} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay, justifyContent: 'flex-end', paddingHorizontal: 16 },
  ring: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radii.xl, padding: 20, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.grey200 },
  dotOn: { width: 18, backgroundColor: colors.gold },
  actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
