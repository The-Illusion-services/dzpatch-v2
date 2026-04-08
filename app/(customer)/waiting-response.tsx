import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import { BID_RESPONSE_WINDOW_SECONDS, DEFAULT_COUNTDOWN_TICK_MS, LIVE_BIDDING_SHIMMER_DURATION_MS } from '@/constants/timing';
import type { RealtimeChannel } from '@supabase/supabase-js';

export default function WaitingResponseScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orderId, riderId, riderName, counterAmount, negotiationRound } = useLocalSearchParams<{
    orderId: string;
    riderId?: string;
    riderName: string;
    counterAmount: string;
    negotiationRound?: string;
  }>();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const belongsToActiveRider = (bidRiderId?: string | null) => {
    if (!riderId) return true;
    return bidRiderId === riderId;
  };


  // ── Countdown anchored to actual bid expires_at ───────────────────────────
  const [countdown, setCountdown] = useState(BID_RESPONSE_WINDOW_SECONDS);

  // Seed countdown from the real bid expiry on mount
  useEffect(() => {
    if (!orderId) return;
    let isActive = true;

    const loadBidExpiry = async () => {
      let q = supabase
        .from('bids')
        .select('expires_at')
        .eq('order_id', orderId)
        .in('status', ['pending', 'countered'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (riderId) q = (q as any).eq('rider_id', riderId);

      const { data } = await (q as any).maybeSingle();
      if (!isActive || !data?.expires_at) return;
      const remaining = Math.max(
        0,
        Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000)
      );
      setCountdown(remaining);
    };

    void loadBidExpiry();
    return () => { isActive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, riderId]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(tick); return 0; }
        return prev - 1;
      });
    }, DEFAULT_COUNTDOWN_TICK_MS);
    return () => clearInterval(tick);
  }, []);
  const countdownMins = Math.floor(countdown / 60).toString().padStart(2, '0');
  const countdownSecs = (countdown % 60).toString().padStart(2, '0');
  const isExpiringSoon = countdown <= 60;

  // ── Hourglass spin ────────────────────────────────────────────────────────
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ── Pulse dot ─────────────────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shimmer bar ───────────────────────────────────────────────────────────
  const shimmerAnim = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: LIVE_BIDDING_SHIMMER_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncNegotiationState = async () => {
    if (!orderId) return;

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      console.warn('waiting-response sync order failed:', orderError.message);
      return;
    }

    if (orderData) {
      const status = (orderData as any).status;
      if (status === 'matched') {
        router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
        return;
      }
      if (status === 'cancelled') {
        router.replace('/(customer)/' as any);
        return;
      }
    }

    let bidsQuery = supabase
      .from('bids')
      .select('id, status, amount, parent_bid_id, negotiation_round')
      .eq('order_id', orderId)
      .in('status', ['pending', 'countered', 'expired', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(3);
    if (riderId) bidsQuery = bidsQuery.eq('rider_id', riderId) as typeof bidsQuery;

    const { data: recentBids, error: bidsError } = await bidsQuery;

    if (bidsError || !recentBids || (recentBids as any[]).length === 0) {
      if (bidsError) {
        console.warn('waiting-response sync bids failed:', bidsError.message);
      }
      return;
    }

    const allBids = recentBids as any[];
    const latestPending = allBids.find((bid) => bid.status === 'pending');
    if (latestPending && latestPending.parent_bid_id) {
      router.replace({
        pathname: '/(customer)/counter-offer',
        params: {
          orderId,
          bidId: latestPending.id,
          riderId: riderId ?? '',
          riderName: riderName ?? 'Rider',
          bidAmount: String(latestPending.amount),
          negotiationRound: String(latestPending.negotiation_round ?? negotiationRound ?? 1),
        },
      } as any);
      return;
    }

    if (allBids.every((bid) => bid.status === 'expired' || bid.status === 'rejected')) {
      router.replace({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);
    }
  };

  // ── Listen for bid response + poll fallback ──────────────────────────────
  useEffect(() => {
    if (!orderId) return;

    const goActive = () =>
      router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
    const goHome = () =>
      router.replace('/(customer)/' as any);
    const goBidding = () =>
      router.replace({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);

    const poll = setInterval(async () => {
      // Check order status first
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .maybeSingle();

      if (orderError) {
        console.warn('waiting-response poll order failed:', orderError.message);
        return;
      }

      if (orderData) {
        const status = (orderData as any).status;
        if (status === 'matched') { clearInterval(poll); goActive(); return; }
        if (status === 'cancelled') { clearInterval(poll); goHome(); return; }
      }

      // Fetch latest bids for this rider's negotiation thread
      let pollBidsQuery = supabase
        .from('bids')
        .select('id, status, amount, parent_bid_id, negotiation_round')
        .eq('order_id', orderId)
        .in('status', ['pending', 'countered', 'expired', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(3);
      if (riderId) pollBidsQuery = pollBidsQuery.eq('rider_id', riderId) as typeof pollBidsQuery;

      const { data: recentBids, error: bidsError } = await pollBidsQuery;

      if (bidsError) {
        console.warn('waiting-response poll bids failed:', bidsError.message);
        return;
      }

      if (!recentBids || (recentBids as any[]).length === 0) return;

      const allBids = recentBids as any[];
      const latestPending = allBids.find((b) => b.status === 'pending');

      // Rider countered our offer: a new pending bid exists with parent_bid_id
      if (latestPending && latestPending.parent_bid_id) {
        clearInterval(poll);
        router.replace({
          pathname: '/(customer)/counter-offer',
          params: {
            orderId,
            bidId: latestPending.id,
            riderId: riderId ?? '',
            riderName: riderName ?? 'Rider',
            bidAmount: String(latestPending.amount),
            negotiationRound: String(latestPending.negotiation_round ?? negotiationRound ?? 1),
          },
        } as any);
        return;
      }

      // All bids expired/rejected — negotiation dead, go back to live-bidding
      const allTerminal = allBids.every((b) => b.status === 'expired' || b.status === 'rejected');
      if (allTerminal) {
        clearInterval(poll);
        goBidding();
        return;
      }
    }, 4000);

    const channel = supabase
      .channel(`waiting:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const status = (payload.new as any).status;
          if (status === 'matched') goActive();
          else if (status === 'cancelled') goHome();
        }
      )
      // Catch new rider bid inserts (rider countered back = new pending bid with parent_bid_id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        async (payload) => {
          const newBidId = (payload.new as any).id;
          const { data: reliableBid } = await supabase
            .from('bids')
            .select('status, amount, parent_bid_id, negotiation_round, rider_id')
            .eq('id', newBidId)
            .single();

          if (!reliableBid) return;
          if ((reliableBid as any).status !== 'pending') return;
          
          const bid = reliableBid as any;
          if (belongsToActiveRider(bid.rider_id) && bid.parent_bid_id) {
            // Rider countered our offer — take customer to counter-offer screen
            router.replace({
              pathname: '/(customer)/counter-offer',
              params: {
                orderId,
                bidId: newBidId,
                riderId: riderId ?? '',
                riderName: riderName ?? 'Rider',
                bidAmount: String(bid.amount),
                negotiationRound: String(bid.negotiation_round),
              },
            } as any);
          }
        }
      )
      // Catch bid updates: expiry/rejection closes the negotiation
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        (payload) => {
          const bid = payload.new as any;
          if (!belongsToActiveRider(bid.rider_id)) return;
          if (bid.status === 'expired' || bid.status === 'rejected') goBidding();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [orderId, riderId, riderName, negotiationRound]);

  useAppStateChannels([channelRef.current], {
    onForeground: syncNegotiationState,
  });

  // ── Cancel & search again ─────────────────────────────────────────────────
  const handleCancelAndSearch = () => {
    // Counter bid expires on its own (5 min TTL set by send_counter_offer RPC).
    // Just navigate back to live-bidding — no raw bid mutations (blocked by RLS).
    router.replace({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Shimmer top bar */}
      <View style={styles.shimmerBar}>
        <Animated.View
          style={[
            styles.shimmerGlow,
            { transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [-1, 1], outputRange: [-200, 400] }) }] },
          ]}
        />
      </View>

      <View style={styles.content}>
        {/* Hourglass */}
        <Animated.Text style={[styles.hourglass, { transform: [{ rotate: spin }] }]}>⏳</Animated.Text>

        {/* Offer card */}
        <View style={styles.offerCard}>
          <Text style={styles.offerLabel}>YOUR OFFER TO {String(riderName).toUpperCase()}</Text>
          <Text style={styles.offerAmount}>₦{Number(counterAmount).toLocaleString()}</Text>
          <Animated.View style={[styles.offerPulseDot, { opacity: pulseAnim }]} />

          <View style={[styles.countdownRow, isExpiringSoon && styles.countdownRowUrgent]}>
            <Text style={[styles.countdownLabel, isExpiringSoon && styles.countdownLabelUrgent]}>
              {countdown > 0 ? `Offer expires in ${countdownMins}:${countdownSecs}` : 'Offer expired'}
            </Text>
          </View>
        </View>

        <Text style={styles.subtext}>
          Waiting for the rider to accept, reject, or counter your offer
        </Text>

        {/* Cancel */}
        <Pressable style={styles.cancelBtn} onPress={handleCancelAndSearch}>
          <Text style={styles.cancelBtnText}>Cancel & Search Again</Text>
        </Pressable>

        {/* Security badge */}
        <View style={styles.securityBadge}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>Escrow Protected Payment</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof import('@/hooks/use-theme').useTheme>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  shimmerBar: { height: 3, backgroundColor: '#dde1ff', overflow: 'hidden' },
  shimmerGlow: {
    position: 'absolute', width: 200, height: 3,
    backgroundColor: '#0040e0', opacity: 0.5,
  },

  content: {
    flex: 1, paddingHorizontal: Spacing[5],
    paddingTop: 48, alignItems: 'center', gap: 24,
  },

  hourglass: { fontSize: 48 },

  offerCard: {
    width: '100%', backgroundColor: '#0A2342',
    borderRadius: 24, padding: 24, gap: 14,
    alignItems: 'center',
    shadowColor: '#0A2342', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 6,
  },
  offerLabel: {
    fontSize: 10, fontWeight: Typography.bold,
    color: '#b8c3ff', textTransform: 'uppercase', letterSpacing: 2,
  },
  offerAmount: {
    fontSize: 42, fontWeight: Typography.extrabold,
    color: '#FFFFFF', letterSpacing: -1,
  },
  offerPulseDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#4d7cff',
  },
  countdownRow: {
    alignSelf: 'stretch', alignItems: 'center',
    paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  countdownRowUrgent: { backgroundColor: 'rgba(186,26,26,0.2)' },
  countdownLabel: { fontSize: Typography.xs, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  countdownLabelUrgent: { color: '#ff8a80' },

  subtext: {
    fontSize: Typography.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22, maxWidth: 280,
  },

  cancelBtn: {
    width: '100%', paddingVertical: 14, alignItems: 'center',
    borderRadius: 16, backgroundColor: colors.surface,
  },
  cancelBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: colors.textSecondary },

  securityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: colors.surface, borderRadius: 999,
  },
  securityIcon: { fontSize: 14 },
  securityText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: colors.textSecondary },
  }); // end makeStyles
}
