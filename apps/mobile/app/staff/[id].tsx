import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Photo } from '@/components/ui/Photo';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { TreatmentRow } from '@/features/catalog/components';
import { useBranches, useStaff, useStaffReviews, useStaffTreatments } from '@/features/catalog/hooks';
import { toUserMessage } from '@/lib/errors';
import { callPhone, openDirections, openWhatsApp, shareText } from '@/lib/links';
import { useBookingDraft } from '@/stores/bookingDraft';
import { colors, layout, radii } from '@/theme';

type Tab = 'about' | 'treatments' | 'reviews';

/** Screen 13: staff profile with About / Treatments / Reviews. */
export default function StaffProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useStaff(id);
  const treatments = useStaffTreatments(id);
  const reviews = useStaffReviews(id);
  const branches = useBranches();
  const draft = useBookingDraft();
  const [tab, setTab] = useState<Tab>('about');

  if (staff.isLoading) return <Screen><SkeletonList rows={4} height={90} /></Screen>;
  if (staff.isError) return <Screen><ErrorState message={toUserMessage(staff.error)} onRetry={() => void staff.refetch()} /></Screen>;
  if (!staff.data) return <Screen><EmptyState icon="user" title="Profile not found" actionLabel="Go back" onAction={() => router.back()} /></Screen>;

  const s = staff.data;
  const first = s.full_name.split(' ')[0] ?? s.full_name;
  const home = branches.data?.find((b) => b.id === s.branches[0]?.id);
  const phone = s.whatsapp ?? s.phone ?? home?.whatsapp ?? home?.phone ?? null;
  const inFlow = !!draft.service && !!draft.branch;
  const eligible = inFlow && (treatments.data ?? []).some((t) => t.id === draft.service?.id);

  return (
    <Screen
      tone="warm" padded={false}
      footer={inFlow ? (
        <Button label={eligible ? `Choose ${first}` : `${first} is not offered for this treatment`} disabled={!eligible}
          onPress={() => { draft.setStaff({ id: s.id, fullName: s.full_name }); router.push('/booking/datetime'); }} />
      ) : undefined}
    >
      <View style={styles.hero}>
        <IconButton icon="chevronLeft" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Rating average={s.rating_average} count={s.review_count} size={14} />
            <Text variant="h1" accessibilityRole="header">{s.full_name}</Text>
            <Text variant="caption">{s.job_title}{s.branches[0] ? `, ${s.branches.map((b) => b.name).join(' · ')}` : ''}</Text>
            <View style={styles.tags}>{s.specialties.map((t) => <Badge key={t} label={t} tone="gold" />)}</View>
          </View>
          <Photo uri={s.photo_url} fallbackIcon="user" fallbackLabel="Portrait coming soon" alt={`Portrait of ${s.full_name}`} style={styles.portrait} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.actions}>
          <Action icon="phone" label="Call" disabled={!phone} onPress={() => phone && void callPhone(phone)} />
          <Action icon="chat" label="WhatsApp" disabled={!phone} onPress={() => phone && void openWhatsApp(phone, `Hello, I would like to book with ${s.full_name}.`)} />
          <Action icon="directions" label="Directions" disabled={!home} onPress={() => home && void openDirections({ ...home, name: home.name })} />
          <Action icon="share" label="Share" onPress={() => void shareText(`Meet ${s.full_name}, ${s.job_title} at Infinity Luxury Spa & Aesthetics.`)} />
        </View>

        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'about', label: 'About' }, { value: 'treatments', label: 'Treatments' }, { value: 'reviews', label: 'Reviews' }]} />

        {tab === 'about' ? (
          s.bio ? <Text variant="body">{s.bio}</Text> : <Text variant="caption">This specialist has not added a biography yet.</Text>
        ) : tab === 'treatments' ? (
          treatments.isLoading ? <SkeletonList rows={2} /> : (treatments.data?.length ?? 0) === 0 ? <Text variant="caption">No treatments listed yet.</Text> : (
            <View style={styles.list}>
              {treatments.data?.map((t) => (
                <TreatmentRow key={t.id} service={t}
                  onPress={() => router.push({ pathname: '/treatment/[slug]', params: { slug: t.slug } })}
                  onBook={() => { draft.start({ id: t.id, slug: t.slug, name: t.name, durationMinutes: t.duration_minutes, priceKobo: t.price_kobo ?? 0, priceType: t.price_type, thumbnailUrl: t.thumbnail_url }); draft.setStaff({ id: s.id, fullName: s.full_name }); router.push('/booking/city'); }} />
              ))}
            </View>
          )
        ) : reviews.isLoading ? <SkeletonList rows={2} /> : (reviews.data?.length ?? 0) === 0 ? (
          <Text variant="caption">No reviews yet. Reviews appear after completed appointments.</Text>
        ) : (
          <View style={styles.list}>
            {reviews.data?.map((r) => (
              <View key={r.id} style={styles.review}>
                <View style={styles.reviewHead}><Text variant="bodyStrong">{r.reviewer_name ?? 'Customer'}</Text><Rating average={r.rating} count={1} size={11} /></View>
                {r.body ? <Text variant="body">{r.body}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function Action({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: 0.4 }]}>
      <Icon name={icon} size={20} color={colors.goldText} />
      <Text variant="caption" color={colors.black}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.warm, paddingHorizontal: layout.screenPadding, paddingTop: 8, paddingBottom: 20, gap: 16 },
  heroRow: { flexDirection: 'row', gap: 12 },
  heroText: { flex: 1, gap: 6, justifyContent: 'flex-end' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  portrait: { width: 140, height: 200, borderRadius: radii.lg },
  body: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: layout.screenPadding, gap: 18, flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 68, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.grey200, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 6 },
  list: { gap: 12 },
  review: { gap: 6, paddingVertical: 8 },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
