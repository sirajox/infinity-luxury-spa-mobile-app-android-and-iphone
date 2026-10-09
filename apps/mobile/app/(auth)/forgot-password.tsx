import { emailSchema } from '@infinity/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/State';
import { requestPasswordReset } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setBusy(true);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        {/* Same message whether or not the address exists, so the form cannot be used to discover accounts. */}
        <EmptyState icon="mail" title="Check your email" body="If an account exists for that address, we have sent a link to reset your password." actionLabel="Back to sign in" onAction={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }
  return (
    <Screen header={<ScreenHeader title="Reset password" subtitle="Enter your email and we will send you a link to choose a new password." />} contentStyle={{ gap: 20 }}>
      <Input label="Email address" placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} error={error} />
      <Button label="Send reset link" loading={busy} onPress={() => void submit()} />
    </Screen>
  );
}
