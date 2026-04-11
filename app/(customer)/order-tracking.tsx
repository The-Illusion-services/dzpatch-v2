import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Avatar, Card, StatusBadge } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';
import type { Order } from '@/types/database';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';

const ACTIVE_TRACKING_STATUSES = new Set([
  'matched',
  'pickup_en_route',
  'arrived_pickup',
  'in_transit',
  'arrived_dropoff',
]);

// ─── Progress timeline ────────────────────────────────────────────────────────

const STEPS = [
  { key: 'pending', label: 'Order\nPlaced', icon: '📋' },
  { key: 'matched', label: 'Rider\nAssigned', icon: '🏍️' },
  { key: 'pickup_en_route', label: 'Heading to\nPick-up', icon: '🛣️' },
  { key: 'arrived_pickup', label: 'Arrived\nPick-up', icon: '📦' },
  { key: 'in_transit', label: 'On the\nWay', icon: '🚀' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
] as const;

const STATUS_STEP: Record<string, number> = {
  pending: 0,
  matched: 1,
  pickup_en_route: 2,
  arrived_pickup: 3,
  in_transit: 4,
  arrived_dropoff: 4,
  delivered: 5,
  completed: 5,
  cancelled: -1,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrderTrackingScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [riderProfile, setRiderProfile] = useState<{ full_name: string; phone: string; avatar_url: string | null; average_rating: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Fetch order + rider ────────────────────────────────────────────────

  const fetchOrder = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('orders')
      .select('id, status, rider_id, final_price, pickup_address, dropoff_address, dropoff_contact_name, dropoff_contact_phone, package_size, delivery_code')
      .eq('id', id)
      .single();
    if (data) {
      const o = data as { rider_id: string | null; status: string; [key: string]: any };
      if (ACTIVE_TRACKING_STATUSES.has(o.status)) {
        router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId: id } } as any);
        return;
      }
      setOrder(o as unknown as Order);
      if (o.rider_id) fetchRider(o.rider_id);
    }
  }, []);

  const fetchRider = async (riderId: string) => {
    const { data } = await supabase
      .from('riders')
      .select('average_rating, profiles(full_name, phone, avatar_url)')
      .eq('id', riderId)
      .single();
    if (data && (data as any).profiles) {
      setRiderProfile({
        ...(data as any).profiles,
        average_rating: (data as any).average_rating ?? 0,
      });
    }
  };

  // ─── Subscribe to real-time updates ────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;

    fetchOrder(orderId).finally(() => setLoading(false));

    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const nextOrder = payload.new as Order;
          if (ACTIVE_TRACKING_STATUSES.has(nextOrder.status)) {
            router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
            return;
          }
          setOrder(nextOrder);
          if (nextOrder.rider_id && nextOrder.rider_id !== (payload.old as any)?.rider_id) {
            fetchRider(nextOrder.rider_id);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, fetchOrder]);

  useAppStateChannels([channelRef.current]);

  if (loading || !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 32 }}>📦</Text>
        <Text style={{ fontSize: Typography.sm, color: '#44474e', marginTop: 8 }}>Loading order...</Text>
      </View>
    );
  }

  const currentStep = STATUS_STEP[order.status] ?? 0;
  const isCancelled = order.status === 'cancelled';
  const isCompleted = order.status === 'completed' || order.status === 'delivered';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Track Order</Text>
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, isCancelled && styles.liveDotCancelled]} />
          <Text style={[styles.liveText, isCancelled && styles.liveTextCancelled]}>
            {isCancelled ? 'Cancelled' : isCompleted ? 'Done' : 'Live'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Order ID + status */}
        <View style={styles.orderMeta}>
          <StatusBadge status={order.status} />
          <Text style={styles.orderId}>Order #{order.id.slice(-6).toUpperCase()}</Text>
          {order.final_price && (
            <Text style={styles.orderPrice}>₦{Number(order.final_price).toLocaleString()}</Text>
          )}
        </View>

        {/* Progress timeline */}
        {!isCancelled && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timelineWrap}>
            <View style={styles.timeline}>
              {STEPS.map((step, idx) => {
                const done = currentStep > idx;
                const active = currentStep === idx;
                return (
                  <View key={step.key} style={styles.timelineStep}>
                    {idx < STEPS.length - 1 && (
                      <View style={[styles.timelineConnector, done && styles.timelineConnectorDone]} />
                    )}
                    <View style={[
                      styles.stepCircle,
                      done && styles.stepCircleDone,
                      active && styles.stepCircleActive,
                    ]}>
                      <Text style={styles.stepIcon}>{step.icon}</Text>
                    </View>
                    <Text style={[styles.stepLabel, active && styles.stepLabelActive, done && styles.stepLabelDone]}>
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Addresses */}
        <Card style={styles.addressCard}>
          <View style={styles.addressRow}>
            <View style={styles.dotPickup} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressLabel}>PICK-UP</Text>
              <Text style={styles.addressText}>{order.pickup_address}</Text>
            </View>
          </View>
          <View style={styles.addressDivider} />
          <View style={styles.addressRow}>
            <View style={styles.dotDropoff} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressLabel}>DROP-OFF</Text>
              <Text style={styles.addressText}>{order.dropoff_address}</Text>
              {order.dropoff_contact_name && (
                <Text style={styles.contactText}>
                  {order.dropoff_contact_name} · {order.dropoff_contact_phone}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Rider card */}
        {riderProfile ? (
          <Card style={styles.riderCard}>
            <View style={styles.riderRow}>
              <Avatar name={riderProfile.full_name} uri={riderProfile.avatar_url} size="md" />
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{riderProfile.full_name}</Text>
                <Text style={styles.riderRating}>⭐ {riderProfile.average_rating.toFixed(1)}</Text>
              </View>
              <View style={styles.riderActions}>
                <Pressable
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${riderProfile.phone}`)}
                >
                  <Text style={styles.callBtnIcon}>📞</Text>
                </Pressable>
                <Pressable
                  style={styles.chatBtn}
                  onPress={() => router.push({
                    pathname: '/(customer)/chat',
                    params: { orderId },
                  } as any)}
                >
                  <Text style={styles.chatBtnIcon}>💬</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ) : order.status === 'pending' ? (
          <Card variant="flat" style={styles.waitingCard}>
            <Text style={styles.waitingIcon}>⏳</Text>
            <Text style={styles.waitingTitle}>Finding a Rider</Text>
            <Text style={styles.waitingBody}>Matching you with the nearest available rider...</Text>
          </Card>
        ) : null}

        {/* Package info */}
        <Card variant="flat" style={styles.packageCard}>
          <View style={styles.packageRow}>
            <Text style={styles.packageIcon}>📦</Text>
            <View>
              <Text style={styles.packageLabel}>Package Size</Text>
              <Text style={styles.packageValue}>{order.package_size.replace('_', ' ')}</Text>
            </View>
          </View>
          {order.delivery_code && (
            <View style={[styles.packageRow, { borderTopWidth: 1, borderTopColor: '#F1F4F6', paddingTop: 12, marginTop: 4 }]}>
              <Text style={styles.packageIcon}>🔐</Text>
              <View>
                <Text style={styles.packageLabel}>Delivery Code</Text>
                <Text style={[styles.packageValue, { letterSpacing: 4, fontSize: Typography.xl }]}>
                  {order.delivery_code}
                </Text>
                <Text style={styles.packageHint}>Share with rider at delivery</Text>
              </View>
            </View>
          )}
        </Card>

        {/* Cancel button — only if order is still cancellable */}
        {['pending', 'matched'].includes(order.status) && (
          <Pressable
            style={styles.cancelBtn}
            onPress={() => router.push({ pathname: '/(customer)/cancel-order-modal', params: { orderId } } as any)}
          >
            <Text style={styles.cancelBtnText}>Cancel Order</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    color: '#0040e0',
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
    marginLeft: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dde1ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#0040e0',
  },
  liveDotCancelled: {
    backgroundColor: '#ba1a1a',
  },
  liveText: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: '#0040e0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  liveTextCancelled: {
    color: '#ba1a1a',
  },

  scroll: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 60,
    paddingTop: 20,
    gap: 16,
  },

  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  orderId: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  orderPrice: {
    marginLeft: 'auto' as any,
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
  },

  // Timeline
  timelineWrap: {
    marginHorizontal: -Spacing[5],
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing[5],
    paddingVertical: 8,
    gap: 0,
  },
  timelineStep: {
    alignItems: 'center',
    width: 72,
    position: 'relative',
  },
  timelineConnector: {
    position: 'absolute',
    top: 16,
    left: '50%',
    width: 72,
    height: 2,
    backgroundColor: '#E0E3E5',
    zIndex: 0,
  },
  timelineConnectorDone: {
    backgroundColor: '#0040e0',
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E3E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepCircleDone: {
    backgroundColor: '#dde1ff',
  },
  stepCircleActive: {
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  stepIcon: { fontSize: 16 },
  stepLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 6,
  },
  stepLabelActive: { color: '#0040e0' },
  stepLabelDone: { color: '#000D22' },

  // Addresses
  addressCard: {
    gap: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  addressDivider: {
    height: 1,
    backgroundColor: '#F1F4F6',
    marginLeft: 20,
  },
  dotPickup: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#0040e0',
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    flexShrink: 0,
  },
  dotDropoff: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0040e0',
    marginTop: 4,
    flexShrink: 0,
  },
  addressLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  addressText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#000D22',
    marginTop: 2,
  },
  contactText: {
    fontSize: Typography.xs,
    color: '#44474e',
    marginTop: 2,
  },

  // Rider
  riderCard: {
    gap: 0,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riderName: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  riderRating: {
    fontSize: Typography.sm,
    color: '#44474e',
    marginTop: 2,
  },
  riderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnIcon: { fontSize: 20 },
  chatBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnIcon: { fontSize: 20 },

  // Waiting
  waitingCard: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
    backgroundColor: '#F1F4F6',
  },
  waitingIcon: { fontSize: 36 },
  waitingTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  waitingBody: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
    maxWidth: 220,
  },

  // Package info
  packageCard: {
    gap: 12,
    backgroundColor: '#F1F4F6',
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  packageIcon: { fontSize: 22 },
  packageLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  packageValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  packageHint: {
    fontSize: Typography.xs,
    color: '#0040e0',
    marginTop: 2,
  },

  // Cancel
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ba1a1a',
  },
  cancelBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#ba1a1a',
  },
});
