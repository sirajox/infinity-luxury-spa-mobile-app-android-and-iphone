import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import type { Prefs } from '@/features/account/api';
import { usePrefs, useSavePrefs } from '@/features/account/hooks';
import { useSession } from '@/features/auth/store';
import { pushPermissionStatus, registerForPush } from '@/features/push/register';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors } from '@/theme';

const ROWS: { key: keyof Prefs; title: string; body: string }[] = [
  { key: 'bookings', title: 'Appointments', body: 'Confirmations, reminders and changes to your bookings.' },
  { key: 'orders', title: 'Orders', body: 'Updates as your order is prepared, shipped and delivered.' },
  { key: 'offers', title: 'Offers and news', body: 'Promotions and new arrivals. Off unless you opt in.' },
  { key: 'push_enabled', title: 'Push notifications', body: 'Alerts on this and your other devices.' },
  { key: 'email_enabled', title: 'Email', body: 'Receipts and booking details by email.' },
];

export default function NotificationSettings() {
  const session = useSession();
  const { data, isLoading, isError, error, refetch } = usePrefs();
  const save = useSavePrefs();
  const [perm, setPerm] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  useEffect(() => { void pushPermissionStatus().then(setPerm); }, []);

  return (
    <Screen header={<ScreenHeader title="Notifications" subtitle="Choose what we send you" />} contentStyle={styles.gap}>
      {isLoading ? <SkeletonList rows={5} height={64} /> : isError || !data ? <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /> : (
        <>
          {ROWS.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{r.title}</Text>
                <Text variant="caption">{r.body}</Text>
              </View>
              <Switch accessibilityLabel={r.title} value={data[r.key]} onValueChange={(v) => save.mutate({ ...data, [r.key]: v }, { onError: (e) => toast.error(toUserMessage(e)) })} trackColor={{ true: colors.gold, false: colors.grey200 }} thumbColor={colors.white} />
            </View>
          ))}
          {perm !== 'granted' && session ? (
            <View style={styles.device}>
              <Text variant="bodyStrong">This device</Text>
              <Text variant="caption">{perm === 'denied' ? 'Notifications are blocked in your device settings.' : 'Allow notifications to get appointment reminders on this device.'}</Text>
              {perm !== 'denied' ? <Button label="Allow notifications" compact onPress={() => void registerForPush(session.user.id, true).then((r) => { void pushPermissionStatus().then(setPerm); if (r === 'unsupported') toast.info('Push notifications need a physical device.'); }).catch((e) => toast.error(toUserMessage(e)))} /> : null}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200 },
  device: { gap: 8, marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: colors.goldSoft, alignItems: 'flex-start' },
});
