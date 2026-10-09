import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Appointments & orders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#A68917',
  });
}

export async function pushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

async function currentToken(): Promise<string | null> {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null; // EAS project not linked yet; push is skipped rather than failing.
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Registers (or refreshes) this device's push token. When `prompt` is false it never shows a permission dialog,
 * which makes it safe to call silently at every sign-in to handle token rotation.
 */
export async function registerForPush(userId: string, prompt: boolean): Promise<'registered' | 'denied' | 'unsupported'> {
  if (!Device.isDevice) return 'unsupported';
  await ensureAndroidChannel();
  let status = await pushPermissionStatus();
  if (status !== 'granted' && prompt) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const token = await currentToken();
  if (!token) return 'unsupported';
  const { error } = await supabase.from('device_tokens').upsert(
    { user_id: userId, expo_push_token: token, platform: Platform.OS === 'ios' ? 'ios' : 'android', last_seen_at: new Date().toISOString(), invalid_at: null },
    { onConflict: 'expo_push_token' },
  );
  if (error) throw error;
  return 'registered';
}

/** Stop pushes to this device for the account that is signing out. */
export async function unregisterPush() {
  try {
    const token = await currentToken();
    if (token) await supabase.from('device_tokens').delete().eq('expo_push_token', token);
  } catch {
    // Best effort: an invalid token is cleaned up server-side on the next failed delivery.
  }
}
