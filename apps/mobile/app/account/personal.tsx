import { nigerianPhone } from '@infinity/core';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { uploadAvatar } from '@/features/account/api';
import { Avatar } from '@/features/account/Avatar';
import { useProfile, useUpdateProfile } from '@/features/account/hooks';
import { useSession } from '@/features/auth/store';
import { queryClient } from '@/lib/queryClient';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors } from '@/theme';

/** Personal information: name, phone and profile photo. Email changes go through Supabase Auth, not this form. */
export default function PersonalInformation() {
  const session = useSession();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  const p = profile.data;
  const nameValue = name ?? p?.full_name ?? '';
  const phoneValue = phone ?? p?.phone?.replace(/^\+234/, '') ?? '';

  const save = () => {
    const parsed = nigerianPhone.safeParse(phoneValue);
    if (nameValue.trim().length < 2) return setError('Enter your full name');
    if (phoneValue && !parsed.success) return setError('Enter a valid Nigerian phone number');
    setError(undefined);
    update.mutate({ full_name: nameValue.trim(), phone: phoneValue ? (parsed.success ? parsed.data : null) : null }, {
      onSuccess: () => toast.success('Profile updated.'),
      onError: (e) => toast.error(toUserMessage(e)),
    });
  };

  const pickPhoto = async () => {
    if (!session) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast.error('Allow photo access in your device settings to choose a picture.');
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (picked.canceled || !picked.assets[0]) return;
      setUploading(true);
      // Resize and re-encode client-side: bounds upload size and strips EXIF location data.
      const out = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 512 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
      const bytes = await (await fetch(out.uri)).arrayBuffer();
      const path = await uploadAvatar(session.user.id, bytes);
      await queryClient.invalidateQueries({ queryKey: ['profile', 'avatar'] });
      update.mutate({ avatar_url: path });
      toast.success('Photo updated.');
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Personal information" />} footer={<Button label="Save changes" loading={update.isPending} onPress={save} />} contentStyle={styles.gap}>
      <View style={styles.avatarRow}>
        <Avatar path={p?.avatar_url} size={88} />
        <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => void pickPhoto()} disabled={uploading} hitSlop={10}>
          <Text variant="label" color={colors.goldText}>{uploading ? 'Uploading…' : 'Change photo'}</Text>
        </Pressable>
      </View>
      <Input label="Full name" value={nameValue} onChangeText={setName} autoComplete="name" autoCapitalize="words" />
      <Input label="Email address" value={p?.email ?? session?.user.email ?? ''} editable={false} hint="To change your email, contact support." />
      <Input label="Phone number" prefix="+234" keyboardType="phone-pad" value={phoneValue} onChangeText={setPhone} error={error} autoComplete="tel" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  avatarRow: { alignItems: 'center', gap: 10, marginBottom: 6 },
});
