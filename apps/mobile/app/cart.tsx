import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/features/auth/store';
import { useRequireAuth } from '@/features/auth/hooks';
import { useDefaultBranch } from '@/features/catalog/useDefaultBranch';
import { CartLineRow } from '@/features/store/components';
import { useAddToCart, useCart, useQuote } from '@/features/store/hooks';
import { toUserMessage } from '@/lib/errors';
import { formatNaira } from '@/lib/format';
import { toast } from '@/stores/toast';
import { colors, fonts, layout, radii } from '@/theme';

const COUPON_ERRORS = ['coupon_invalid', 'coupon_limit_reached', 'coupon_minimum_not_met', 'coupon_first_order_only'];

/** Screens 21 and 29: the cart and its empty state. Totals shown after sign-in come from the server quote. */
export default function Cart() {
  const router = useRouter();
  const session = useSession();
  const requireAuth = useRequireAuth();
  const cart = useCart();
  const add = useAddToCart();
  const { branch } = useDefaultBranch();
  const [input, setInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const quote = useQuote({ branchId: branch?.id ?? null, fulfilment: 'pickup', coupon, enabled: !!session && cart.lines.length > 0 });

  const couponError = quote.data?.errors.find((e) => COUPON_ERRORS.includes(e));
  const outOfStock = quote.data?.errors.includes('out_of_stock');
  const products = cart.lines.length;
  const discount = coupon && !couponError ? quote.data?.discount_kobo ?? 0 : 0;
  const subtotal = quote.data?.subtotal_kobo ?? cart.subtotalKobo;
  const total = subtotal - discount;

  const apply = () => {
    const code = input.trim().toUpperCase();
    if (!code) return;
    requireAuth(() => setCoupon(code));
  };

  if (!cart.isLoading && cart.lines.length === 0) {
    return (
      <Screen header={<ScreenHeader title="My cart" />}>
        <EmptyState icon="bag" title="Your cart is empty" body="Browse serums, creams and gift sets chosen by our therapists." actionLabel="Shop Skin Care" onAction={() => router.replace('/(tabs)/store')} />
      </Screen>
    );
  }

  return (
    <Screen
      header={<ScreenHeader title="My cart" subtitle={cart.isLoading ? undefined : `${products} product${products === 1 ? '' : 's'}, ${cart.count} item${cart.count === 1 ? '' : 's'}`} />}
      footer={<Button label="Checkout" disabled={cart.isLoading || cart.lines.length === 0 || !!outOfStock} onPress={() => requireAuth(() => router.push({ pathname: '/checkout', params: coupon && !couponError ? { coupon } : {} }))} accessibilityHint={session ? undefined : 'You will be asked to sign in first'} />}
      contentStyle={styles.gap}
    >
      {cart.isLoading ? <SkeletonList rows={3} height={104} /> : cart.isError ? (
        <ErrorState message={toUserMessage(cart.error)} onRetry={() => void cart.refetch()} />
      ) : (
        <>
          <View>
            {cart.lines.map((line) => (
              <CartLineRow key={line.variantId} line={line}
                onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: line.productSlug } })}
                onQuantity={(q) => add.mutate({ variantId: line.variantId, delta: q - line.quantity }, { onError: (e) => toast.error(toUserMessage(e)) })}
                onRemove={() => add.mutate({ variantId: line.variantId, delta: -line.quantity }, { onError: (e) => toast.error(toUserMessage(e)) })} />
            ))}
          </View>

          {outOfStock ? (
            <View style={styles.warn} accessibilityRole="alert">
              <Icon name="alert" size={18} color={colors.error} />
              <Text variant="caption" color={colors.error} style={styles.flex}>Some items are no longer available in the quantity selected at {branch?.name}. Reduce the quantity or remove them to continue.</Text>
            </View>
          ) : null}

          <View style={styles.couponRow}>
            <View style={styles.couponField}>
              <Icon name="tag" size={18} color={colors.grey400} />
              <TextInput
                accessibilityLabel="Coupon code" placeholder="Coupon code" placeholderTextColor={colors.grey400} autoCapitalize="characters" autoCorrect={false}
                value={input} onChangeText={setInput} style={styles.couponInput} onSubmitEditing={apply} editable={!coupon}
              />
              {coupon ? <Pressable accessibilityRole="button" accessibilityLabel="Remove coupon" hitSlop={12} onPress={() => { setCoupon(null); setInput(''); }}><Icon name="close" size={16} color={colors.grey600} /></Pressable> : null}
            </View>
            <Button label={coupon ? 'Applied' : 'Apply'} variant="outline" compact disabled={!!coupon || !input.trim()} loading={quote.isFetching && !!coupon} onPress={apply} />
          </View>
          {couponError ? <Text variant="caption" color={colors.error}>{toUserMessage(new Error(couponError))}</Text> : coupon && quote.data ? <Text variant="caption" color={colors.success}>Coupon {coupon} applied.</Text> : null}
          {!session ? <Text variant="caption">Sign in at checkout to apply coupons and see delivery options.</Text> : null}

          <View style={styles.totals}>
            <Row label="Subtotal" value={formatNaira(subtotal)} />
            <Row label="Delivery" value="Calculated at checkout" muted />
            <Row label="Discount" value={discount ? `-${formatNaira(discount)}` : formatNaira(0)} />
            <View style={styles.rule} />
            <Row label="Total" value={formatNaira(total)} strong />
          </View>
        </>
      )}
    </Screen>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'h3' : 'body'}>{label}</Text>
      <Text variant={strong ? 'h3' : 'bodyStrong'} color={muted ? colors.grey600 : colors.black}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 14 },
  warn: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.errorSoft, borderRadius: radii.lg, padding: 14 },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  couponField: { flex: 1, minHeight: layout.inputHeight, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.grey200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  couponInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.black, paddingVertical: 10 },
  totals: { gap: 12, marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.grey200 },
});
