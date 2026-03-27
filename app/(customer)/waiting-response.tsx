import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
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

export default function WaitingResponseScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, riderName, counterAmount, originalBid } = useLocalSearchParams<{
    orderId: string;
    riderName: string;
    counterAmount: string;
    originalBid: string;
  }>();


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
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for bid response + poll fallback ──────────────────────────────
  useEffect(() => {
    if (!orderId) return;

    const navigate = (status: string) => {
      if (status === 'matched') {
        router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
      } else if (status === 'cancelled') {
        router.replace('/(customer)/' as any);
      }
    };

    // Poll every 4s as the primary mechanism (realtime RLS may block bid events)
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      if (data) navigate((data as any).status);
    }, 4000);

    const channel = supabase
      .channel(`waiting:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => { navigate((payload.new as any).status); }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // ── Cancel & search again ─────────────────────────────────────────────────
  const handleCancelAndSearch = () => {
    // Counter bid expires on its own (5 min TTL set by send_counter_offer RPC).
    // Just navigate back to live-bidding — no raw bid mutations (blocked by RLS).
    router.replace({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);
  };

  const timelineSteps = [
    { label: 'Your Counter', value: `₦${Number(counterAmount).toLocaleString()}`, done: true },
    { label: 'Initial Bid', value: `₦${Number(originalBid).toLocaleString()}`, done: true, secondary: true },
    { label: "Rider's Decision", value: 'Pending...', done: false, pending: true },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Waiting for Response</Text>
        <View style={{ width: 36 }} />
      </View>

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
        {/* Badge */}
        <View style={styles.negotiationBadge}>
          <Text style={styles.negotiationBadgeText}>Negotiation Active</Text>
        </View>

        {/* Headline */}
        <View style={styles.headlineWrap}>
          <Animated.Text style={[styles.hourglass, { transform: [{ rotate: spin }] }]}>⏳</Animated.Text>
          <Text style={styles.headline}>
            Waiting for {riderName} to respond to your offer of{' '}
            <Text style={styles.headlineAmount}>₦{Number(counterAmount).toLocaleString()}</Text>
          </Text>
          <Text style={styles.subtext}>
            The rider will accept, reject, or counter your offer. We&apos;ll notify you instantly.
          </Text>
        </View>

        {/* Negotiation tracker card */}
        <View style={styles.trackerCard}>
          {/* Current offer display */}
          <View style={styles.offerDisplay}>
            <Text style={styles.offerLabel}>YOUR OFFER</Text>
            <Text style={styles.offerAmount}>₦{Number(counterAmount).toLocaleString()}</Text>
            <Animated.View style={[styles.offerPulseDot, { opacity: pulseAnim }]} />
          </View>

          {/* Timeline */}
          <View style={styles.timeline}>
            {timelineSteps.map((step, i) => (
              <View key={i} style={styles.timelineRow}>
                <View style={[
                  styles.timelineDot,
                  step.done && styles.timelineDotDone,
                  step.pending && styles.timelineDotPending,
                ]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.timelineLabel, step.secondary && styles.timelineLabelSecondary]}>
                    {step.label}
                  </Text>
                </View>
                <Text style={[styles.timelineValue, step.pending && styles.timelineValuePending]}>
                  {step.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Cancel & search again */}
        <View style={styles.actionSection}>
          <Text style={styles.actionHint}>
            Changed your mind? Cancel and search for other riders.
          </Text>
          <Pressable
            style={styles.cancelBtn}
            onPress={handleCancelAndSearch}
          >
            <Text style={styles.cancelBtnText}>Cancel & Search Again</Text>
          </Pressable>
        </View>

        {/* Security badge */}
        <View style={styles.securityBadge}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>Escrow Protected Payment</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: '600' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontSize: Typography.lg, fontWeight: Typography.bold,
    color: '#000D22', letterSpacing: -0.3,
  },

  shimmerBar: {
    height: 3,
    backgroundColor: '#dde1ff',
    overflow: 'hidden',
  },
  shimmerGlow: {
    position: 'absolute',
    width: 200, height: 3,
    backgroundColor: '#0040e0',
    opacity: 0.5,
  },

  content: {
    flex: 1,
    paddingHorizontal: Spacing[5],
    paddingTop: 28,
    alignItems: 'center',
    gap: 20,
  },

  negotiationBadge: {
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#dde1ff', borderRadius: 999,
  },
  negotiationBadgeText: {
    fontSize: 11, fontWeight: Typography.bold,
    color: '#0040e0', textTransform: 'uppercase', letterSpacing: 1,
  },

  headlineWrap: { alignItems: 'center', gap: 10, maxWidth: 300 },
  hourglass: { fontSize: 36 },
  headline: {
    fontSize: Typography.lg, fontWeight: Typography.bold,
    color: '#000D22', textAlign: 'center', lineHeight: 26,
  },
  headlineAmount: { color: '#0040e0' },
  subtext: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center', lineHeight: 20 },

  trackerCard: {
    width: '100%',
    backgroundColor: '#0A2342',
    borderRadius: 24, padding: 20, gap: 16,
    shadowColor: '#0A2342',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 6,
  },
  offerDisplay: { alignItems: 'center', gap: 4 },
  offerLabel: {
    fontSize: 10, fontWeight: Typography.bold,
    color: '#b8c3ff', textTransform: 'uppercase', letterSpacing: 3,
  },
  offerAmount: {
    fontSize: 36, fontWeight: Typography.extrabold,
    color: '#FFFFFF', letterSpacing: -1,
  },
  offerPulseDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#0040e0',
    marginTop: 4,
  },

  timeline: { gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  timelineDotDone: { backgroundColor: '#b8c3ff' },
  timelineDotPending: { backgroundColor: '#0040e0' },
  timelineLabel: {
    fontSize: Typography.xs, fontWeight: Typography.semibold,
    color: 'rgba(255,255,255,0.7)',
  },
  timelineLabelSecondary: { color: 'rgba(255,255,255,0.45)' },
  timelineValue: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: 'rgba(255,255,255,0.9)',
  },
  timelineValuePending: { color: '#b8c3ff', fontStyle: 'italic' },

  actionSection: { width: '100%', alignItems: 'center', gap: 10 },
  actionHint: { fontSize: Typography.xs, color: '#74777e', textAlign: 'center' },
  cancelBtn: {
    width: '100%', paddingVertical: 14, alignItems: 'center',
    borderRadius: 16, backgroundColor: '#E0E3E5',
  },
  cancelBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#44474e' },

  securityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#F1F4F6', borderRadius: 999,
  },
  securityIcon: { fontSize: 14 },
  securityText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: '#44474e' },
});
