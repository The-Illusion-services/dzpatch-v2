import { useColorScheme } from 'react-native';
import { Colors, DarkColors } from '@/constants/theme';

/**
 * Returns the resolved color for a given token, respecting the current
 * system color scheme. Pass optional overrides to hard-code a value.
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors
): string {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? DarkColors : Colors;
  const fromProps = scheme === 'dark' ? props.dark : props.light;
  return fromProps ?? palette[colorName];
}
