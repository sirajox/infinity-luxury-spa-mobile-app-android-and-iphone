import { zodResolver } from '@hookform/resolvers/zod';
import { NIGERIAN_STATES, deliveryAddressSchema } from '@infinity/core';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Text } from '@/components/ui/Text';
import type { Address } from '@/features/account/api';
import { useAddresses, useDeleteAddress, useSaveAddress } from '@/features/account/hooks';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { colors } from '@/theme';

type Form = z.input<typeof deliveryAddressSchema>;
const STATES = NIGERIAN_STATES.map((s) => ({ value: s, label: s === 'FCT' ? 'FCT, Abuja' : s }));

export default function Addresses() {
  const { data, isLoading, isError, error, refetch } = useAddresses();
  const save = useSaveAddress();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const { control, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(deliveryAddressSchema), defaultValues: { state: 'FCT', city: '', address: '', landmark: '', phone: '' } });

  const open = (a: Address | 'new') => {
    reset(a === 'new' ? { state: 'FCT', city: '', address: '', landmark: '', phone: '' } : { state: a.state, city: a.city, address: a.address_line, landmark: a.landmark ?? '', phone: a.phone });
    setEditing(a);
  };

  const submit = handleSubmit((v) => {
    const existing = editing && editing !== 'new' ? editing : null;
    const parsed = deliveryAddressSchema.parse(v);
    save.mutate(
      { id: existing?.id, label: existing?.label ?? null, state: parsed.state, city: parsed.city, address_line: parsed.address, landmark: parsed.landmark, phone: parsed.phone, is_default: existing?.is_default ?? (data?.length ?? 0) === 0 },
      { onSuccess: () => { setEditing(null); toast.success('Address saved.'); }, onError: (e) => toast.error(toUserMessage(e)) },
    );
  });

  return (
    <Screen header={<ScreenHeader title="Saved addresses" />} footer={<Button label="Add address" icon="plus" onPress={() => open('new')} />} contentStyle={styles.gap}>
      {isLoading ? <SkeletonList rows={2} height={96} /> : isError ? <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="pin" title="No saved addresses" body="Add an address to check out faster." />
      ) : data?.map((a) => (
        <Card key={a.id} style={styles.card}>
          <View style={styles.head}>
            <Icon name="pin" size={18} color={colors.goldText} />
            <Text variant="title" style={styles.flex}>{a.label ?? `${a.city}, ${a.state}`}</Text>
            {a.is_default ? <Badge label="Default" tone="gold" /> : null}
          </View>
          <Text variant="body">{a.address_line}{a.landmark ? `, near ${a.landmark}` : ''}</Text>
          <Text variant="caption">{a.phone}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit address ${a.address_line}`} onPress={() => open(a)} hitSlop={10}><Text variant="label" color={colors.goldText}>Edit</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete address ${a.address_line}`} onPress={() => remove.mutate(a.id, { onError: (e) => toast.error(toUserMessage(e)) })} hitSlop={10}><Text variant="label" color={colors.error}>Delete</Text></Pressable>
          </View>
        </Card>
      ))}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)}>
        <Text variant="h3">{editing === 'new' ? 'New address' : 'Edit address'}</Text>
        <Controller control={control} name="state" render={({ field }) => <Select label="State" value={field.value as (typeof NIGERIAN_STATES)[number]} options={STATES} onChange={field.onChange} error={errors.state?.message} />} />
        <Controller control={control} name="city" render={({ field }) => <Input label="City" value={field.value} onChangeText={field.onChange} error={errors.city?.message} />} />
        <Controller control={control} name="address" render={({ field }) => <Input label="Address" value={field.value} onChangeText={field.onChange} error={errors.address?.message} />} />
        <Controller control={control} name="landmark" render={({ field }) => <Input label="Nearest landmark" value={field.value} onChangeText={field.onChange} error={errors.landmark?.message} />} />
        <Controller control={control} name="phone" render={({ field }) => <Input label="Contact phone" prefix="+234" keyboardType="phone-pad" value={field.value.replace(/^\+234/, '')} onChangeText={field.onChange} error={errors.phone?.message} />} />
        <Button label="Save address" loading={save.isPending} onPress={() => void submit()} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  card: { padding: 16, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 24, marginTop: 6 },
});
