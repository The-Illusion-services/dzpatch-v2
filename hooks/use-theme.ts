import { useColorScheme } from 'react-native';
import { Colors, DarkColors } from '@/constants/theme';

/**
 * Returns the full color palette for the current system color scheme.
 * Use this in screens and components instead of importing Colors directly.
 *
 * Example:
 *   const { colors, isDark } = useTheme();
 *   <View style={{ backgroundColor: colors.background }} />
 */
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    isDark,
    colors: isDark ? DarkColors : Colors,
  } as const;
}
