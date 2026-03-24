import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Colors, Radius, Shadow, Spacing, Typography } from '@/constants/theme';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  duration?: number;
  onHide?: () => void;
}

const TYPE_COLORS: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: Colors.success, text: Colors.textInverse },
  error: { bg: Colors.error, text: Colors.textInverse },
  warning: { bg: Colors.warning, text: Colors.textInverse },
  info: { bg: Colors.textPrimary, text: Colors.textInverse },
};

export function Toast({ message, type = 'info', visible, duration = 3000, onHide }: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const cfg = TYPE_COLORS[type];

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 9,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }).start(() => onHide?.());
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, onHide, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: cfg.bg, transform: [{ translateY }] },
      ]}
    >
      <Text style={[styles.message, { color: cfg.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Spacing[12],
    left: Spacing[4],
    right: Spacing[4],
    borderRadius: Radius.lg,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    zIndex: 9999,
    ...Shadow.md,
  },
  message: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    textAlign: 'center',
  },
});
