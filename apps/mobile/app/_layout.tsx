// Deep imports bundle only the weights the design uses (the package index would ship every weight and italic).
import { Lora_400Regular_Italic } from '@expo-google-fonts/lora/400Regular_Italic';
import { Lora_500Medium } from '@expo-google-fonts/lora/500Medium';
import { Lora_600SemiBold } from '@expo-google-fonts/lora/600SemiBold';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ToastHost } from '@/components/ui/ToastHost';
import { ConfigError, MaintenanceScreen } from '@/components/ui/Gate';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuthStore } from '@/features/auth/store';
import { useMaintenance } from '@/features/account/hooks';
import { useIsStaff } from '@/features/auth/staff';
import { envStatus } from '@/lib/env';
import { track } from '@/lib/analytics';
import { wireOnlineManager } from '@/lib/network';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { initSentry, wrapRoot } from '@/lib/sentry';
import { colors } from '@/theme';
import { useUi } from '@/stores/ui';

void SplashScreen.preventAutoHideAsync();
initSentry();
wireOnlineManager();

function Shell() {
  const router = useRouter();
  const initialized = useAuthStore((s) => s.initialized);
  const hydrated = useUi((s) => s.hydrated);
  const maintenance = useMaintenance();
  const staff = useIsStaff();
  const segments = useSegments();

  useEffect(() => { track({ name: 'app_opened' }); }, []);

  // Tapping a push notification opens the thing it is about.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { booking_id?: string; order_id?: string };
      if (data.booking_id) router.push({ pathname: '/booking/[id]', params: { id: data.booking_id } });
      else if (data.order_id) router.push({ pathname: '/order/[id]', params: { id: data.order_id } });
      else router.push('/notifications');
    });
    return () => sub.remove();
  }, [router]);

  const ready = initialized && hydrated;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  // Maintenance blocks customers everywhere except the sign-in screens, so staff can still authenticate and bypass it.
  const inAuth = (segments[0] as string | undefined) === '(auth)';
  const blocked = !!maintenance.data?.enabled && !staff.data && !inAuth;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.white } }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="booking/confirmed/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="order-confirmed/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack>
      {blocked ? <View style={StyleSheet.absoluteFill}><MaintenanceScreen message={maintenance.data?.message ?? ''} /></View> : null}
      <OfflineBanner />
      <ToastHost />
    </>
  );
}

function Root() {
  const [fontsLoaded, fontError] = useFonts({
    Lora_400Regular_Italic, Lora_500Medium, Lora_600SemiBold, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold,
  });

  // A font failure should degrade to system fonts, never a blank app.
  useEffect(() => { if (fontError) void SplashScreen.hideAsync(); }, [fontError]);
  if (!fontsLoaded && !fontError) return null;
  if (!envStatus.ok) return <ConfigError problems={envStatus.problems} />;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(Root);

const styles = StyleSheet.create({ flex: { flex: 1 } });
