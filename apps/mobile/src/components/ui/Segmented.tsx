import { Pressable, StyleSheet, View } from 'react-native';
import { colors, layout, radii } from '@/theme';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';

export function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => { if (!active) { haptics.select(); onChange(o.value); } }}
            style={[styles.item, active && styles.active]}
          >
            <Text variant="label" color={active ? colors.black : colors.grey600} style={active ? styles.activeText : undefined}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.grey50, borderRadius: radii.pill, padding: 4, borderWidth: 1, borderColor: colors.grey200 },
  item: { flex: 1, minHeight: layout.minTouch - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  active: { backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  activeText: { fontFamily: 'Poppins_600SemiBold' },
});
