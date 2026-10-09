import { nigerianPhone } from '@infinity/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { requestPhoneOtp, verifyPhoneOtp } from '@/features/auth/api';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';

/** Phone sign-in by one-time code. Needs an SMS provider configured in Supabase Auth (see docs/deployment.md). */
export default function PhoneSignIn() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [normalised, setNormalised] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const parsed = nigerianPhone.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setBusy(true);
    try {
      await requestPhoneOtp(parsed.data);
      setNormalised(parsed.data);
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!normalised) return;
    setBusy(true);
    try {
      await verifyPhoneOtp(normalised, code.trim());
      router.replace('/(tabs)');
    } catch (e) {
      setError('That code is not correct or has expired.');
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Sign in with phone" subtitle={normalised ? `Enter the 6-digit code sent to ${normalised}.` : 'We will text you a one-time code.'} />} contentStyle={{ gap: 20 }}>
      {normalised ? (
        <>
          <Input label="Verification code" keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="sms-otp" value={code} onChangeText={setCode} error={error} />
          <Button label="Verify and sign in" loading={busy} disabled={code.trim().length < 6} onPress={() => void verify()} />
          <Button label="Use a different number" variant="ghost" compact onPress={() => { setNormalised(null); setCode(''); }} />
        </>
      ) : (
        <>
          <Input label="Phone number" prefix="+234" placeholder="803 000 0000" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} error={error} />
          <Button label="Send code" loading={busy} onPress={() => void send()} />
        </>
      )}
    </Screen>
  );
}
