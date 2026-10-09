import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { typography, type TextVariant } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

/** Single text primitive: applies the type scale and caps dynamic type growth so layouts stay intact. */
export function Text({ variant = 'body', color, align, style, maxFontSizeMultiplier = 1.3, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
