import { passwordSchema } from '@infinity/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { updatePassword } from '@/features/auth/api';
import { useSession } from '@/features/auth/store';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';

/** Reached from the recovery email link, which establishes a short-lived session. */
export default function ResetPassword() {
  const router = useRouter();
  const session = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    if (password !== confirm) return setError('Passwords do not match');
    setError(undefined);
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success('Password updated.');
      router.replace('/(tabs)');
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="New password" subtitle={session ? 'Choose a new password for your account.' : 'Open the reset link from your email on this device first.'} />} contentStyle={{ gap: 16 }}>
      <Input label="New password" secureTextEntry textContentType="newPassword" value={password} onChangeText={setPassword} />
      <Input label="Confirm new password" secureTextEntry textContentType="newPassword" value={confirm} onChangeText={setConfirm} error={error} />
      <Button label="Update password" loading={busy} disabled={!session} onPress={() => void submit()} />
    </Screen>
  );
}
