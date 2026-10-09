import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@infinity/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AuthHero, OrDivider, SocialButton } from '@/features/auth/components';
import { appleSignInAvailable, signInWithApple, signInWithEmail, signInWithGoogle } from '@/features/auth/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors, layout } from '@/theme';

/** Screen 03. Browsing never requires an account; this screen is reached on first launch or when an action needs one. */
export default function SignIn() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'apple'>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const done = () => router.replace((next && next.startsWith('/') ? next : '/(tabs)') as never);

  const run = async (kind: 'email' | 'google' | 'apple', fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      const result = await fn();
      if (result !== false) done();
    } catch (e) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        haptics.error();
        toast.error(toUserMessage(e));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={styles.scroll}>
        <AuthHero title="Welcome back" subtitle="Sign in to book treatments and shop skin care" />
        <View style={styles.sheet}>
          <View style={styles.socials}>
            <SocialButton label="Google" icon="google" disabled={busy !== null} onPress={() => void run('google', signInWithGoogle)} />
            <SocialButton label="Phone" icon="phone" disabled={busy !== null} onPress={() => router.push('/(auth)/phone')} />
          </View>
          {appleSignInAvailable ? (
            <View style={styles.socials}>
              <SocialButton label="Apple" icon="user" disabled={busy !== null} onPress={() => void run('apple', signInWithApple)} />
            </View>
          ) : null}
          <OrDivider label="or sign in with email" />
          <Controller control={control} name="email" render={({ field }) => (
            <Input label="Email address" placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.email?.message} />
          )} />
          <Controller control={control} name="password" render={({ field }) => (
            <Input label="Password" placeholder="Your password" secureTextEntry autoComplete="current-password" textContentType="password"
              value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.password?.message} onSubmitEditing={handleSubmit((v) => run('email', () => signInWithEmail(v.email, v.password)))} />
          )} />
          <Pressable accessibilityRole="link" accessibilityLabel="Forgot password" onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgot} hitSlop={10}>
            <Text variant="label" color={colors.goldText}>Forgot password?</Text>
          </Pressable>
          <Button label="Sign In" loading={busy === 'email'} disabled={busy !== null && busy !== 'email'} onPress={handleSubmit((v) => run('email', () => signInWithEmail(v.email, v.password)))} />
          <View style={styles.center}>
            <Text variant="caption">New here? <Text variant="label" onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { next } })}>Create an account</Text></Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Continue as guest" onPress={() => router.replace('/(tabs)')} hitSlop={10} style={styles.guest}>
              <Text variant="label" color={colors.goldText}>Continue as guest</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#161614' },
  scroll: { flexGrow: 1 },
  sheet: { flex: 1, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.white, padding: layout.screenPadding, gap: 16, paddingBottom: 40 },
  socials: { flexDirection: 'row', gap: 12 },
  forgot: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6 },
  guest: { minHeight: layout.minTouch, justifyContent: 'center' },
});
