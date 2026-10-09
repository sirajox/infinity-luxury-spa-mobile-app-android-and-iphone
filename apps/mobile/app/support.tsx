import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, layout, radii } from '@/theme';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useCreateTicket, useFaqs, useSetting, useUpdateProfile } from '@/features/account/hooks';
import { useSession } from '@/features/auth/store';
import { useBranches } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';
import { callPhone, openEmail, openWhatsApp } from '@/lib/links';
import { toast } from '@/stores/toast';

/** Screen 27: help & support. Branch numbers, FAQs and the support email are all admin-managed. */
export default function Support() {
  const router = useRouter();
  const session = useSession();
  const branches = useBranches();
  const faqs = useFaqs();
  const contact = useSetting<{ email: string | null; whatsapp_branch: string }>('support.contact', { email: null, whatsapp_branch: 'abuja' });
  const createTicket = useCreateTicket();
  const updateProfile = useUpdateProfile();
  const [open, setOpen] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const main = branches.data?.find((b) => b.slug === contact.data?.whatsapp_branch) ?? branches.data?.find((b) => b.is_main);
  const mainNumber = main?.whatsapp ?? main?.phone;

  const send = () => {
    if (subject.trim().length < 3 || message.trim().length < 5) return toast.error('Please add a subject and a message.');
    createTicket.mutate({ subject: subject.trim(), message: message.trim(), branchId: main?.id }, {
      onSuccess: () => { toast.success('Thanks. We will get back to you soon.'); setSubject(''); setMessage(''); },
      onError: (e) => toast.error(toUserMessage(e)),
    });
  };

  return (
    <Screen header={<ScreenHeader title="Help & Support" subtitle="Talk to your branch or find a quick answer" />} contentStyle={styles.gap}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="WhatsApp us" disabled={!mainNumber} onPress={() => mainNumber && void openWhatsApp(mainNumber, 'Hello Infinity Luxury Spa, I need some help.')} style={[styles.big, styles.bigDark, !mainNumber && { opacity: 0.4 }]}>
          <Icon name="chat" size={20} color={colors.gold} />
          <Text variant="bodyStrong" color={colors.white}>WhatsApp us</Text>
        </Pressable>
        {contact.data?.email ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Email us" onPress={() => void openEmail(contact.data!.email as string, 'Help with Infinity Luxury Spa')} style={styles.big}>
            <Icon name="mail" size={20} color={colors.goldText} />
            <Text variant="bodyStrong">Email us</Text>
          </Pressable>
        ) : null}
      </View>

      <Text variant="h3">Branches</Text>
      <View>
        {branches.data?.map((b) => (
          <View key={b.id} style={styles.branch}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{b.name} branch</Text>
              <Text variant="caption">{b.phone ?? 'Phone coming soon'}</Text>
            </View>
            <IconButton icon="phone" label={`Call ${b.name} branch`} size={40} onPress={() => b.phone && void callPhone(b.phone)} style={!b.phone && { opacity: 0.4 }} />
            <IconButton icon="chat" label={`WhatsApp ${b.name} branch`} tone="dark" size={40} onPress={() => (b.whatsapp ?? b.phone) && void openWhatsApp((b.whatsapp ?? b.phone) as string)} style={!(b.whatsapp ?? b.phone) && { opacity: 0.4 }} />
          </View>
        ))}
      </View>

      {(faqs.data?.length ?? 0) > 0 ? (
        <>
          <Text variant="h3">Common questions</Text>
          <View>
            {faqs.data?.map((f) => (
              <View key={f.id} style={styles.faq}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === f.id }} accessibilityLabel={f.question} onPress={() => setOpen(open === f.id ? null : f.id)} style={styles.faqHead}>
                  <Text variant="bodyStrong" style={styles.flex}>{f.question}</Text>
                  <Icon name={open === f.id ? 'chevronDown' : 'chevronRight'} size={18} color={colors.grey600} />
                </Pressable>
                {open === f.id ? <Text variant="body" style={styles.answer}>{f.answer}</Text> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text variant="h3">Send us a message</Text>
      {session ? (
        <View style={styles.gap}>
          <Input label="Subject" value={subject} onChangeText={setSubject} maxLength={200} />
          <View style={styles.gap}>
            <Text variant="caption">Message</Text>
            <TextInput accessibilityLabel="Message" multiline value={message} onChangeText={setMessage} maxLength={4000} style={styles.textarea} textAlignVertical="top" placeholder="How can we help?" placeholderTextColor={colors.grey400} />
          </View>
          <Button label="Send message" loading={createTicket.isPending} onPress={send} />
        </View>
      ) : (
        <Button label="Sign in to message us" variant="outline" onPress={() => router.push({ pathname: '/(auth)/sign-in', params: { next: '/support' } })} />
      )}

      {session ? <Button label="Replay app tour" variant="ghost" compact onPress={() => updateProfile.mutate({ tour_completed: false }, { onSuccess: () => router.replace('/(tabs)') })} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  big: { flex: 1, minHeight: 84, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.grey200, padding: 16, justifyContent: 'center', gap: 10 },
  bigDark: { backgroundColor: colors.black, borderColor: colors.black },
  branch: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200 },
  faq: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200 },
  faqHead: { minHeight: layout.minTouch + 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  answer: { paddingBottom: 14 },
  textarea: { minHeight: 120, borderWidth: 1, borderColor: colors.grey200, borderRadius: radii.md, padding: 14, fontFamily: fonts.regular, fontSize: 15, color: colors.black },
});
