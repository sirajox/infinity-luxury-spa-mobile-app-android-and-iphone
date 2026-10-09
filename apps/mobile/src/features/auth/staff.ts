import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserId } from './store';

/** True for signed-in users holding any staff role. Used only to let administrators past maintenance mode. */
export function useIsStaff() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['profile', 'is-staff', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_staff');
      if (error) return false;
      return !!data;
    },
    enabled: !!userId,
    select: (v) => v,
    initialData: userId ? undefined : false,
    staleTime: 5 * 60_000,
  });
}
