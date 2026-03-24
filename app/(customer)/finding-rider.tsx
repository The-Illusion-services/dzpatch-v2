import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import type { OrderStatus } from '@/types/database';

export default function FindingRiderScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile } = useAuthStore();

  const [order, setOrder] = useState<{
    id: string;
    status: OrderStatus;
    pickup_address: string;
    dropoff_address: string;
    package_size: string;
    dynamic_price: number;
    expires_at: string | null;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // ── Pulse animation ──────────────────────────────────────────────────────
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    const a1 = anim(pulse1, 0);
    const a2 = anim(pulse2, 700);
    const a3 = anim(pulse3, 1400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  // ── Load order ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;

    supabase
      .from('orders')
      .select('id, status, pickup_address, dropoff_address, package_size, dynamic_price, expires_at')
      .eq('id', orderId)
      .single()
      .then(({ data }) => { if (data) setOrder(data as any); });

    // Subscribe to status changes
    const channel = supabase
      .channel(`finding:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as any;
          setOrder((prev) => prev ? { ...prev, ...updated } : updated);
          // Rider matched — move to bidding pool
          if (updated.status === 'pending' && updated.rider_id == null) return; // still searching
          if (updated.status === 'matched') {
            router.replace({ pathname: '/(customer)/order-tracking', params: { orderId } } as any);
          }
        }
      )
      .subscribe();

    // Also subscribe to bids — first bid = go to bidding pool
    const bidsChannel = supabase
      .channel(`finding-bids:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        () => {
          router.replace({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      bidsChannel.unsubscribe();
    };
  }, [orderId]);

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!order?.expires_at) return;
    const tick = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(order.expires_at!).getTime() - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [order?.expires_at]);

  // ── Cancel ───────────────────────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert('Cancel Search', 'Stop looking for a rider and cancel this order?', [
      { text: 'Keep Searching', style: 'cancel' },
      {
        text: 'Cancel Order',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { error } = await supabase.rpc('cancel_order', {
            p_order_id: orderId,
            p_cancelled_by: 'customer',
            p_user_id: profile?.id,
            p_reason: 'Customer cancelled while searching for rider',
          } as any);
          setCancelling(false);
          if (error) Alert.alert('Error', error.message);
          else router.replace('/(customer)/' as any);
        },
      },
    ]);
  };

  // ── Pulse ring helper ────────────────────────────────────────────────────
  const PulseRing = ({ anim, size }: { anim: Animated.Value; size: number }) => (
    <Animated.View
      style={[
        styles.pulseRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.15, 0] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        },
      ]}
    />
  );

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoMark} />
          <Text style={styles.logoText}>dzpatch</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Searching</Text>
        </View>
      </View>

      {/* Radar center */}
      <View style={styles.radarWrap}>
        {/* Pulse rings */}
        <PulseRing anim={pulse3} size={320} />
        <PulseRing anim={pulse2} size={240} />
        <PulseRing anim={pulse1} size={160} />

        {/* Center orb */}
        <View style={styles.radarOrb}>
          <Text style={styles.radarIcon}>🏍️</Text>
        </View>

        {/* Timer above orb */}
        {timeLeft !== null && timeLeft > 0 && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
            <Text style={styles.timerLabel}>remaining</Text>
          </View>
        )}
      </View>

      {/* Status card */}
      <View style={styles.statusCard}>
        <Text style={styles.statusCardTitle}>Finding your rider</Text>
        <Text style={styles.statusCardBody}>
          Matching you with the nearest available rider in your area...
        </Text>
      </View>

      {/* Order summary card */}
      {order && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryIcon}>📍</Text>
            <Text style={styles.summaryText} numberOfLines={1}>{order.pickup_address}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryIcon}>🎯</Text>
            <Text style={styles.summaryText} numberOfLines={1}>{order.dropoff_address}</Text>
          </View>
          <View style={styles.summaryMeta}>
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>{order.package_size.replace('_', ' ')}</Text>
            </View>
            <Text style={styles.summaryPrice}>₦{Number(order.dynamic_price).toLocaleString()}</Text>
          </View>
        </View>
      )}

      {/* Cancel button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
          onPress={handleCancel}
          disabled={cancelling}
        >
          <Text style={styles.cancelBtnText}>{cancelling ? 'Cancelling...' : 'Cancel Search'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    alignItems: 'center',
  },

  // Header
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#000D22',
  },
  logoText: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dde1ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#0040e0',
  },
  statusText: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: '#0040e0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Radar
  radarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: '#0040e0',
  },
  radarOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 10,
  },
  radarIcon: { fontSize: 36 },
  timerBadge: {
    position: 'absolute',
    top: -48,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 28,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -1,
  },
  timerLabel: {
    fontSize: Typography.xs,
    color: '#44474e',
    fontWeight: Typography.medium,
  },

  // Status card
  statusCard: {
    marginHorizontal: Spacing[5],
    marginBottom: 16,
    alignItems: 'center',
    gap: 6,
  },
  statusCardTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  statusCardBody: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  // Summary card
  summaryCard: {
    width: '100%',
    marginHorizontal: 0,
    paddingHorizontal: Spacing[5],
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F4F6',
    paddingTop: 16,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryIcon: { fontSize: 16 },
  summaryText: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F1F4F6',
    marginLeft: 26,
  },
  summaryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  metaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F1F4F6',
    borderRadius: 999,
  },
  metaBadgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'capitalize',
  },
  summaryPrice: {
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
  },

  // Bottom
  bottomBar: {
    width: '100%',
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F4F6',
  },
  cancelBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F1F4F6',
  },
  cancelBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#44474e',
  },
});