// DZpatch V2 — Design System
// Source of truth for all colors, typography, spacing, shadows, and border radii.
// Derived from UI/UX designs in /UI UX Design/Customer App/

export const Colors = {
  // Primary palette
  primary: '#2563EB',       // Blue — CTAs, active states
  primaryDark: '#1D4ED8',   // Pressed / darker variant
  primaryLight: '#EFF6FF',  // Light blue tint / selected background

  // Neutrals
  background: '#F5F7FA',    // App background
  surface: '#FFFFFF',       // Card / sheet surface
  border: '#E5E7EB',        // Dividers, input borders
  borderFocus: '#2563EB',   // Input focused border

  // Text
  textPrimary: '#0D1B2A',   // Deep navy — headings
  textSecondary: '#6B7280', // Muted — labels, hints
  textDisabled: '#9CA3AF',  // Disabled text
  textInverse: '#FFFFFF',   // On dark/primary backgrounds

  // Status colors
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  info: '#0EA5E9',
  infoLight: '#E0F2FE',

  // Order status chip colors
  statusPending: '#D97706',
  statusMatched: '#2563EB',
  statusInTransit: '#7C3AED',
  statusDelivered: '#16A34A',
  statusCancelled: '#DC2626',

  // Overlay
  overlay: 'rgba(13, 27, 42, 0.5)',

  // Tab bar
  tabActive: '#2563EB',
  tabInactive: '#9CA3AF',
  tabBackground: '#FFFFFF',
} as const;

// Dark mode palette — same token names, dark-adapted values
export const DarkColors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#1E3A5F',

  background: '#0D1117',
  surface: '#161B22',
  border: '#30363D',
  borderFocus: '#3B82F6',

  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textDisabled: '#484F58',
  textInverse: '#0D1117',

  success: '#3FB950',
  successLight: '#0D2B16',
  warning: '#D29922',
  warningLight: '#2D1F07',
  error: '#F85149',
  errorLight: '#2D1414',
  info: '#58A6FF',
  infoLight: '#0D2340',

  statusPending: '#D29922',
  statusMatched: '#3B82F6',
  statusInTransit: '#A78BFA',
  statusDelivered: '#3FB950',
  statusCancelled: '#F85149',

  overlay: 'rgba(0, 0, 0, 0.7)',

  tabActive: '#3B82F6',
  tabInactive: '#484F58',
  tabBackground: '#161B22',
} as const;

export type ColorToken = keyof typeof Colors;

export const Typography = {
  // Font sizes
  xs: 12,
  sm: 14,
  base: 16,
  md: 18,
  lg: 21,
  xl: 25,
  '2xl': 30,
  '3xl': 34,
  '4xl': 40,

  // Line heights
  lineHeightTight: 1.2,
  lineHeightBase: 1.5,
  lineHeightRelaxed: 1.75,

  // Font weights (RN uses string values)
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
} as const;

export const Spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

// Reusable layout values
export const Layout = {
  screenPaddingH: 20,      // Horizontal padding on all screens
  screenPaddingV: 24,      // Vertical padding on all screens
  cardPadding: 16,
  bottomTabHeight: 80,     // Includes safe area buffer
  headerHeight: 56,
  inputHeight: 52,
  buttonHeightLg: 56,
  buttonHeightMd: 48,
  buttonHeightSm: 38,
} as const;
