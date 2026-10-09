import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { useProfile, useUpdateProfile } from '@/features/account/hooks';
import { useSession } from '@/features/auth/store';
import { BranchOption } from '@/features/catalog/components';
import { useBranches } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { useUi } from '@/stores/ui';

/** The preferred branch pre-selects bookings and drives store stock and cart quotes. */
export default function PreferredBranch() {
  const router = useRouter();
  const session = useSession();
  const branches = useBranches();
  const profile = useProfile();
  const update = useUpdateProfile();
  const setLocal = useUi((s) => s.setPreferredBranch);
  const localId = useUi((s) => s.preferredBranchId);
  const selected = profile.data?.preferred_branch_id ?? localId;

  const choose = (id: string) => {
    setLocal(id);
    if (!session) { router.back(); return; }
    update.mutate({ preferred_branch_id: id }, { onSuccess: () => { toast.success('Preferred branch updated.'); router.back(); }, onError: (e) => toast.error(toUserMessage(e)) });
  };

  return (
    <Screen header={<ScreenHeader title="Preferred branch" subtitle="We will use this by default" />} contentStyle={styles.gap}>
      {branches.isLoading ? <SkeletonList rows={4} height={92} /> : branches.isError ? <ErrorState message={toUserMessage(branches.error)} onRetry={() => void branches.refetch()} /> : (
        <View style={styles.gap}>{branches.data?.map((b) => <BranchOption key={b.id} branch={b} selected={selected === b.id} onSelect={() => choose(b.id)} />)}</View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ gap: { gap: 12 } });
