import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme';
import { useUi } from '@/stores/ui';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require('../assets/images/logo.png') as number;

const SPLASH_MS = 1600;

/** Screen 01. Holds briefly on brand, then routes: first launch → onboarding, otherwise straight to the app. */
export default function Splash() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const onboardingSeen = useUi((s) => s.onboardingSeen);
  const progress = useSharedValue(0);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  useEffect(() => {
    progress.value = withTiming(1, { duration: reduce ? 0 : SPLASH_MS, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(() => router.replace(onboardingSeen ? '/(tabs)' : '/onboarding'), reduce ? 400 : SPLASH_MS);
    return () => clearTimeout(t);
  }, [onboardingSeen, reduce, router, progress]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.logoRing}>
          <Image source={logo} style={styles.logo} contentFit="cover" accessibilityLabel="Infinity Luxury Spa logo" />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(250).duration(500)} style={styles.textBlock}>
          <Text variant="h1" color={colors.white} align="center" accessibilityRole="header">Infinity Luxury Spa</Text>
          <Text variant="caption" color={colors.onDarkMuted} style={styles.sub}>& AESTHETICS</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline} align="center">Where Endless Beauty Begins</Text>
        </Animated.View>
      </View>
      <View style={styles.footer}>
        <View style={styles.track}><Animated.View style={[styles.bar, bar]} /></View>
        <Text variant="caption" color={colors.onDarkMuted} align="center">Abuja, Kano, Kaduna and Sokoto</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  logoRing: { width: 132, height: 132, borderRadius: 66, borderWidth: 1, borderColor: 'rgba(166,137,23,0.5)', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 116, height: 116, borderRadius: 58 },
  textBlock: { alignItems: 'center', gap: 6 },
  sub: { letterSpacing: 4 },
  rule: { width: 56, height: 1, backgroundColor: colors.goldText, marginVertical: 16 },
  tagline: { fontFamily: fonts.headingItalic, fontSize: 17, color: colors.gold, lineHeight: 24 },
  footer: { paddingHorizontal: 90, paddingBottom: 36, gap: 14 },
  track: { height: 2, backgroundColor: colors.onDarkFaint, borderRadius: 1, overflow: 'hidden' },
  bar: { height: 2, backgroundColor: colors.gold },
});
