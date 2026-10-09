import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({ icon = 'bag', title, body, actionLabel, onAction }: {
  icon?: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.circle}>
        <Icon name={icon} size={36} color={colors.gold} />
      </View>
      <Text variant="h2" align="center">{title}</Text>
      {body ? <Text variant="body" align="center" style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={[styles.circle, { backgroundColor: colors.errorSoft }]}>
        <Icon name="alert" size={32} color={colors.error} />
      </View>
      <Text variant="h3" align="center">We hit a snag</Text>
      <Text variant="body" align="center" style={styles.body}>{message}</Text>
      {onRetry ? <Button label="Try again" icon="refresh" variant="outline" onPress={onRetry} compact style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 10 },
  circle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  body: { maxWidth: 300 },
  action: { marginTop: 14, minWidth: 180 },
});
