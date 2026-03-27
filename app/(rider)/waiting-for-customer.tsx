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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WaitingForCustomerScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, bidAmount } = useLocalSearchParams<{ orderId: string; bidAmount: string }>();
  const { riderId } = useAuthStore();
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  // ── Radar pulse animation ──────────────────────────────────────────────────

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();

    animate(pulse1, 0);
    animate(pulse2, 600);
    animate(pulse3, 1200);
  }, [pulse1, pulse2, pulse3]);

  const pulseStyle = (anim: Animated.Value) => ({
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3.5] }) }],
    opacity: anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 0] }),
  });

  // ── Elapsed timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatElapsed = () => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // ── Realtime bid status subscription + poll fallback ─────────────────────

  useEffect(() => {
    if (!orderId || !riderId) return;

    // Poll every 5s — realtime RLS may block bid UPDATE events
    const poll = setInterval(async () => {
      const { data: bids } = await supabase
        .from('bids')
        .select('id, status, amount')
        .eq('order_id', orderId)
        .eq('rider_id', riderId)
        .order('created_at', { ascending: false })
        .limit(2);

      if (!bids || bids.length === 0) return;
      const latest = (bids as any[])[0];

      if (latest.status === 'accepted') {
        clearInterval(poll);
        router.replace({ pathname: '/(rider)/navigate-to-pickup' as any, params: { orderId } });
      } else if (latest.status === 'rejected' || latest.status === 'expired') {
        clearInterval(poll);
        router.replace({ pathname: '/(rider)/bid-declined' as any, params: { orderId } });
      } else if (latest.status === 'countered') {
        clearInterval(poll);
        // The counter bid is the most-recent pending bid
        const counterBid = (bids as any[]).find((b) => b.status === 'pending') ?? bids[1];
        router.replace({
          pathname: '/(rider)/counter-offer' as any,
          params: {
            orderId,
            originalBidId: latest.id,
            counterBidId: counterBid?.id ?? '',
            customerCounterAmount: String(counterBid?.amount ?? 0),
            myOriginalAmount: String(latest.amount),
          },
        });
      }
    }, 5000);

    const channel = supabase
      .channel(`bid-status-${orderId}-${riderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bids',
          filter: `order_id=eq.${orderId}`,
        },
        async (payload) => {
          const bid = payload.new as { id: string; status: string; rider_id: string; amount: number };
          if (bid.rider_id !== riderId) return;

          if (bid.status === 'accepted') {
            router.replace({ pathname: '/(rider)/navigate-to-pickup' as any, params: { orderId } });
          } else if (bid.status === 'rejected' || bid.status === 'expired') {
            router.replace({ pathname: '/(rider)/bid-declined' as any, params: { orderId } });
          } else if (bid.status === 'countered') {
            // Customer sent a counter-offer — fetch the new counter bid amount
            const { data: counterBid } = await supabase
              .from('bids')
              .select('id, amount')
              .eq('order_id', orderId)
              .eq('rider_id', riderId)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            router.replace({
              pathname: '/(rider)/counter-offer' as any,
              params: {
                orderId,
                originalBidId: bid.id,
                counterBidId: (counterBid as any)?.id ?? '',
                customerCounterAmount: String((counterBid as any)?.amount ?? 0),
                myOriginalAmount: String(bid.amount),
              },
            });
          }
        }
      )
      // Also watch for order status changes (customer may accept without bid table update)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const order = payload.new as { status: string; rider_id: string };
          // order.rider_id is riders.id UUID — compare against riderId (not profile.id)
          if (order.status === 'matched' && order.rider_id === riderId) {
            router.replace({
              pathname: '/(rider)/navigate-to-pickup' as any,
              params: { orderId },
            });
          } else if (order.status === 'cancelled') {
            router.replace({ pathname: '/(rider)/' as any });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [orderId, riderId]);

  // ── Cancel bid ─────────────────────────────────────────────────────────────

  const handleCancel = () => {
    Alert.alert('Cancel Bid?', 'Your bid will be withdrawn.', [
      { text: 'Keep Waiting', style: 'cancel' },
      {
        text: 'Cancel Bid',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          // Fetch the rider's pending bid ID first, then withdraw via RPC
          const { data: bidRow } = await supabase
            .from('bids')
            .select('id')
            .eq('order_id', orderId)
            .eq('rider_id', riderId)
            .in('status', ['pending', 'countered'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (bidRow) {
            const { error } = await (supabase as any).rpc('withdraw_bid', {
              p_bid_id: (bidRow as any).id,
              p_rider_id: riderId,
            });
            if (error) {
              setCancelling(false);
              Alert.alert('Error', error.message);
              return;
            }
          }
          router.replace({ pathname: '/(rider)/' as any });
        },
      },
    ]);
  };

  const amount = bidAmount ? parseInt(bidAmount, 10) : 0;
  const progress = Math.min((elapsed / 120) * 100, 100); // 2 min max

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Radar pulse visualization */}
      <View style={styles.radarContainer}>
        <Animated.View style={[styles.pulseRing, pulseStyle(pulse1)]} />
        <Animated.View style={[styles.pulseRing, pulseStyle(pulse2)]} />
        <Animated.View style={[styles.pulseRing, pulseStyle(pulse3)]} />
        <View style={styles.radarCenter}>
          <Ionicons name="radio-outline" size={32} color="#0040e0" />
        </View>
      </View>

      {/* Status Card */}
      <View style={[styles.card, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.cardHeader}>
          <View style={styles.waitingDot} />
          <Text style={styles.waitingLabel}>WAITING FOR RESPONSE</Text>
        </View>

        <Text style={styles.bidDisplayLabel}>Your Bid</Text>
        <Text style={styles.bidDisplay}>₦{amount.toLocaleString()}</Text>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={14} color="#74777e" />
            <Text style={styles.statValue}>{formatElapsed()}</Text>
            <Text style={styles.statLabel}>Waiting</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="trending-up-outline" size={14} color="#74777e" />
            <Text style={styles.statValue}>High</Text>
            <Text style={styles.statLabel}>Demand</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressLabel}>Bid window closes in {Math.max(0, 120 - elapsed)}s</Text>

        <Pressable style={styles.cancelBtn} onPress={handleCancel} disabled={cancelling}>
          <Ionicons name="close-circle-outline" size={16} color="#ba1a1a" />
          <Text style={styles.cancelText}>{cancelling ? 'Cancelling...' : 'Cancel Bid'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  // Radar
  radarContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0040e0',
  },
  radarCenter: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingTop: 24, paddingHorizontal: Spacing[5],
    gap: 16,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D97706' },
  waitingLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#D97706',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  bidDisplayLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1, textTransform: 'uppercase' },
  bidDisplay: { fontSize: 48, fontWeight: '900', color: '#000D22', lineHeight: 52 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statItem: { alignItems: 'center', gap: 2 },
  statDivider: { flex: 1, height: 1, backgroundColor: '#F1F4F6' },
  statValue: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  statLabel: { fontSize: Typography.xs, color: '#74777e' },

  // Progress
  progressTrack: { height: 4, backgroundColor: '#F1F4F6', borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: 4, backgroundColor: '#0040e0', borderRadius: 2 },
  progressLabel: { fontSize: Typography.xs, color: '#74777e', textAlign: 'center' },

  // Cancel
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#ba1a1a', backgroundColor: '#ffdad6',
  },
  cancelText: { fontSize: Typography.sm, fontWeight: '700', color: '#ba1a1a' },
});
