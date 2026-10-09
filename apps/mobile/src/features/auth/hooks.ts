import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useSession } from './store';

/**
 * Guests may browse everything; actions that need an identifiable customer call `requireAuth(action)`.
 * Signed-out users are sent to sign-in and returned to the current screen afterwards.
 */
export function useRequireAuth() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (action: () => void) => {
      if (session) action();
      else router.push({ pathname: '/(auth)/sign-in', params: { next: pathname } });
    },
    [session, router, pathname],
  );
}
