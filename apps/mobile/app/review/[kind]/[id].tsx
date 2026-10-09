import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, radii } from '@/theme';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSubmitReview } from '@/features/account/hooks';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';

type Kind = 'service' | 'staff' | 'product';

/** Review form. The database only accepts reviews from customers with a completed booking or delivered order. */
export default function WriteReview() {
  const router = useRouter();
  const { kind, id } = useLocalSearchParams<{ kind: Kind; id: string }>();
  const submit = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');

  const send = () => {
    submit.mutate({ target: kind, id, rating, body }, {
      onSuccess: () => { haptics.success(); toast.success('Thank you. Your review will appear once approved.'); router.back(); },
      onError: (e) => { haptics.error(); toast.error(toUserMessage(e)); },
    });
  };

  return (
    <Screen header={<ScreenHeader title="Write a review" subtitle="Share your experience to help others choose." />} footer={<Button label="Submit review" disabled={rating === 0} loading={submit.isPending} onPress={send} />} contentStyle={styles.gap}>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Rating: ${rating} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} accessibilityState={{ selected: rating === n }} onPress={() => { haptics.select(); setRating(n); }} hitSlop={6} style={styles.star}>
            <Icon name="star" size={36} color={colors.gold} filled={n <= rating} strokeWidth={1.4} />
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Your review" placeholder="Tell us what you liked (optional)" placeholderTextColor={colors.grey400}
        multiline maxLength={2000} value={body} onChangeText={setBody} style={styles.input} textAlignVertical="top"
      />
      <Text variant="caption">Reviews are checked before they are published.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 18 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  star: { padding: 4 },
  input: { minHeight: 140, borderWidth: 1, borderColor: colors.grey200, borderRadius: radii.lg, padding: 14, fontFamily: fonts.regular, fontSize: 15, color: colors.black },
});
