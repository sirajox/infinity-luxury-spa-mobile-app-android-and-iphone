import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { SignInPrompt } from '@/components/ui/SignInPrompt';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/features/account/Avatar';
import { useProfile, useProfileStats } from '@/features/account/hooks';
import { markSignOutRequested } from '@/features/auth/AuthProvider';
import { signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/store';
import { useBranches } from '@/features/catalog/hooks';
import { unregisterPush } from '@/features/push/register';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors, layout } from '@/theme';

/** Screen 25: profile. */
export default function Profile() {
  const router = useRouter();
  const session = useSession();
  const profile = useProfile();
  const stats = useProfileStats();
  const branches = useBranches();
  const [confirmOut, setConfirmOut] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <Screen>
        <SignInPrompt icon="user" title="Your Infinity account" body="Sign in to manage your bookings, orders, addresses and preferences." />
      </Screen>
    );
  }

  const p = profile.data;
  const preferred = branches.data?.find((b) => b.id === p?.preferred_branch_id)?.name;
  const logout = async () => {
    setBusy(true);
    try {
      await unregisterPush(); // stop pushes to this device for the departing account
      markSignOutRequested();
      await signOut();
      setConfirmOut(false);
      router.replace('/(tabs)');
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false} tone="white">
      <View style={styles.hero}>
        <Avatar path={p?.avatar_url} />
        <View style={styles.heroText}>
          <Text variant="h2" numberOfLines={1} accessibilityRole="header">{p?.full_name ?? session.user.email?.split('@')[0] ?? 'Welcome'}</Text>
          <Text variant="caption" numberOfLines={1}>{p?.email ?? session.user.email}</Text>
          {p?.phone ? <Text variant="caption">{p.phone}</Text> : null}
        </View>
        <IconButton icon="edit" label="Edit personal information" onPress={() => router.push('/account/personal')} />
      </View>
      <View style={styles.stats}>
        <Stat value={stats.data?.bookings} label="Bookings" />
        <Stat value={stats.data?.orders} label="Orders" />
        <Stat value={stats.data?.wishlist} label="Wishlist" />
      </View>

      <View style={styles.menu}>
        <ListRow icon="user" label="Personal information" onPress={() => router.push('/account/personal')} />
        <Divider />
        <ListRow icon="pin" label="Saved addresses" onPress={() => router.push('/account/addresses')} />
        <Divider />
        <ListRow icon="heart" label="Wishlist" onPress={() => router.push('/account/wishlist')} />
        <Divider />
        <ListRow icon="sparkle" label="Membership" onPress={() => router.push('/memberships')} />
        <Divider />
        <ListRow icon="bell" label="Notifications" onPress={() => router.push('/account/notification-settings')} />
        <Divider />
        <ListRow icon="home" label="Preferred branch" value={preferred ?? 'Not set'} onPress={() => router.push('/account/preferred-branch')} />
        <Divider />
        <ListRow icon="help" label="Help & Support" onPress={() => router.push('/support')} />
        <Divider />
        <ListRow icon="shield" label="Privacy & account" onPress={() => router.push('/privacy')} />
        <Divider />
        <ListRow icon="logout" label="Log out" onPress={() => setConfirmOut(true)} destructive />
      </View>

      <Sheet visible={confirmOut} onClose={() => setConfirmOut(false)}>
        <Text variant="h2">Log out?</Text>
        <Text variant="body">You can sign back in at any time. Your cart and bookings stay safe on your account.</Text>
        <View style={styles.row}>
          <Button label="Stay signed in" variant="outline" style={styles.flex} onPress={() => setConfirmOut(false)} />
          <Button label="Log out" style={styles.flex} loading={busy} onPress={() => void logout()} />
        </View>
      </Sheet>
    </Screen>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value ?? 0} ${label}`}>
      <Text variant="h2">{value ?? '–'}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { backgroundColor: colors.warm, flexDirection: 'row', alignItems: 'center', gap: 16, padding: layout.screenPadding, paddingTop: 24 },
  heroText: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', backgroundColor: colors.warm, paddingBottom: 20 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  menu: { paddingHorizontal: layout.screenPadding, paddingTop: 8 },
  row: { flexDirection: 'row', gap: 10 },
});
