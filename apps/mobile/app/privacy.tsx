import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Switch, View } from 'react-native';
import { colors, radii } from '@/theme';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { deleteAccount, exportMyData } from '@/features/account/api';
import { usePrefs, useSavePrefs } from '@/features/account/hooks';
import { markSignOutRequested } from '@/features/auth/AuthProvider';
import { useSession } from '@/features/auth/store';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';

/** Screen 28: privacy, data export and account deletion (re-authenticated by password or typed confirmation). */
export default function Privacy() {
  const router = useRouter();
  const session = useSession();
  const prefs = usePrefs();
  const savePrefs = useSavePrefs();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const hasPassword = session?.user.identities?.some((i) => i.provider === 'email') ?? true;

  const exportData = async () => {
    setExporting(true);
    try {
      const json = await exportMyData();
      await Share.share({ title: 'My Infinity data', message: json });
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteAccount(hasPassword ? { password } : { confirm: typed });
      haptics.success();
      markSignOutRequested();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      queryClient.clear();
      setConfirm(false);
      toast.success('Your account has been deleted.');
      router.replace('/(tabs)');
    } catch (e) {
      haptics.error();
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Privacy & account" />} contentStyle={styles.gap}>
      <View>
        <ListRow icon="file" label="Privacy Policy" onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'privacy-policy' } })} />
        <Divider />
        <ListRow icon="file" label="Terms of Use" onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'terms-of-use' } })} />
        <Divider />
        <ListRow icon="file" label="Cancellation Policy" onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'cancellation-policy' } })} />
        <Divider />
        <ListRow icon="file" label="Refund Policy" onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'refund-policy' } })} />
        <Divider />
        <ListRow icon="download" label={exporting ? 'Preparing your data…' : 'Download my data'} onPress={() => void exportData()} />
        <Divider />
        {session ? (
          <ListRow
            icon="bell" label="Marketing messages" trailing={
              <Switch
                accessibilityLabel="Marketing messages" value={!!prefs.data?.offers} disabled={!prefs.data}
                onValueChange={(v) => prefs.data && savePrefs.mutate({ ...prefs.data, offers: v })}
                trackColor={{ true: colors.gold, false: colors.grey200 }} thumbColor={colors.white}
              />
            }
          />
        ) : null}
      </View>

      {session ? (
        <View style={styles.danger}>
          <Text variant="title" color={colors.error}>Delete account</Text>
          <Text variant="caption">Removes your profile, saved addresses, wishlist and booking history. Records we must keep by law, such as payment receipts, are kept without your personal details.</Text>
          <Button label="Delete my account" variant="outline" compact onPress={() => setConfirm(true)} style={styles.dangerBtn} />
        </View>
      ) : null}

      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <View style={styles.trash}><Icon name="trash" size={22} color={colors.error} /></View>
        <Text variant="h2">Delete your account?</Text>
        <Text variant="body">This cannot be undone. Upcoming bookings will be cancelled. {hasPassword ? 'Enter your password to confirm.' : 'Type DELETE to confirm.'}</Text>
        {hasPassword
          ? <Input label="Password" icon="lock" secureTextEntry value={password} onChangeText={setPassword} autoComplete="current-password" />
          : <Input label="Type DELETE" value={typed} onChangeText={setTyped} autoCapitalize="characters" />}
        <View style={styles.row}>
          <Button label="Cancel" variant="outline" style={styles.flex} onPress={() => setConfirm(false)} />
          <Button label="Delete" variant="danger" style={styles.flex} loading={busy} disabled={hasPassword ? password.length < 1 : typed !== 'DELETE'} onPress={() => void remove()} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 20 },
  row: { flexDirection: 'row', gap: 12 },
  danger: { borderWidth: 1, borderColor: '#F0C7C3', backgroundColor: colors.errorSoft, borderRadius: radii.lg, padding: 16, gap: 8 },
  dangerBtn: { alignSelf: 'flex-start', borderColor: colors.error },
  trash: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.errorSoft, alignItems: 'center', justifyContent: 'center' },
});
