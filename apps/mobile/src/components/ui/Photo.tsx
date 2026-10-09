import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { colors } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** The design's patterned block, used wherever real photography has not been uploaded yet. */
export function PatternPlaceholder({ icon = 'image', label, dark, style, iconSize = 28 }: {
  icon?: IconName; label?: string; dark?: boolean; style?: StyleProp<ViewStyle>; iconSize?: number;
}) {
  const base = dark ? '#1A1A17' : '#EFE7CF';
  const stripe = dark ? 'rgba(166,137,23,0.12)' : 'rgba(166,137,23,0.16)';
  return (
    <View style={[styles.fill, { backgroundColor: base }, style]} accessibilityElementsHidden importantForAccessibility="no">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id="stripes" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)">
            <Line x1="0" y1="0" x2="0" y2="14" stroke={stripe} strokeWidth="6" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stripes)" />
      </Svg>
      <Icon name={icon} size={iconSize} color={dark ? colors.gold : colors.goldText} />
      {label ? <Text variant="caption" color={dark ? colors.gold : colors.goldText}>{label}</Text> : null}
    </View>
  );
}

export interface PhotoProps {
  uri?: string | null;
  fallbackIcon?: IconName;
  fallbackLabel?: string;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
  alt?: string;
  priority?: 'low' | 'normal' | 'high';
  iconSize?: number;
}

/** Cached, lazily decoded image with a branded placeholder while missing. */
export function Photo({ uri, fallbackIcon, fallbackLabel, dark, style, alt, priority = 'normal', iconSize }: PhotoProps) {
  if (!uri) return <PatternPlaceholder icon={fallbackIcon} label={fallbackLabel} dark={dark} style={style} iconSize={iconSize} />;
  return (
    <Image
      source={{ uri }}
      style={[styles.fill, style as object]}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={uri}
      accessible={!!alt}
      accessibilityLabel={alt}
    />
  );
}

const styles = StyleSheet.create({
  fill: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
