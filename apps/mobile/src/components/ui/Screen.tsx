import { ScrollView, StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, layout } from '@/theme';

type Tone = 'white' | 'warm' | 'dark';
const bg: Record<Tone, string> = { white: colors.white, warm: colors.warm, dark: colors.black };

export interface ScreenProps {
  children: React.ReactNode;
  tone?: Tone;
  scroll?: boolean;
  padded?: boolean;
  /** Pinned bottom content (primary action). Sits above the home indicator. */
  footer?: React.ReactNode;
  edges?: Edge[];
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  header?: React.ReactNode;
}

export function Screen({
  children, tone = 'white', scroll = true, padded = true, footer, edges = ['top', 'left', 'right'], refreshControl, contentStyle, header,
}: ScreenProps) {
  const inner = [padded && styles.padded, contentStyle];
  return (
    <SafeAreaView edges={footer ? edges : [...edges, 'bottom'].filter((e, i, a) => a.indexOf(e) === i) as Edge[]} style={[styles.root, { backgroundColor: bg[tone] }]}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, ...inner]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, ...inner]}>{children}</View>
      )}
      {footer ? (
        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: tone === 'dark' ? colors.black : colors.white }]}>
          <View style={styles.footerInner}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  padded: { paddingHorizontal: layout.screenPadding },
  scrollContent: { paddingBottom: 32, flexGrow: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.grey200 },
  footerInner: { paddingHorizontal: layout.screenPadding, paddingTop: 12, paddingBottom: 8, gap: 10 },
});
