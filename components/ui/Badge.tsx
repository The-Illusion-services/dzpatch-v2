import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Typography } from '@/constants/theme';
import type { OrderStatus } from '@/types/database';

// Generic badge
interface BadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
}

export function Badge({ label, color = Colors.textPrimary, backgroundColor = Colors.border }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

// Semantic order status badge
const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: Colors.warning, bg: Colors.warningLight },
  matched: { label: 'Matched', color: Colors.primary, bg: Colors.primaryLight },
  pickup_en_route: { label: 'En Route', color: Colors.primary, bg: Colors.primaryLight },
  arrived_pickup: { label: 'Arrived', color: Colors.primary, bg: Colors.primaryLight },
  in_transit: { label: 'In Transit', color: '#7C3AED', bg: '#EDE9FE' },
  arrived_dropoff: { label: 'At Dropoff', color: '#7C3AED', bg: '#EDE9FE' },
  delivered: { label: 'Delivered', color: Colors.success, bg: Colors.successLight },
  completed: { label: 'Completed', color: Colors.success, bg: Colors.successLight },
  cancelled: { label: 'Cancelled', color: Colors.error, bg: Colors.errorLight },
};

interface StatusBadgeProps {
  status: OrderStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return <Badge label={cfg.label} color={cfg.color} backgroundColor={cfg.bg} />;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
});
