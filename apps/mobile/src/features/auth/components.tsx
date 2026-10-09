import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native';
import { colors, radii } from '@/theme';
import { PatternPlaceholder } from '@/components/ui/Photo';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require('../../../assets/images/logo.png') as number;

/** Dark patterned hero used by the sign-in family of screens (design 03). */
export function AuthHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.hero}>
      <PatternPlaceholder dark icon="lotus" iconSize={0} style={StyleSheet.absoluteFill} />
      <Image source={logo} style={styles.logo} contentFit="cover" accessibilityLabel="Infinity Luxury Spa logo" />
      <Text variant="h1" color={colors.white} align="center" accessibilityRole="header">{title}</Text>
      <Text variant="body" color={colors.onDarkMuted} align="center">{subtitle}</Text>
    </View>
  );
}

export function SocialButton({ label, icon, onPress, disabled }: { label: string; icon: IconName | 'google'; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => { haptics.tap(); onPress(); }}
      style={({ pressed }) => [styles.social, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {icon === 'google' ? <GoogleMark /> : <Icon name={icon} size={18} />}
      <Text variant="bodyStrong">{label}</Text>
    </Pressable>
  );
}

/** Four-colour "G" drawn in text to avoid shipping third-party brand artwork. */
function GoogleMark() {
  return <Text style={styles.g}>G</Text>;
}

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <Text variant="caption">{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#161614', alignItems: 'center', paddingTop: 72, paddingBottom: 56, paddingHorizontal: 24, gap: 10, overflow: 'hidden' },
  logo: { width: 60, height: 60, borderRadius: 30, marginBottom: 6 },
  social: { flex: 1, minHeight: 52, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.grey200, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.white },
  g: { fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: '#4285F4' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.grey200 },
});
