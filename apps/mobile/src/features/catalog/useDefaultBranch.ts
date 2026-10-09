import { useMemo } from 'react';
import { useProfile } from '@/features/account/hooks';
import { useUi } from '@/stores/ui';
import { useBranches } from './hooks';

/** The branch used for stock display and cart quotes: preferred branch, else the main branch. */
export function useDefaultBranch() {
  const branches = useBranches();
  const profile = useProfile();
  const preferredLocal = useUi((s) => s.preferredBranchId);
  const branch = useMemo(() => {
    const list = branches.data ?? [];
    return list.find((b) => b.id === (profile.data?.preferred_branch_id ?? preferredLocal)) ?? list.find((b) => b.is_main) ?? list[0] ?? null;
  }, [branches.data, profile.data?.preferred_branch_id, preferredLocal]);
  return { branch, branches: branches.data ?? [], isLoading: branches.isLoading };
}
