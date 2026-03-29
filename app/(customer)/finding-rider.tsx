import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import type { OrderStatus } from '@/types/database';

// Dummy riders that "converge" toward the pickup marker
const DUMMY_RIDERS = [
  { id: 'r1', startLatOffset: 0.022,  startLngOffset: 0.028  },
  { id: 'r2', startLatOffset: -0.018, startLngOffset: 0.032  },
  { id: 'r3', startLatOffset: 0.030,  startLngOffset: -0.014 },
  { id: 'r4', startLatOffset: -0.025, startLngOffset: -0.020 },
];

const DEFAULT_CENTER = { latitude: 5.9631, longitude: 8.3271 };

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a4a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a5a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d2137' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

export default function FindingRiderScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, pickupAddress: paramPickup, dropoffAddress: paramDropoff, finalPrice: paramFinalPrice } = useLocalSearchParams<{
    orderId: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    finalPrice?: string;
  }>();
  const { profile } = useAuthStore();
  const mapRef = useRef<MapView>(null);

  const [order, setOrder] = useState<{
    id: string;
    status: OrderStatus;
    pickup_address: string;
    dropoff_address: string;
    package_size: string;
    dynamic_price: number;
    final_price: number;
    payment_method: string;
    expires_at: string | null;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [riderViews, setRiderViews] = useState(0);

  // ── Rider converge animations (each 0→1 = moving toward center) ──────────
  const convergeAnims = useRef(DUMMY_RIDERS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = convergeAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 600),
          Animated.timing(anim, {
            toValue: 0.6,
            duration: 3500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pulse animation for pickup marker ────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scanning bar animation ────────────────────────────────────────────────
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: false })
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Get user location for better map center ───────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      // Use last known position instantly, then refine with current
      const last = await Location.getLastKnownPositionAsync();
      if (last) setCenter({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCenter({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  // ── Load order + realtime + poll ─────────────────────────────────────────
  const navigatingRef = useRef(false);

  useEffect(() => {
    if (!orderId) return;

    navigatingRef.current = false;

    const goToBidding = () => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      router.replace({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);
    };

    supabase
      .from('orders')
      .select('id, status, pickup_address, dropoff_address, package_size, dynamic_price, final_price, payment_method, expires_at')
      .eq('id', orderId)
      .single()
      .then(({ data }) => { if (data) setOrder(data as any); });

    // Check for existing bids immediately on mount
    supabase
      .from('bids')
      .select('id', { count: 'exact' })
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .then(({ count }) => {
        if (count && count > 0) {
          setRiderViews(count);
          goToBidding();
        }
      });

    // Poll every 5s as fallback (realtime RLS may block delivery)
    const pollInterval = setInterval(async () => {
      const { count } = await supabase
        .from('bids')
        .select('id', { count: 'exact' })
        .eq('order_id', orderId)
        .eq('status', 'pending')
        .then((r) => r);
      if (count && count > 0) {
        setRiderViews(count);
        goToBidding();
      }
    }, 5000);

    const channel = supabase
      .channel(`finding:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as any;
          setOrder((prev) => prev ? { ...prev, ...updated } : updated);
          if (updated.status === 'matched') {
            router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
          }
        }
      )
      .subscribe();

    const bidsChannel = supabase
      .channel(`finding-bids:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        () => {
          setRiderViews((v) => v + 1);
          setTimeout(goToBidding, 600);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      supabase.removeChannel(bidsChannel);
    };
  }, [orderId]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!order?.expires_at) return;

    const cancelExpired = () => {
      if (cancelledRef.current) return;
      cancelledRef.current = true;
      supabase.rpc('cancel_order', {
        p_order_id: orderId,
        p_cancelled_by: 'customer',
        p_user_id: profile?.id,
        p_reason: 'Order expired — no rider found in time',
      } as any).then();
    };

    // Already expired when screen loads
    const initialSecs = Math.max(0, Math.floor((new Date(order.expires_at).getTime() - Date.now()) / 1000));
    if (initialSecs === 0) {
      setTimeLeft(0);
      cancelExpired();
      return;
    }

    const tick = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(order.expires_at!).getTime() - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0) {
        clearInterval(tick);
        cancelExpired();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [order?.expires_at, orderId, profile?.id]);

  // ── Cancel ────────────────────────────────────────────────────────────────
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const region = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <View style={styles.container}>
      {/* ── Full-screen dark map ─────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        region={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        customMapStyle={MAP_STYLE}
      >
        {/* Pickup / customer location marker */}
        <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.pickupMarker}>
            <View style={styles.pickupDot} />
          </View>
        </Marker>

        {/* Dummy rider markers converging toward pickup */}
        {DUMMY_RIDERS.map((r, i) => {
          // Note: Animated.Value coords don't animate on native MapView; use static offsets
          // that look like different positions around center
          return (
            <Marker
              key={r.id}
              coordinate={{
                latitude:  center.latitude  + r.startLatOffset,
                longitude: center.longitude + r.startLngOffset,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.riderMarker}>
                <Text style={styles.riderMarkerText}>🛵</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* ── Header overlay ──────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoMark} />
          <Text style={styles.logoText}>dzpatch</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Searching</Text>
        </View>
      </View>

      {/* ── Pulse ring around pickup ─────────────────────────────────────── */}
      <View style={styles.pulseContainer} pointerEvents="none">
        <Animated.View
          style={[
            styles.pulseRing,
            {
              opacity: pulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.15, 0] }),
              transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.8] }) }],
            },
          ]}
        />
      </View>

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>

        {timeLeft === 0 ? (
          /* ── Expired state ──────────────────────────────────────────────── */
          <>
            <View style={styles.expiredHeader}>
              <View style={styles.expiredIcon}>
                <Text style={styles.expiredIconText}>!</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.expiredTitle}>Order Expired</Text>
                <Text style={styles.expiredSub}>No riders were available. Your order has been cancelled and any payment refunded.</Text>
              </View>
            </View>
            <Pressable
              style={styles.retryBtn}
              onPress={() => router.replace('/(customer)/' as any)}
            >
              <Text style={styles.retryBtnText}>Back to Home</Text>
            </Pressable>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => router.replace({ pathname: '/(customer)/create-order' } as any)}
            >
              <Text style={styles.cancelBtnText}>Try Again</Text>
            </Pressable>
          </>
        ) : (
          /* ── Searching state ────────────────────────────────────────────── */
          <>
            {/* Scan bar */}
            <View style={styles.scanTrack}>
              <Animated.View
                style={[
                  styles.scanBar,
                  {
                    left: scanAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] as any }),
                  },
                ]}
              />
            </View>

            {/* Title + timer */}
            <View style={styles.titleRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sheetTitle}>Finding your rider</Text>
                {riderViews > 0 ? (
                  <View style={styles.viewerRow}>
                    <View style={styles.viewerDot} />
                    <Text style={styles.viewerText}>
                      {riderViews} rider{riderViews !== 1 ? 's' : ''} viewed your offer
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.sheetSub}>Matching you with the nearest rider...</Text>
                )}
              </View>
              {timeLeft !== null && timeLeft > 0 && timeLeft <= 1800 && (
                <View style={[styles.timerBadge, timeLeft <= 300 && styles.timerBadgeUrgent]}>
                  <Text style={[styles.timerText, timeLeft <= 300 && styles.timerTextUrgent]}>{formatTime(timeLeft)}</Text>
                  <Text style={[styles.timerLabel, timeLeft <= 300 && styles.timerTextUrgent]}>left</Text>
                </View>
              )}
            </View>

            {/* Order summary */}
            {order && (
              <View style={styles.orderCard}>
                <View style={styles.orderRow}>
                  <View style={styles.orderDotFrom} />
                  <Text style={styles.orderAddr} numberOfLines={1}>{order.pickup_address}</Text>
                </View>
                <View style={styles.orderConnector} />
                <View style={styles.orderRow}>
                  <View style={styles.orderDotTo} />
                  <Text style={styles.orderAddr} numberOfLines={1}>{order.dropoff_address}</Text>
                </View>
                <View style={styles.orderMeta}>
                  <View style={styles.orderMetaBadge}>
                    <Text style={styles.orderMetaBadgeText}>{order.package_size.replace('_', ' ')}</Text>
                  </View>
                  <View style={styles.orderMetaBadge}>
                    <Text style={styles.orderMetaBadgeText}>
                      {order.payment_method === 'cash' ? '💵 Cash' : '👛 Wallet'}
                    </Text>
                  </View>
                  <Text style={styles.orderPrice}>₦{Number(order.final_price || order.dynamic_price).toLocaleString()}</Text>
                </View>
              </View>
            )}

            {/* Cancel button */}
            <Pressable
              style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
              onPress={handleCancel}
              disabled={cancelling}
            >
              <Text style={styles.cancelBtnText}>{cancelling ? 'Cancelling...' : 'Cancel Search'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingBottom: 12,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoMark: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#0040e0',
  },
  logoText: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusText: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Pickup marker
  pickupMarker: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,64,224,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0040e0',
  },
  pickupDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#0040e0',
  },

  // Rider marker
  riderMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  riderMarkerText: { fontSize: 20 },

  // Pulse ring (centered in screen)
  pulseContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 260,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pulseRing: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 2, borderColor: '#0040e0',
    backgroundColor: 'rgba(0,64,224,0.08)',
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing[5],
    paddingTop: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 20,
  },

  // Scan bar
  scanTrack: {
    height: 3,
    backgroundColor: '#F1F4F6',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  scanBar: {
    position: 'absolute',
    width: 60,
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#0040e0',
    opacity: 0.7,
  },

  // Title row
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  sheetSub: {
    fontSize: Typography.sm,
    color: '#74777e',
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewerDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  viewerText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: '#16a34a',
  },
  timerBadge: {
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 60,
  },
  timerText: {
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
    letterSpacing: -0.5,
  },
  timerLabel: {
    fontSize: 10,
    color: '#0040e0',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Order card
  orderCard: {
    backgroundColor: '#F7FAFC',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderDotFrom: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: '#0040e0',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  orderDotTo: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#0040e0',
    flexShrink: 0,
  },
  orderConnector: {
    width: 1, height: 16,
    backgroundColor: '#C4C6CF',
    marginLeft: 4.5,
  },
  orderAddr: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
  },
  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  orderMetaBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#E8EAF0',
    borderRadius: 999,
  },
  orderMetaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#44474e',
    textTransform: 'capitalize',
  },
  orderPrice: {
    marginLeft: 'auto',
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
  },

  // Cancel
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

  // Timer urgent state (last 60s)
  timerBadgeUrgent: { backgroundColor: '#FEF2F2' },
  timerTextUrgent: { color: '#dc2626' },

  // Expired state
  expiredHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  expiredIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  expiredIconText: {
    fontSize: 22,
    fontWeight: Typography.extrabold,
    color: '#dc2626',
  },
  expiredTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: '#000D22',
  },
  expiredSub: {
    fontSize: Typography.sm,
    color: '#74777e',
    lineHeight: 20,
  },
  retryBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#0040e0',
  },
  retryBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
  },
});
