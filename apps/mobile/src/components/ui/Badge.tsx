import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Text } from './Text';

type Tone = 'gold' | 'success' | 'neutral' | 'error' | 'dark';

const tones: Record<Tone, { bg: string; fg: string }> = {
  gold: { bg: colors.goldSoft, fg: colors.goldText },
  success: { bg: colors.successSoft, fg: colors.success },
  neutral: { bg: colors.grey50, fg: colors.grey600 },
  error: { bg: colors.errorSoft, fg: colors.error },
  dark: { bg: colors.black, fg: colors.gold },
};

export function Badge({ label, tone = 'gold', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = tones[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      <Text variant="caption" color={t.fg} style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, lineHeight: 15 },
});
