import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Avatar } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import { DEFAULT_COUNTDOWN_TICK_MS } from '@/constants/timing';
import type { LatLng } from '@/lib/location';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Bid = {
  id: string;
  order_id: string;
  rider_id: string;
  amount: number;
  status: string; // 'pending' | 'expired'
  created_at: string;
  rider_name: string;
  rider_avatar: string | null;
  rider_rating: number;
  rider_trips: number;
  vehicle_type: string;
  negotiation_round: number;
};

function normalizeBidRow(row: any): Bid | null {
  const negotiationRound = Number(row?.negotiation_round ?? 1) || 1;
  if (negotiationRound % 2 === 0) {
    return null;
  }

  return {
    id: row.id,
    order_id: row.order_id,
    rider_id: row.rider_id,
    amount: row.amount,
    status: row.status,
    created_at: row.created_at,
    rider_name: row.riders?.profiles?.full_name ?? 'Rider',
    rider_avatar: row.riders?.profiles?.avatar_url ?? null,
    rider_rating: row.riders?.average_rating ?? 0,
    rider_trips: row.riders?.total_trips ?? 0,
    vehicle_type: row.riders?.vehicle_type ?? 'motorcycle',
    negotiation_round: negotiationRound,
  };
}

const DEFAULT_CENTER = { latitude: 5.9631, longitude: 8.3271 };

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f7fa' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e8ecf0' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9dff0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// Deterministic scatter: derived purely from bid ID (stable — never depends on list index)
function scatterCoord(id: string, center: { latitude: number; longitude: number }) {
  // Use chars spread across the UUID for better entropy
  const c = (n: number) => id.charCodeAt(n % id.length);
  const seed  = (c(0) + c(4) + c(8)  + c(12)) / 1020;
  const seed2 = (c(2) + c(6) + c(10) + c(14)) / 1020;
  return {
    latitude:  center.latitude  + (seed  - 0.5) * 0.06,
    longitude: center.longitude + (seed2 - 0.5) * 0.06,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LiveBiddingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile } = useAuthStore();

  const [bids, setBids] = useState<Bid[]>([]);
  const [order, setOrder] = useState<{
    pickup_address: string;
    dropoff_address: string;
    package_size: string;
    dynamic_price: number;
    expires_at: string | null;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [bidLocations, setBidLocations] = useState<Record<string, LatLng>>({});
  const [selectedBid, setSelectedBid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchBidById = useCallback(async (bidId: string) => {
    const { data } = await supabase
      .from('bids')
      .select(`
        id, order_id, rider_id, amount, status, created_at, negotiation_round,
        riders(
          average_rating, total_trips, vehicle_type,
          profiles(full_name, avatar_url)
        )
      `)
      .eq('id', bidId)
      .maybeSingle();

    return data ? normalizeBidRow(data as any) : null;
  }, []);

  const fetchBidLocations = useCallback(async (rows: Bid[]) => {
    const riderIds = Array.from(new Set(rows.map((bid) => bid.rider_id))).filter(Boolean);
    if (riderIds.length === 0) {
      setBidLocations({});
      return;
    }

    const { data, error } = await supabase
      .from('rider_locations')
      .select('rider_id, latitude, longitude')
      .in('rider_id', riderIds);

    if (error) {
      console.warn('live-bidding load rider locations failed:', error.message);
      return;
    }

    const nextLocations = ((data ?? []) as { rider_id: string; latitude: number; longitude: number }[]).reduce<Record<string, LatLng>>(
      (acc, row) => {
        acc[row.rider_id] = { latitude: row.latitude, longitude: row.longitude };
        return acc;
      },
      {}
    );

    setBidLocations(nextLocations);
  }, []);

  // Live ping animation
  const pingAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pingAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get user location for map center — last known first (instant), then refine
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const last = await Location.getLastKnownPositionAsync();
      if (last) setCenter({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCenter({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        // GPS unavailable — stay on last known or default center
      }
    })();
  }, []);

  // ── Fetch order + bids ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!orderId) return;
    const [orderRes, bidsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('pickup_address, dropoff_address, package_size, dynamic_price, expires_at')
        .eq('id', orderId)
        .single(),
      supabase
        .from('bids')
        .select(`
          id, order_id, rider_id, amount, status, created_at, negotiation_round,
          riders(
            average_rating, total_trips, vehicle_type,
            profiles(full_name, avatar_url)
          )
        `)
        .eq('order_id', orderId)
        .in('status', ['pending', 'expired'])
        .order('amount', { ascending: true }),
    ]);

    if (orderRes.error) {
      console.warn('live-bidding load order failed:', orderRes.error.message);
    } else if (orderRes.data) {
      setOrder((orderRes as any).data as any);
    }

    if (bidsRes.error) {
      console.warn('live-bidding load bids failed:', bidsRes.error.message);
    } else if (bidsRes.data) {
      const mapped = (bidsRes.data as any[])
        .map((bidRow) => normalizeBidRow(bidRow))
        .filter((bid): bid is Bid => bid !== null);
      setBids(mapped);
      void fetchBidLocations(mapped);
      if (mapped.length > 0) setSelectedBid((s) => s ?? mapped[0].id);
    }
  }, [fetchBidLocations, orderId]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));

    const channel = supabase
      .channel(`bids:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        async (payload) => {
          const newBidId = (payload.new as any).id;
          const newBid = await fetchBidById(newBidId);
          if (!newBid) return;
          void fetchBidLocations([newBid]);

          setBids((prev) => {
            const exists = prev.find((b) => b.id === newBid.id);
            if (exists) return prev;
            const sorted = [...prev, newBid].sort((a, b) => a.amount - b.amount);
            setSelectedBid((s) => s ?? sorted[0].id);
            return sorted;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        async (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'rejected') {
            // Rejected — truly gone
            setBids((prev) => {
              const next = prev.filter((b) => b.id !== updated.id);
              setSelectedBid((s) => s === updated.id ? (next[0]?.id ?? null) : s);
              return next;
            });
          } else if (updated.status === 'countered') {
            // Customer sent a counter — keep card visible as "negotiating" so screen isn't blank
            setBids((prev) => prev.map((b) => b.id === updated.id ? { ...b, status: 'countered' } : b));
          } else if (updated.status === 'expired') {
            // Keep expired bids visible with Expired label — customer can still see what was offered
            setBids((prev) => prev.map((b) => b.id === updated.id ? { ...b, status: 'expired' } : b));
          } else if (updated.status === 'pending') {
            // Amount updated — refresh
            const refreshedBid = await fetchBidById(updated.id);
            if (!refreshedBid) return;
            void fetchBidLocations([refreshedBid]);
            setBids((prev) => {
              const exists = prev.some((bid) => bid.id === refreshedBid.id);
              const next = exists
                ? prev.map((bid) => (bid.id === refreshedBid.id ? refreshedBid : bid))
                : [...prev, refreshedBid];
              return next.sort((a, b) => a.amount - b.amount);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'matched') {
            router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [orderId, fetchBidById, fetchBidLocations, fetchData]);

  useAppStateChannels([channelRef.current], {
    onForeground: fetchData,
  });

  // ── Countdown ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!order?.expires_at) return;
    const tick = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(order.expires_at!).getTime() - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0) clearInterval(tick);
    }, DEFAULT_COUNTDOWN_TICK_MS);
    return () => clearInterval(tick);
  }, [order?.expires_at]);

  // ── Accept bid ────────────────────────────────────────────────────────────

  const handleAccept = async (bid: Bid) => {
    Alert.alert(
      'Accept Offer',
      `Accept ₦${Number(bid.amount).toLocaleString()} from ${bid.rider_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAccepting(bid.id);
            const { error } = await supabase.rpc('accept_bid', {
              p_bid_id: bid.id,
              p_customer_id: profile?.id,
            } as any);
            setAccepting(null);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
            }
          },
        },
      ]
    );
  };

  const handleNegotiate = (bid: Bid) => {
    router.push({
      pathname: '/(customer)/counter-offer',
      params: {
        orderId,
        bidId: bid.id,
        riderId: bid.rider_id,
        riderName: bid.rider_name,
        bidAmount: bid.amount.toString(),
        negotiationRound: String(bid.negotiation_round ?? 1),
      },
    } as any);
  };

  const formatTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const vehicleIcon: Record<string, string> = useMemo(() => ({
    motorcycle: '🏍️', bicycle: '🚲', car: '🚗', van: '🚐', truck: '🚛',
  }), []);

  const activeBid = bids.find((b) => b.id === selectedBid) ?? bids[0] ?? null;

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Text style={styles.loadingText}>Refreshing offers...</Text>
        </View>
      )}
      {/* ── Full-screen Map ─────────────────────────────────────────────── */}
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        region={{ ...center, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        customMapStyle={MAP_STYLE}
      >
        {/* Customer location */}
        <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.centerPin}>
            <View style={styles.centerPinInner} />
          </View>
        </Marker>

        {/* Rider markers scattered around — coords are stable (memoised per bid.id) */}
        {bids.map((bid) => (
          <Marker
            key={bid.id}
            coordinate={bidLocations[bid.rider_id] ?? scatterCoord(bid.id, center)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onPress={() => setSelectedBid(bid.id)}
          >
            <View style={[styles.riderPin, bid.id === selectedBid && styles.riderPinSelected]}>
              <Text style={styles.riderPinText}>{vehicleIcon[bid.vehicle_type] ?? '🏍️'}</Text>
              <View style={[styles.riderPinBadge, bid.id === selectedBid && styles.riderPinBadgeSelected]}>
                <Text style={[styles.riderPinPrice, bid.id === selectedBid && styles.riderPinPriceSelected]}>
                  ₦{(bid.amount / 1000).toFixed(0)}k
                </Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── Header overlay ──────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { opacity: pingAnim }]} />
            <Text style={styles.liveText}>LIVE OFFERS</Text>
          </View>
          {bids.length > 0 && (
            <Text style={styles.bidCount}>{bids.length} rider{bids.length !== 1 ? 's' : ''}</Text>
          )}
        </View>

        {timeLeft > 0 && (
          <View style={[styles.timerChip, timeLeft < 300 && styles.timerChipUrgent]}>
            <Text style={[styles.timerText, timeLeft < 300 && styles.timerTextUrgent]}>{formatTime(timeLeft)}</Text>
          </View>
        )}
      </View>

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>

        {/* Order strip */}
        {order && (
          <View style={styles.orderStrip}>
            <View style={styles.orderDot} />
            <Text style={styles.orderStripText} numberOfLines={1}>{order.pickup_address}</Text>
            <Text style={styles.orderArrow}>→</Text>
            <Text style={styles.orderStripText} numberOfLines={1}>{order.dropoff_address}</Text>
          </View>
        )}

        {/* Waiting state */}
        {bids.length === 0 ? (
          <View style={styles.waitingState}>
            <Animated.View style={[styles.waitingPulse, { opacity: pingAnim }]} />
            <Text style={styles.waitingTitle}>Waiting for offers...</Text>
            <Text style={styles.waitingSub}>Riders are reviewing your order</Text>
          </View>
        ) : (
          <>
            {/* Bid tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bidTabs}>
              {bids.map((bid, idx) => {
                const isExpired = bid.status === 'expired';
                const isCountered = bid.status === 'countered';
                return (
                  <Pressable
                    key={bid.id}
                    style={[
                      styles.bidTab,
                      isExpired && styles.bidTabExpired,
                      isCountered && styles.bidTabCounter,
                      !isExpired && !isCountered && bid.negotiation_round > 1 && styles.bidTabCounter,
                      bid.id === selectedBid && !isExpired && !isCountered && styles.bidTabActive,
                    ]}
                    onPress={() => setSelectedBid(bid.id)}
                  >
                    {isExpired ? (
                      <Text style={styles.expiredLabel}>EXPIRED</Text>
                    ) : isCountered ? (
                      <Text style={styles.counterLabel}>COUNTERED</Text>
                    ) : bid.negotiation_round > 1 ? (
                      <Text style={styles.counterLabel}>COUNTER</Text>
                    ) : idx === 0 && bids.length > 1 ? (
                      <Text style={styles.bestLabel}>BEST</Text>
                    ) : null}
                    <Text style={[styles.bidTabAmount, bid.id === selectedBid && !isExpired && styles.bidTabAmountActive, isExpired && styles.bidTabAmountExpired]}>
                      ₦{Number(bid.amount).toLocaleString()}
                    </Text>
                    <Text style={[styles.bidTabName, bid.id === selectedBid && !isExpired && styles.bidTabNameActive]} numberOfLines={1}>
                      {bid.rider_name.split(' ')[0]}
                    </Text>
                    <Text style={[styles.bidTabRating, bid.id === selectedBid && !isExpired && styles.bidTabRatingActive]}>
                      ⭐ {bid.rider_rating.toFixed(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Active bid detail card */}
            {activeBid && (
              <View style={[styles.bidDetail, activeBid.status === 'expired' && styles.bidDetailExpired]}>
                <View style={styles.bidDetailTop}>
                  <Avatar name={activeBid.rider_name} uri={activeBid.rider_avatar} size="lg" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.bidDetailName}>{activeBid.rider_name}</Text>
                    <View style={styles.bidDetailMeta}>
                      <Text style={styles.metaChip}>⭐ {activeBid.rider_rating.toFixed(1)}</Text>
                      <Text style={styles.metaChip}>{activeBid.rider_trips} trips</Text>
                      <Text style={styles.metaChip}>{vehicleIcon[activeBid.vehicle_type] ?? '🏍️'} {activeBid.vehicle_type}</Text>
                    </View>
                  </View>
                  <Text style={[styles.bidDetailAmount, activeBid.status === 'expired' && styles.bidDetailAmountExpired]}>
                    ₦{Number(activeBid.amount).toLocaleString()}
                  </Text>
                </View>

                {activeBid.status === 'expired' ? (
                  <View style={styles.expiredNotice}>
                    <Text style={styles.expiredNoticeText}>This bid expired — the rider can rebid on your order</Text>
                  </View>
                ) : activeBid.status === 'countered' ? (
                  <View style={styles.expiredNotice}>
                    <Text style={styles.expiredNoticeText}>Counter sent — waiting for rider to respond</Text>
                  </View>
                ) : (
                  <View style={styles.bidDetailActions}>
                    <Pressable style={styles.negotiateBtn} onPress={() => handleNegotiate(activeBid)}>
                      <Text style={styles.negotiateBtnText}>Negotiate</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.acceptBtn, accepting === activeBid.id && styles.acceptBtnDisabled]}
                      onPress={() => handleAccept(activeBid)}
                      disabled={accepting !== null}
                    >
                      <Text style={styles.acceptBtnText}>
                        {accepting === activeBid.id ? 'Accepting...' : 'Accept Offer'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* Cancel */}
        <Pressable
          style={styles.cancelBtn}
          onPress={() => {
            Alert.alert('Cancel Order', 'Cancel this order and stop receiving bids?', [
              { text: 'Keep Waiting', style: 'cancel' },
              {
                text: 'Cancel Order',
                style: 'destructive',
                onPress: async () => {
                  await supabase.rpc('cancel_order', {
                    p_order_id: orderId,
                    p_cancelled_by: 'customer',
                    p_user_id: profile?.id,
                    p_reason: 'Customer cancelled during bidding',
                  } as any);
                  router.replace('/(customer)/' as any);
                },
              },
            ]);
          }}
        >
          <Text style={styles.cancelBtnText}>Cancel Order</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof import('@/hooks/use-theme').useTheme>['colors']) {
  return StyleSheet.create({
  container: { flex: 1 },
  loadingOverlay: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    zIndex: 40,
    backgroundColor: 'rgba(0, 13, 34, 0.82)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  loadingText: { color: '#FFFFFF', fontSize: Typography.xs, fontWeight: Typography.bold },

  // Header overlay
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: '600' },
  headerCenter: { flex: 1, gap: 3 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0040e0' },
  liveText: { fontSize: 10, fontWeight: '800', color: '#0040e0', letterSpacing: 1.5, textTransform: 'uppercase' },
  bidCount: {
    fontSize: Typography.xs, fontWeight: '700', color: colors.textSecondary,
    marginLeft: 2,
  },
  timerChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12,
    backgroundColor: colors.surface,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  timerChipUrgent: { backgroundColor: '#ffdad6' },
  timerText: { fontSize: Typography.sm, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.5 },
  timerTextUrgent: { color: '#ba1a1a' },

  // Map markers
  centerPin: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,64,224,0.2)', borderWidth: 2.5, borderColor: '#0040e0',
    alignItems: 'center', justifyContent: 'center',
  },
  centerPinInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0040e0' },
  riderPin: {
    alignItems: 'center', gap: 2,
    backgroundColor: colors.surface,
    borderRadius: 16, padding: 6,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
    borderWidth: 1.5, borderColor: colors.border,
  },
  riderPinSelected: {
    backgroundColor: '#0040e0', borderColor: '#0040e0',
    shadowColor: '#0040e0', shadowOpacity: 0.4,
  },
  riderPinText: { fontSize: 18 },
  riderPinBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  riderPinBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.25)' },
  riderPinPrice: { fontSize: 9, fontWeight: '800', color: '#0040e0' },
  riderPinPriceSelected: { color: '#FFFFFF' },

  // Bottom sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing[5], paddingTop: 16,
    gap: 14,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 16,
  },

  // Order strip
  orderStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  orderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0040e0', flexShrink: 0 },
  orderStripText: { flex: 1, fontSize: Typography.xs, fontWeight: '600', color: colors.textSecondary },
  orderArrow: { fontSize: Typography.xs, color: colors.textDisabled, fontWeight: '700' },

  // Waiting state
  waitingState: {
    alignItems: 'center', paddingVertical: 24, gap: 8,
  },
  waitingPulse: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#EEF2FF',
    position: 'absolute', top: 12,
  },
  waitingTitle: { fontSize: Typography.md, fontWeight: '700', color: colors.textPrimary },
  waitingSub: { fontSize: Typography.sm, color: colors.textSecondary },

  // Bid tabs
  bidTabs: { gap: 8, paddingVertical: 2 },
  bidTab: {
    alignItems: 'center', gap: 2, minWidth: 80,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  bidTabActive: { backgroundColor: '#EEF2FF', borderColor: '#0040e0' },
  bestLabel: { fontSize: 8, fontWeight: '800', color: '#0040e0', letterSpacing: 1.5, textTransform: 'uppercase' },
  counterLabel: { fontSize: 8, fontWeight: '800', color: '#b45309', letterSpacing: 1.5, textTransform: 'uppercase' },
  expiredLabel: { fontSize: 8, fontWeight: '800', color: '#74777e', letterSpacing: 1.5, textTransform: 'uppercase' },
  bidTabCounter: { backgroundColor: '#fff4e5', borderColor: '#f59e0b' },
  bidTabExpired: { backgroundColor: colors.background, opacity: 0.55, borderColor: 'transparent' },
  bidTabAmount: { fontSize: Typography.sm, fontWeight: '800', color: colors.textSecondary },
  bidTabAmountActive: { color: '#0040e0' },
  bidTabAmountExpired: { color: colors.textDisabled, textDecorationLine: 'line-through' },
  bidTabName: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  bidTabNameActive: { color: '#0040e0' },
  bidTabRating: { fontSize: 9, fontWeight: '600', color: colors.textSecondary },
  bidTabRatingActive: { color: '#0040e0' },

  // Bid detail
  bidDetail: {
    backgroundColor: colors.background, borderRadius: 20,
    padding: 16, gap: 14,
  },
  bidDetailTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bidDetailName: { fontSize: Typography.md, fontWeight: '700', color: colors.textPrimary },
  bidDetailMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  metaChip: { fontSize: Typography.xs, color: colors.textSecondary },
  bidDetailAmount: { fontSize: 26, fontWeight: '900', color: '#0040e0', letterSpacing: -0.5 },

  bidDetailExpired: { opacity: 0.7, borderWidth: 1, borderColor: colors.border },
  bidDetailAmountExpired: { color: colors.textDisabled, textDecorationLine: 'line-through' },
  expiredNotice: {
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: colors.background,
    borderRadius: 12, alignItems: 'center',
  },
  expiredNoticeText: { fontSize: Typography.xs, color: colors.textSecondary, textAlign: 'center' },
  bidDetailActions: { flexDirection: 'row', gap: 10 },
  negotiateBtn: {
    flex: 1, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#0040e0',
    backgroundColor: colors.surface,
  },
  negotiateBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#0040e0' },
  acceptBtn: {
    flex: 2, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' },

  // Cancel
  cancelBtn: {
    height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  cancelBtnText: { fontSize: Typography.sm, fontWeight: '600', color: colors.textSecondary },
  }); // end makeStyles
}
