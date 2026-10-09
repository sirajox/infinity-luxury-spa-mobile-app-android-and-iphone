import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { PatternPlaceholder } from '@/components/ui/Photo';
import { Text } from '@/components/ui/Text';
import { useTourSteps } from '@/features/account/hooks';
import { colors, layout, radii } from '@/theme';
import { useUi } from '@/stores/ui';

/** Used only if the CMS content cannot be loaded on a first, offline launch. */
const FALLBACK = [
  { id: 'f1', title: 'Book your treatment at any Infinity branch', body: 'Choose a treatment, your city and the staff member you trust, then pick a time that suits you.' },
  { id: 'f2', title: 'Shop skin care chosen by our therapists', body: 'Serums, creams and gift sets, delivered to you or ready for pickup at your branch.' },
  { id: 'f3', title: 'Everything in one place', body: 'Manage bookings, track orders and keep your preferences up to date.' },
];

/** Screen 02. Slide copy is managed in the admin dashboard (tour_steps, kind = onboarding). */
export default function Onboarding() {
  const router = useRouter();
  const markSeen = useUi((s) => s.setOnboardingSeen);
  const { data } = useTourSteps('onboarding');
  const slides = data && data.length > 0 ? data : FALLBACK;
  const [index, setIndex] = useState(0);
  const slide = slides[Math.min(index, slides.length - 1)]!;
  const last = index >= slides.length - 1;

  const finish = () => {
    markSeen();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <PatternPlaceholder icon="lotus" iconSize={36} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['top']} style={styles.skipWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction" onPress={finish} style={styles.skip} hitSlop={8}>
            <Text variant="label">Skip</Text>
          </Pressable>
        </SafeAreaView>
      </View>
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${slides.length}`}>
          {slides.map((s, i) => <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />)}
        </View>
        <Animated.View key={slide.id} entering={FadeIn.duration(250)} exiting={FadeOut.duration(120)} style={styles.copy}>
          <Text variant="h1" accessibilityRole="header">{slide.title}</Text>
          <Text variant="body">{slide.body}</Text>
        </Animated.View>
        <Button label={last ? 'Get started' : 'Next'} onPress={() => (last ? finish() : setIndex((i) => i + 1))} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  hero: { flex: 1.1, backgroundColor: '#EFE7CF' },
  skipWrap: { position: 'absolute', top: 0, right: 0, paddingRight: 20, paddingTop: 8 },
  skip: { minHeight: layout.minTouch - 4, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.white, paddingHorizontal: layout.screenPadding, paddingTop: 28, gap: 18 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.grey200 },
  dotActive: { width: 24, backgroundColor: colors.black },
  copy: { gap: 10, minHeight: 150 },
});
