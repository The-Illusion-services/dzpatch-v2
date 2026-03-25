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
import { Spacing, Typography } from '@/constants/theme';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingSuccessScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, pickupAddress, dropoffAddress, finalPrice } = useLocalSearchParams<{
    orderId: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    finalPrice?: string;
  }>();

  // ── Success icon scale-in ─────────────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ── Ping ring loop ────────────────────────────────────────────────────────
  const pingAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(pingAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Booking Confirmed</Text>
      </View>

      <View style={styles.content}>
        {/* Success illustration */}
        <View style={styles.iconWrap}>
          {/* Ping rings */}
          <Animated.View style={[
            styles.pingRing,
            {
              opacity: pingAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.1, 0] }),
              transform: [{ scale: pingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
            }
          ]} />
          <Animated.View style={[
            styles.pingRing,
            styles.pingRing2,
            {
              opacity: pingAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0.05, 0] }),
              transform: [{ scale: pingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
            }
          ]} />
          {/* Icon */}
          <Animated.View style={[styles.iconCircle, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            <Text style={styles.checkIcon}>✓</Text>
          </Animated.View>
        </View>

        {/* Headline */}
        <Animated.View style={{ opacity: opacityAnim, alignItems: 'center', gap: 8 }}>
          <Text style={styles.headline}>Payment Successful!</Text>
          <Text style={styles.subtext}>Your order has been placed and a rider is being assigned.</Text>
        </Animated.View>

        {/* Order details card */}
        <View style={styles.detailsCard}>
          {/* Order ID */}
          <View style={[styles.detailRow, styles.detailBorderLeft]}>
            <View style={styles.detailRowInner}>
              <Text style={styles.detailIcon}>📦</Text>
              <Text style={styles.detailLabel}>ORDER ID</Text>
            </View>
            <Text style={styles.detailValue}>#{orderId?.slice(-6).toUpperCase() ?? '------'}</Text>
          </View>

          {/* Final price */}
          {finalPrice && (
            <View style={[styles.detailRow, styles.detailBorderLeft]}>
              <View style={styles.detailRowInner}>
                <Text style={styles.detailIcon}>💳</Text>
                <Text style={styles.detailLabel}>AMOUNT PAID</Text>
              </View>
              <Text style={styles.detailValueHighlight}>₦{Number(finalPrice).toLocaleString()}</Text>
            </View>
          )}

          {/* Pickup */}
          {pickupAddress && (
            <View style={styles.detailRow}>
              <View style={styles.detailRowInner}>
                <View style={styles.dotPickup} />
                <Text style={styles.detailLabel}>PICK-UP</Text>
              </View>
              <Text style={[styles.detailValue, styles.detailValueMuted]} numberOfLines={2}>
                {pickupAddress}
              </Text>
            </View>
          )}

          {/* Dropoff */}
          {dropoffAddress && (
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <View style={styles.detailRowInner}>
                <View style={styles.dotDropoff} />
                <Text style={styles.detailLabel}>DROP-OFF</Text>
              </View>
              <Text style={[styles.detailValue, styles.detailValueMuted]} numberOfLines={2}>
                {dropoffAddress}
              </Text>
            </View>
          )}
        </View>

        {/* Real-time tracking promo */}
        <View style={styles.trackingPromo}>
          <View style={styles.promoLeft}>
            <Text style={styles.promoIcon}>📡</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTitle}>Real-time Radar</Text>
              <Text style={styles.promoBody}>Track your delivery live with millisecond precision.</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={styles.trackBtn}
          onPress={() => router.replace({
            pathname: '/(customer)/finding-rider',
            params: { orderId },
          } as any)}
        >
          <Text style={styles.trackBtnText}>Find a Rider</Text>
          <Text style={styles.trackBtnIcon}>📍</Text>
        </Pressable>

        <Pressable
          style={styles.homeBtn}
          onPress={() => router.replace('/(customer)/' as any)}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#0040e0',
    letterSpacing: -0.3,
  },

  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingTop: 32,
    gap: 24,
  },

  // Icon
  iconWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pingRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#0040e0',
  },
  pingRing2: {},
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  checkIcon: {
    fontSize: 44,
    color: '#FFFFFF',
    fontWeight: Typography.bold,
  },

  headline: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtext: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  // Details card
  detailsCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  detailRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F6',
  },
  detailBorderLeft: {
    borderLeftWidth: 3,
    borderLeftColor: '#0040e0',
  },
  detailRowInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  detailIcon: { fontSize: 16 },
  dotPickup: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 2, borderColor: '#0040e0',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  dotDropoff: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#0040e0', flexShrink: 0,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  detailValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
    textAlign: 'right',
    flex: 1,
  },
  detailValueHighlight: {
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
  },
  detailValueMuted: { color: '#44474e', fontWeight: Typography.medium },

  // Tracking promo
  trackingPromo: {
    width: '100%',
    backgroundColor: '#000D22',
    borderRadius: 20,
    padding: 20,
  },
  promoLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  promoIcon: { fontSize: 28 },
  promoTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  promoBody: {
    fontSize: Typography.xs,
    color: '#768baf',
    lineHeight: 17,
  },

  // Actions
  actions: {
    paddingHorizontal: Spacing[5],
    paddingTop: 8,
    paddingBottom: 8,
    gap: 10,
  },
  trackBtn: {
    height: 52,
    backgroundColor: '#0040e0',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  trackBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
  trackBtnIcon: { fontSize: 18 },
  homeBtn: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F1F4F6',
  },
  homeBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#44474e' },
});
