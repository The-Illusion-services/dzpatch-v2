import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Avatar } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Bid = {
  id: string;
  order_id: string;
  rider_id: string;
  amount: number;
  status: string;
  created_at: string;
  // joined
  rider_name: string;
  rider_avatar: string | null;
  rider_rating: number;
  rider_trips: number;
  vehicle_type: string;
};

type ActivityItem = {
  id: string;
  text: string;
  color: string;
  time: string;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LiveBiddingScreen() {
  const insets = useSafeAreaInsets();
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
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Live ping animation
  const pingAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pingAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Fetch order + bids ────────────────────────────────────────────────────

  const fetchData = async () => {
    const [orderRes, bidsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('pickup_address, dropoff_address, package_size, dynamic_price, expires_at')
        .eq('id', orderId)
        .single(),
      supabase
        .from('bids')
        .select(`
          id, order_id, rider_id, amount, status, created_at,
          riders!inner(
            average_rating, total_trips, vehicle_type,
            profiles!inner(full_name, avatar_url)
          )
        `)
        .eq('order_id', orderId)
        .eq('status', 'pending')
        .order('amount', { ascending: true }),
    ]);

    if (orderRes.data) setOrder(orderRes.data as any);

    if (bidsRes.data) {
      const mapped: Bid[] = (bidsRes.data as any[]).map((b) => ({
        id: b.id,
        order_id: b.order_id,
        rider_id: b.rider_id,
        amount: b.amount,
        status: b.status,
        created_at: b.created_at,
        rider_name: b.riders?.profiles?.full_name ?? 'Rider',
        rider_avatar: b.riders?.profiles?.avatar_url ?? null,
        rider_rating: b.riders?.average_rating ?? 0,
        rider_trips: b.riders?.total_trips ?? 0,
        vehicle_type: b.riders?.vehicle_type ?? 'motorcycle',
      }));
      setBids(mapped);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime: new bids coming in
    const channel = supabase
      .channel(`bids:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        async (payload) => {
          // Fetch rider details for the new bid
          const { data: riderData } = await supabase
            .from('riders')
            .select('average_rating, total_trips, vehicle_type, profiles(full_name, avatar_url)')
            .eq('profile_id', (payload.new as any).rider_id)
            .single();

          const newBid: Bid = {
            id: (payload.new as any).id,
            order_id: (payload.new as any).order_id,
            rider_id: (payload.new as any).rider_id,
            amount: (payload.new as any).amount,
            status: (payload.new as any).status,
            created_at: (payload.new as any).created_at,
            rider_name: (riderData as any)?.profiles?.full_name ?? 'Rider',
            rider_avatar: (riderData as any)?.profiles?.avatar_url ?? null,
            rider_rating: (riderData as any)?.average_rating ?? 0,
            rider_trips: (riderData as any)?.total_trips ?? 0,
            vehicle_type: (riderData as any)?.vehicle_type ?? 'motorcycle',
          };

          setBids((prev) => {
            const exists = prev.find((b) => b.id === newBid.id);
            if (exists) return prev;
            return [...prev, newBid].sort((a, b) => a.amount - b.amount);
          });

          addActivity(`New offer: ₦${Number((payload.new as any).amount).toLocaleString()}`, '#0040e0');
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status !== 'pending') {
            setBids((prev) => prev.filter((b) => b.id !== updated.id));
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

    return () => { channel.unsubscribe(); };
  }, [orderId]);

  // ── Countdown ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!order?.expires_at) return;
    const tick = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(order.expires_at!).getTime() - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [order?.expires_at]);

  // ── Activity log helper ───────────────────────────────────────────────────

  const addActivity = (text: string, color: string) => {
    setActivity((prev) => [
      {
        id: Date.now().toString(),
        text,
        color,
        time: new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
      },
      ...prev.slice(0, 9),
    ]);
  };

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
              addActivity(`Accepted ${bid.rider_name}'s offer`, '#22c55e');
              router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
            }
          },
        },
      ]
    );
  };

  // ── Counter-offer ─────────────────────────────────────────────────────────

  const handleNegotiate = (bid: Bid) => {
    router.push({
      pathname: '/(customer)/counter-offer',
      params: { orderId, bidId: bid.id, riderName: bid.rider_name, bidAmount: bid.amount.toString() },
    } as any);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const vehicleIcon: Record<string, string> = {
    motorcycle: '🏍️', bicycle: '🚲', car: '🚗', van: '🚐', truck: '🚛',
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Rider Offers</Text>
          {/* Live badge */}
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { opacity: pingAnim }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        {/* Timer */}
        <View style={[styles.timerBadge, timeLeft < 30 && styles.timerBadgeUrgent]}>
          <Text style={[styles.timerText, timeLeft < 30 && styles.timerTextUrgent]}>
            {timeLeft > 0 ? formatTime(timeLeft) : '--:--'}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Order summary strip */}
        {order && (
          <View style={styles.orderStrip}>
            <View style={styles.orderStripRow}>
              <Text style={styles.orderStripIcon}>📍</Text>
              <Text style={styles.orderStripText} numberOfLines={1}>{order.pickup_address}</Text>
            </View>
            <Text style={styles.orderStripArrow}>↓</Text>
            <View style={styles.orderStripRow}>
              <Text style={styles.orderStripIcon}>🎯</Text>
              <Text style={styles.orderStripText} numberOfLines={1}>{order.dropoff_address}</Text>
            </View>
          </View>
        )}

        {/* Bids section title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {bids.length === 0 ? 'Waiting for offers...' : `${bids.length} offer${bids.length !== 1 ? 's' : ''} received`}
          </Text>
          {bids.length > 0 && (
            <Text style={styles.sectionHint}>Lowest first</Text>
          )}
        </View>

        {/* Empty state */}
        {bids.length === 0 && (
          <View style={styles.emptyBids}>
            <Text style={styles.emptyBidsIcon}>⏳</Text>
            <Text style={styles.emptyBidsText}>Riders are reviewing your order...</Text>
          </View>
        )}

        {/* Bid cards */}
        {bids.map((bid, index) => (
          <View key={bid.id} style={[styles.bidCard, index === 0 && styles.bidCardBest]}>
            {index === 0 && bids.length > 1 && (
              <View style={styles.bestBadge}>
                <Text style={styles.bestBadgeText}>Best Value</Text>
              </View>
            )}

            {/* Rider info row */}
            <View style={styles.bidRiderRow}>
              <Avatar name={bid.rider_name} uri={bid.rider_avatar} size="md" />
              <View style={{ flex: 1 }}>
                <Text style={styles.bidRiderName}>{bid.rider_name}</Text>
                <View style={styles.bidRiderMeta}>
                  <Text style={styles.bidRatingText}>⭐ {bid.rider_rating.toFixed(1)}</Text>
                  <Text style={styles.bidMetaDot}>·</Text>
                  <Text style={styles.bidTripsText}>{bid.rider_trips} trips</Text>
                  <Text style={styles.bidMetaDot}>·</Text>
                  <Text style={styles.bidVehicleText}>{vehicleIcon[bid.vehicle_type] ?? '🏍️'} {bid.vehicle_type}</Text>
                </View>
              </View>
              {/* Bid amount */}
              <View style={styles.bidAmountWrap}>
                <Text style={styles.bidAmount}>₦{Number(bid.amount).toLocaleString()}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.bidActions}>
              <Pressable
                style={styles.negotiateBtn}
                onPress={() => handleNegotiate(bid)}
              >
                <Text style={styles.negotiateBtnText}>Negotiate</Text>
              </Pressable>
              <Pressable
                style={[styles.acceptBtn, accepting === bid.id && styles.acceptBtnDisabled]}
                onPress={() => handleAccept(bid)}
                disabled={accepting !== null}
              >
                <Text style={styles.acceptBtnText}>
                  {accepting === bid.id ? 'Accepting...' : 'Accept Offer'}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Live Activity feed */}
        {activity.length > 0 && (
          <View style={styles.activitySection}>
            <Text style={styles.sectionTitle}>Live Activity</Text>
            {activity.map((item) => (
              <View key={item.id} style={styles.activityRow}>
                <View style={[styles.activityDot, { backgroundColor: item.color }]} />
                <Text style={styles.activityText}>{item.text}</Text>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Cancel */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: '600' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#dde1ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0040e0' },
  liveText: { fontSize: 9, fontWeight: Typography.bold, color: '#0040e0', letterSpacing: 1 },
  timerBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F1F4F6', borderRadius: 10,
  },
  timerBadgeUrgent: { backgroundColor: '#ffdad6' },
  timerText: {
    fontSize: Typography.sm, fontWeight: Typography.extrabold,
    color: '#000D22', letterSpacing: 1,
  },
  timerTextUrgent: { color: '#ba1a1a' },

  scroll: { paddingBottom: 100 },

  orderStrip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F6',
  },
  orderStripRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderStripIcon: { fontSize: 14 },
  orderStripText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.medium, color: '#000D22' },
  orderStripArrow: { fontSize: 14, color: '#74777e', marginLeft: 22 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingTop: 20, paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22',
  },
  sectionHint: { fontSize: Typography.xs, color: '#74777e' },
  activitySection: { paddingHorizontal: Spacing[5], paddingTop: 20, gap: 8 },

  emptyBids: {
    alignItems: 'center', paddingVertical: 40, gap: 10,
    paddingHorizontal: Spacing[5],
  },
  emptyBidsIcon: { fontSize: 36 },
  emptyBidsText: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center' },

  bidCard: {
    marginHorizontal: Spacing[5],
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  bidCardBest: {
    borderWidth: 1.5,
    borderColor: '#0040e0',
  },
  bestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0040e0',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 999,
    marginBottom: -4,
  },
  bestBadgeText: {
    fontSize: 10, fontWeight: Typography.bold, color: '#FFFFFF',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  bidRiderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bidRiderName: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  bidRiderMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  bidRatingText: { fontSize: Typography.xs, color: '#44474e' },
  bidMetaDot: { fontSize: Typography.xs, color: '#c4c6cf' },
  bidTripsText: { fontSize: Typography.xs, color: '#44474e' },
  bidVehicleText: { fontSize: Typography.xs, color: '#44474e', textTransform: 'capitalize' },
  bidAmountWrap: { alignItems: 'flex-end' },
  bidAmount: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: '#000D22', letterSpacing: -0.5 },

  bidActions: { flexDirection: 'row', gap: 10 },
  negotiateBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#0040e0',
  },
  negotiateBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#0040e0' },
  acceptBtn: {
    flex: 2, paddingVertical: 12, alignItems: 'center',
    borderRadius: 12, backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  activityText: { flex: 1, fontSize: Typography.xs, color: '#44474e' },
  activityTime: { fontSize: Typography.xs, color: '#c4c6cf' },

  bottomBar: {
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: 'rgba(196,198,207,0.2)',
  },
  cancelBtn: {
    paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: '#c4c6cf',
  },
  cancelBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#44474e' },
});