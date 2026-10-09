import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';

export interface SelectOption<T extends string> { value: T; label: string; description?: string }

/** Field that opens a bottom-sheet list. Used for states and branches. */
export function Select<T extends string>({ label, value, options, onChange, placeholder = 'Select', error }: {
  label: string; value: T | null; options: readonly SelectOption<T>[]; onChange: (v: T) => void; placeholder?: string; error?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.wrap}>
      <Text variant="caption">{label}</Text>
      <Pressable
        accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        onPress={() => setOpen(true)} style={[styles.field, !!error && styles.errored]}
      >
        <Text variant="body" color={current ? colors.black : colors.grey400} numberOfLines={1} style={styles.value}>{current?.label ?? placeholder}</Text>
        <Icon name="chevronDown" size={18} color={colors.grey600} />
      </Pressable>
      {error ? <Text variant="caption" color={colors.error}>{error}</Text> : null}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Text variant="h3">{label}</Text>
        <FlatList
          data={options as SelectOption<T>[]} keyExtractor={(o) => o.value} style={styles.list} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: item.value === value }} accessibilityLabel={item.label} onPress={() => { onChange(item.value); setOpen(false); }} style={styles.option}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{item.label}</Text>
                {item.description ? <Text variant="caption">{item.description}</Text> : null}
              </View>
              {item.value === value ? <Icon name="check" size={18} color={colors.gold} /> : null}
            </Pressable>
          )}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: 6 },
  field: { minHeight: layout.inputHeight, borderRadius: radii.md, borderWidth: 1, borderColor: colors.grey200, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white },
  errored: { borderColor: colors.error },
  value: { flex: 1 },
  list: { maxHeight: 360 },
  option: { minHeight: layout.minTouch + 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.grey200 },
});
