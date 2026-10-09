import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';

WebBrowser.maybeCompleteAuthSession();

export const authRedirects = {
  callback: () => Linking.createURL('auth-callback'),
  reset: () => Linking.createURL('reset-password'),
};

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(input: { email: string; password: string; fullName: string; phone: string }) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, phone: input.phone },
      emailRedirectTo: authRedirects.callback(),
    },
  });
  if (error) throw error;
  // With email confirmation enabled there is no session until the link is opened.
  return { needsEmailVerification: !data.session };
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirects.reset() });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Re-authenticate with the current password before a sensitive action (change password, delete account). */
export async function reauthenticate(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AppError('invalid_credentials');
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signInWithGoogle() {
  const redirectTo = authRedirects.callback();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw error ?? new Error('Google sign-in is unavailable');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await handleAuthUrl(result.url);
  return true;
}

export const appleSignInAvailable = Platform.OS === 'ios';

export async function signInWithApple() {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashed,
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
  if (error) throw error;
}

/** Phone OTP (requires an SMS provider to be configured in Supabase Auth). */
export async function requestPhoneOtp(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
}

export type AuthUrlKind = 'recovery' | 'session' | null;

/** Handles auth deep links: PKCE codes (OAuth, email confirmation) and token fragments (recovery). */
export async function handleAuthUrl(url: string): Promise<AuthUrlKind> {
  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};
  const fragment = url.includes('#') ? new URLSearchParams(url.split('#')[1]) : null;

  const code = typeof query.code === 'string' ? query.code : null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return parsed.path?.includes('reset-password') ? 'recovery' : 'session';
  }
  const access = fragment?.get('access_token');
  const refresh = fragment?.get('refresh_token');
  if (access && refresh) {
    const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    if (error) throw error;
    return fragment?.get('type') === 'recovery' ? 'recovery' : 'session';
  }
  return null;
}
