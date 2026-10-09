import type { TextStyle, ViewStyle } from 'react-native';

/** Brand palette (see brand brief). Never introduce ad-hoc colours in components; extend this file. */
export const colors = {
  black: '#0D0D0D',
  gold: '#A68917',
  goldText: '#88700F',
  goldSoft: '#F6F1E0',
  warm: '#FBF8EF',
  white: '#FFFFFF',
  grey50: '#F7F7F7',
  grey200: '#E6E6E6',
  grey400: '#9A9A9A',
  grey600: '#666666',
  success: '#2E7D4F',
  successSoft: '#E7F3EC',
  error: '#B3261E',
  errorSoft: '#FBE9E7',
  overlay: 'rgba(13,13,13,0.55)',
  onDarkMuted: 'rgba(255,255,255,0.64)',
  onDarkFaint: 'rgba(255,255,255,0.12)',
} as const;

/** Font family names registered by useFonts in app/_layout.tsx. Lora = headlines, Poppins = interface. */
export const fonts = {
  heading: 'Lora_500Medium',
  headingSemi: 'Lora_600SemiBold',
  headingItalic: 'Lora_400Regular_Italic',
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const layout = {
  screenPadding: 20,
  minTouch: 44,
  tabBarHeight: 64,
  inputHeight: 52,
  buttonHeight: 52,
} as const;

export const motion = { fast: 150, base: 250, slow: 400 } as const;

export const shadows = {
  card: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 } satisfies ViewStyle,
  sheet: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 16 } satisfies ViewStyle,
} as const;

export type TextVariant =
  | 'display' | 'h1' | 'h2' | 'h3' | 'title' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'button' | 'eyebrow' | 'price';

export const typography: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.black },
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, color: colors.black },
  h2: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.black },
  h3: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.black },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: colors.black },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.grey600 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, color: colors.black },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.grey600 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.black },
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.white },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: colors.goldText, letterSpacing: 0.4 },
  price: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.goldText },
};
