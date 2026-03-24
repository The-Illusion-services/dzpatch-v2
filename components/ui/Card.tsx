import React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { Colors, Layout, Radius, Shadow } from '@/constants/theme';

type CardVariant = 'elevated' | 'flat' | 'outlined';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: number;
  style?: ViewStyle;
}

export function Card({ variant = 'elevated', padding, style, children, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        styles[variant],
        padding !== undefined ? { padding } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    padding: Layout.cardPadding,
    backgroundColor: Colors.surface,
  },
  elevated: {
    ...Shadow.md,
  },
  flat: {
    backgroundColor: Colors.background,
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
