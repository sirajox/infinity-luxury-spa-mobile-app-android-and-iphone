import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, layout, radii } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  icon?: IconName;
  prefix?: string;
  hint?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, icon, prefix, hint, secureTextEntry, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View style={styles.wrap}>
      <Text variant="caption">{label}</Text>
      <View style={[styles.field, focused && styles.focused, !!error && styles.errored]}>
        {icon ? <Icon name={icon} size={18} color={colors.grey400} /> : null}
        {prefix ? <Text variant="bodyStrong" style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.grey400}
          secureTextEntry={hidden}
          style={styles.input}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            onPress={() => setHidden((h) => !h)}
          >
            <Icon name={hidden ? 'eye' : 'eyeOff'} size={18} color={colors.grey600} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={colors.error} accessibilityLiveRegion="polite">{error}</Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    minHeight: layout.inputHeight, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.grey200, backgroundColor: colors.white,
  },
  focused: { borderColor: colors.black },
  errored: { borderColor: colors.error },
  prefix: { color: colors.black, paddingRight: 8, borderRightWidth: 1, borderRightColor: colors.grey200 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.black, paddingVertical: 12 },
});
