import { zodResolver } from '@hookform/resolvers/zod';
import { NIGERIAN_STATES, deliveryAddressSchema, nigerianPhone } from '@infinity/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import { useAddresses, useProfile, useSaveAddress } from '@/features/account/hooks';
import { useDefaultBranch } from '@/features/catalog/useDefaultBranch';
import { useCreateOrder } from '@/features/orders/hooks';
import { useCart, useQuote } from '@/features/store/hooks';
import { toUserMessage } from '@/lib/errors';
import { formatNaira } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/toast';
import { colors, layout, radii } from '@/theme';

type Fulfilment = 'delivery' | 'pickup';
type AddressForm = z.input<typeof deliveryAddressSchema>;

/** Screen 22: details, location, delivery and pay. Every figure on this screen is the server's quote. */
export default function Checkout() {
  const router = useRouter();
  const { coupon } = useLocalSearchParams<{ coupon?: string }>();
  const cart = useCart();
  const profile = useProfile();
  const addresses = useAddresses();
  const saveAddress = useSaveAddress();
  const createOrder = useCreateOrder();
  const { branch: defaultBranch, branches } = useDefaultBranch();

  const [branchId, setBranchId] = useState<string | null>(null);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('delivery');
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveForLater, setSaveForLater] = useState(true);

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<AddressForm>({
    resolver: zodResolver(deliveryAddressSchema),
    defaultValues: { state: 'FCT', city: '', address: '', landmark: '', phone: '' },
  });
  const state = watch('state');

  const effectiveBranch = branches.find((b) => b.id === (branchId ?? defaultBranch?.id)) ?? null;
  const name = contact?.name ?? profile.data?.full_name ?? '';
  const phone = contact?.phone ?? profile.data?.phone ?? '';
  useEffect(() => { if (!watch('phone') && phone) setValue('phone', phone); }, [phone, setValue, watch]);

  const quote = useQuote({ branchId: effectiveBranch?.id ?? null, fulfilment, state: fulfilment === 'delivery' ? state : null, coupon: coupon ?? null, enabled: cart.lines.length > 0 });
  const q = quote.data;
  const blocking = q?.errors.find((e) => ['out_of_stock', 'delivery_unavailable', 'cart_empty'].includes(e));

  const detailsOk = name.trim().length >= 2 && nigerianPhone.safeParse(phone).success;
  const locationOk = !!effectiveBranch;
  const stepStates = [detailsOk, locationOk, fulfilment === 'pickup' || !errors.address, false];
  const currentStep = stepStates.findIndex((ok) => !ok);

  const stateOptions = useMemo(() => NIGERIAN_STATES.map((s) => ({ value: s, label: s === 'FCT' ? 'FCT, Abuja' : s })), []);
  const branchOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: `${b.name}${b.area ? `, ${b.area}` : ''}` })), [branches]);

  const place = (address: AddressForm | null) => {
    if (!effectiveBranch || !detailsOk) { toast.error('Please complete your details first.'); return; }
    const parsedPhone = nigerianPhone.parse(phone);
    createOrder.mutate(
      {
        branchId: effectiveBranch.id, fulfilment, contactName: name.trim(), contactPhone: parsedPhone,
        address: address ? { ...address, phone: nigerianPhone.parse(address.phone) } : null, coupon: coupon ?? null,
      },
      {
        onSuccess: (order) => {
          haptics.success();
          if (address && saveForLater) saveAddress.mutate({ label: null, state: address.state, city: address.city, address_line: address.address, landmark: address.landmark, phone: nigerianPhone.parse(address.phone), is_default: (addresses.data?.length ?? 0) === 0 });
          router.push({ pathname: '/pay/[purpose]/[id]', params: { purpose: 'order', id: order.id } });
        },
        onError: (e) => { haptics.error(); toast.error(toUserMessage(e)); },
      },
    );
  };

  const submit = fulfilment === 'delivery' ? handleSubmit((v) => place(v)) : () => place(null);

  if (!cart.isLoading && cart.lines.length === 0) {
    return <Screen header={<ScreenHeader title="Checkout" />}><EmptyState icon="bag" title="Your cart is empty" actionLabel="Shop Skin Care" onAction={() => router.replace('/(tabs)/store')} /></Screen>;
  }

  return (
    <Screen
      header={<ScreenHeader title="Checkout" />}
      footer={<Button label={q ? `Pay ${formatNaira(q.total_kobo)}` : 'Pay'} loading={createOrder.isPending} disabled={!q || !!blocking || !detailsOk || quote.isFetching} onPress={() => void submit()} accessibilityHint="Places your order and opens secure payment" />}
      contentStyle={styles.gap}
    >
      <View style={styles.steps} accessibilityLabel={`Step ${Math.min(currentStep < 0 ? 4 : currentStep + 1, 4)} of 4`}>
        {['Details', 'Location', 'Delivery', 'Pay'].map((label, i) => {
          const done = stepStates[i] && i < 3;
          const current = i === (currentStep < 0 ? 3 : currentStep);
          return (
            <View key={label} style={styles.step}>
              <View style={[styles.stepDot, done && styles.stepDone, current && styles.stepCurrent]}>
                {done ? <Icon name="check" size={13} color={colors.gold} strokeWidth={2.5} /> : <Text variant="caption" color={current ? colors.white : colors.grey400} style={styles.stepNum}>{i + 1}</Text>}
              </View>
              <Text variant="caption" color={current || done ? colors.black : colors.grey400}>{label}</Text>
            </View>
          );
        })}
      </View>

      <Card style={styles.details}>
        <View style={styles.flex}>
          <Text variant="caption">Your details</Text>
          <Text variant="bodyStrong">{name || 'Add your name'}{phone ? `, ${phone}` : ''}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit your details" onPress={() => setEditing(true)} hitSlop={10}><Text variant="label" color={colors.goldText}>Edit</Text></Pressable>
      </Card>

      <View style={styles.pair}>
        {fulfilment === 'delivery' ? (
          <View style={styles.flex}>
            <Controller control={control} name="state" render={({ field }) => (
              <Select label="State" value={field.value as (typeof NIGERIAN_STATES)[number]} options={stateOptions} onChange={field.onChange} error={errors.state?.message} />
            )} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Select label="Branch" value={effectiveBranch?.id ?? null} options={branchOptions} onChange={setBranchId} />
        </View>
      </View>

      <View style={styles.gap}>
        <Text variant="caption">Delivery method</Text>
        <Segmented<Fulfilment> value={fulfilment} onChange={setFulfilment} options={[{ value: 'delivery', label: 'Home delivery' }, { value: 'pickup', label: 'Pick up at branch' }]} />
      </View>

      {fulfilment === 'delivery' ? (
        <View style={styles.gap}>
          {(addresses.data?.length ?? 0) > 0 ? (
            <View style={styles.saved}>
              <Text variant="caption">Saved addresses</Text>
              <View style={styles.chips}>
                {addresses.data?.map((a) => (
                  <Chip key={a.id} label={a.label || `${a.address_line.slice(0, 22)}…`} onPress={() => { setValue('state', a.state); setValue('city', a.city); setValue('address', a.address_line); setValue('landmark', a.landmark ?? ''); setValue('phone', a.phone); }} />
                ))}
              </View>
            </View>
          ) : null}
          <Controller control={control} name="city" render={({ field }) => <Input label="City" value={field.value} onChangeText={field.onChange} error={errors.city?.message} autoComplete="postal-address-locality" />} />
          <Controller control={control} name="address" render={({ field }) => <Input label="Delivery address" icon="pin" value={field.value} onChangeText={field.onChange} error={errors.address?.message} autoComplete="street-address" />} />
          <Controller control={control} name="landmark" render={({ field }) => <Input label="Nearest landmark" value={field.value} onChangeText={field.onChange} error={errors.landmark?.message} />} />
          <Controller control={control} name="phone" render={({ field }) => <Input label="Contact phone for the rider" prefix="+234" keyboardType="phone-pad" value={field.value} onChangeText={field.onChange} error={errors.phone?.message} />} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saveForLater }} accessibilityLabel="Save this address for next time" onPress={() => setSaveForLater((v) => !v)} style={styles.save} hitSlop={8}>
            <View style={[styles.box, saveForLater && styles.boxOn]}>{saveForLater ? <Icon name="check" size={13} color={colors.white} strokeWidth={2.5} /> : null}</View>
            <Text variant="caption">Save this address for next time</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pickup} accessibilityRole="summary">
          <Icon name="pin" size={20} color={colors.goldText} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Collect from {effectiveBranch?.name ?? 'your branch'}</Text>
            <Text variant="caption">{effectiveBranch ? `${effectiveBranch.address_line}${effectiveBranch.area ? `, ${effectiveBranch.area}` : ''}` : ''}</Text>
            <Text variant="caption">We will notify you when your order is ready. Bring your order number and a valid ID.</Text>
          </View>
        </View>
      )}

      {blocking === 'delivery_unavailable' ? (
        <View style={styles.warn} accessibilityRole="alert"><Icon name="alert" size={18} color={colors.error} /><Text variant="caption" color={colors.error} style={styles.flex}>We do not deliver to {state} yet. Choose branch pickup or another state.</Text></View>
      ) : blocking === 'out_of_stock' ? (
        <View style={styles.warn} accessibilityRole="alert"><Icon name="alert" size={18} color={colors.error} /><Text variant="caption" color={colors.error} style={styles.flex}>Some items are not available at {effectiveBranch?.name} in this quantity. Update your cart.</Text></View>
      ) : null}

      <View style={styles.summary}>
        <Row label="Subtotal" value={q ? formatNaira(q.subtotal_kobo) : '…'} />
        {q && q.discount_kobo > 0 ? <Row label={`Discount${q.coupon_code ? ` (${q.coupon_code})` : ''}`} value={`-${formatNaira(q.discount_kobo)}`} /> : null}
        <Row label={fulfilment === 'delivery' ? `Delivery to ${watch('city') || state}` : 'Branch pickup'} value={q ? formatNaira(q.delivery_fee_kobo) : '…'} />
        <Row label="Total, paid in full" value={q ? formatNaira(q.total_kobo) : '…'} strong />
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)}>
        <Text variant="h3">Your details</Text>
        <Input label="Full name" value={name} onChangeText={(v) => setContact({ name: v, phone })} autoComplete="name" />
        <Input label="Phone number" prefix="+234" keyboardType="phone-pad" value={phone.replace(/^\+234/, '')} onChangeText={(v) => setContact({ name, phone: v })} error={phone && !nigerianPhone.safeParse(phone).success ? 'Enter a valid Nigerian phone number' : undefined} />
        <Button label="Done" onPress={() => setEditing(false)} disabled={!detailsOk} />
      </Sheet>
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'title' : 'body'} style={styles.flex}>{label}</Text>
      <Text variant={strong ? 'title' : 'bodyStrong'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 16 },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', gap: 6, flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.grey50, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.black },
  stepCurrent: { backgroundColor: colors.gold },
  stepNum: { fontFamily: 'Poppins_600SemiBold' },
  details: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, backgroundColor: colors.grey50 },
  pair: { flexDirection: 'row', gap: 12 },
  saved: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  save: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: layout.minTouch },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.grey400, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  pickup: { flexDirection: 'row', gap: 12, backgroundColor: colors.goldSoft, borderRadius: radii.lg, padding: 14 },
  warn: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.errorSoft, borderRadius: radii.lg, padding: 14 },
  summary: { gap: 10, backgroundColor: colors.grey50, borderRadius: radii.lg, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
