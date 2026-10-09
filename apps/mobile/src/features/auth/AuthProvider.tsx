import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { toast } from '@/stores/toast';
import { useGuestCart } from '@/stores/guestCart';
import { registerForPush } from '@/features/push/register';
import { handleAuthUrl } from './api';
import { useAuthStore } from './store';

/** Query keys that hold per-user data and must not survive a sign-out. */
const PRIVATE_ROOTS = ['profile', 'bookings', 'booking', 'orders', 'order', 'cart', 'wishlist', 'notifications', 'addresses', 'memberships', 'prefs', 'payments', 'support'];

let signOutRequested = false;
export const markSignOutRequested = () => { signOutRequested = true; };

async function mergeGuestCart() {
  const { lines, clear } = useGuestCart.getState();
  if (lines.length === 0) return;
  const { error } = await supabase.rpc('cart_merge', { p_items: lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })) });
  if (!error) clear();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setSession, setInitialized } = useAuthStore.getState();

  // Session restoration + live auth state
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitialized();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN' && session) {
        // Deferred: calling Supabase from inside this callback can deadlock the client.
        setTimeout(() => {
          void mergeGuestCart().finally(() => void queryClient.invalidateQueries());
          void registerForPush(session.user.id, false).catch(() => undefined);
        }, 0);
      }
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({ predicate: (q) => PRIVATE_ROOTS.includes(String(q.queryKey[0])) });
        if (!signOutRequested) toast.info('Your session expired. Please sign in again.');
        signOutRequested = false;
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [setInitialized, setSession]);

  // Token refresh only while the app is in the foreground (RN has no visibility events).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    void supabase.auth.startAutoRefresh();
    return () => { sub.remove(); void supabase.auth.stopAutoRefresh(); };
  }, []);

  // Auth deep links: email confirmation, OAuth return and password recovery.
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !/auth-callback|reset-password/.test(url)) return;
      try {
        const kind = await handleAuthUrl(url);
        if (kind === 'recovery') router.replace('/(auth)/reset-password');
        else if (kind === 'session') router.replace('/(tabs)');
      } catch {
        toast.error('That link is invalid or has expired. Please request a new one.');
      }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => void handle(e.url));
    return () => sub.remove();
  }, [router]);

  return <>{children}</>;
}
