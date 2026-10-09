import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, type SignUpInput } from '@infinity/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { signUpWithEmail } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import { colors, radii } from '@/theme';

/** Screen 04. Email verification is required before the first sign-in when enabled in Supabase Auth. */
export default function SignUp() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [busy, setBusy] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '', acceptTerms: undefined as unknown as true },
  });

  const submit = handleSubmit(async (v) => {
    setBusy(true);
    try {
      const res = await signUpWithEmail({ email: v.email, password: v.password, fullName: v.fullName, phone: v.phone });
      haptics.success();
      if (res.needsEmailVerification) setVerifyEmail(v.email);
      else router.replace((next && next.startsWith('/') ? next : '/(tabs)') as never);
    } catch (e) {
      haptics.error();
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  });

  if (verifyEmail) {
    return (
      <Screen>
        <EmptyState icon="mail" title="Check your email" body={`We sent a verification link to ${verifyEmail}. Open it on this device to finish creating your account.`} actionLabel="Back to sign in" onAction={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen header={<ScreenHeader title="Create your account" subtitle="Book treatments, track orders and save your favourites." />} contentStyle={styles.form}>
        <Controller control={control} name="fullName" render={({ field }) => (
          <Input label="Full name" placeholder="Aisha Bello" autoComplete="name" textContentType="name" autoCapitalize="words" value={field.value} onChangeText={field.onChange} error={errors.fullName?.message} />
        )} />
        <Controller control={control} name="email" render={({ field }) => (
          <Input label="Email address" placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={field.value} onChangeText={field.onChange} error={errors.email?.message} />
        )} />
        <Controller control={control} name="phone" render={({ field }) => (
          <Input label="Phone number" prefix="+234" placeholder="803 000 0000" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" value={field.value} onChangeText={field.onChange} error={errors.phone?.message} />
        )} />
        <Controller control={control} name="password" render={({ field }) => (
          <Input label="Password" placeholder="At least 8 characters" secureTextEntry textContentType="newPassword" autoComplete="new-password" value={field.value} onChangeText={field.onChange} error={errors.password?.message} />
        )} />
        <Controller control={control} name="confirmPassword" render={({ field }) => (
          <Input label="Confirm password" placeholder="Repeat your password" secureTextEntry textContentType="newPassword" value={field.value} onChangeText={field.onChange} error={errors.confirmPassword?.message} />
        )} />
        <Controller control={control} name="acceptTerms" render={({ field }) => (
          <View style={styles.termsWrap}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: field.value === true }} accessibilityLabel="I agree to the Terms of Use and Privacy Policy" onPress={() => field.onChange(field.value === true ? undefined : true)} style={styles.terms} hitSlop={8}>
              <View style={[styles.box, field.value === true && styles.boxOn]}>
                {field.value === true ? <Icon name="check" size={13} color={colors.white} strokeWidth={2.5} /> : null}
              </View>
              <Text variant="caption" style={styles.flex}>
                I agree to the <Text variant="label" color={colors.goldText} onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'terms-of-use' } })}>Terms of Use</Text> and <Text variant="label" color={colors.goldText} onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'privacy-policy' } })}>Privacy Policy</Text>
              </Text>
            </Pressable>
            {errors.acceptTerms ? <Text variant="caption" color={colors.error}>{errors.acceptTerms.message}</Text> : null}
          </View>
        )} />
        <Button label="Create Account" loading={busy} onPress={() => void submit()} />
        <Text variant="caption" align="center">Already have an account? <Text variant="label" onPress={() => router.replace('/(auth)/sign-in')}>Sign in</Text></Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: 16, paddingBottom: 40 },
  termsWrap: { gap: 6 },
  terms: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: radii.sm - 2, borderWidth: 1.5, borderColor: colors.grey400, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
