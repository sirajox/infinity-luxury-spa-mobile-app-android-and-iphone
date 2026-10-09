import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** Hide the back button (root tab screens). */
  noBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  tone?: 'light' | 'dark';
  eyebrow?: string;
}

/** Back control on top, large Lora title beneath, as in the supplied designs. */
export function ScreenHeader({ title, subtitle, noBack, onBack, right, tone = 'light', eyebrow }: ScreenHeaderProps) {
  const router = useRouter();
  const dark = tone === 'dark';
  return (
    <View style={styles.wrap}>
      {!noBack || right ? (
        <View style={styles.bar}>
          {noBack ? <View /> : (
            <IconButton
              icon="chevronLeft"
              label="Go back"
              tone={dark ? 'solid' : 'outline'}
              onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            />
          )}
          {right}
        </View>
      ) : null}
      {eyebrow ? <Text variant="eyebrow" style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text variant="h1" color={dark ? colors.white : colors.black} accessibilityRole="header">{title}</Text> : null}
      {subtitle ? <Text variant="body" color={dark ? colors.onDarkMuted : colors.grey600}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenPadding, paddingTop: 12, paddingBottom: 12, gap: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 40 },
  eyebrow: { textTransform: 'uppercase' },
});
