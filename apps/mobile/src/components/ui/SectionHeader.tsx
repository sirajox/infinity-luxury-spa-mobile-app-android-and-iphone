import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Text } from './Text';

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Text variant="h3" accessibilityRole="header">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`${actionLabel}: ${title}`} onPress={onAction} hitSlop={12}>
          <Text variant="label" color={colors.goldText} style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { fontFamily: 'Poppins_600SemiBold' },
});
