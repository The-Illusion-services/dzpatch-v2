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

export default function DeliverySuccessScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, finalPrice, deliveryTime, riderId, riderName } = useLocalSearchParams<{
    orderId: string;
    finalPrice?: string;
    deliveryTime?: string;
    riderId?: string;
    riderName?: string;
  }>();

  // ── Package scale-in + tilt ───────────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const rotateAnim = useRef(new Animated.Value(-3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header — minimal brand bar */}
      <View style={styles.header}>
        <Text style={styles.brand}>Dzpatch</Text>
        <View style={styles.avatarPlaceholder} />
      </View>

      <View style={styles.content}>
        {/* Package illustration */}
        <View style={styles.illustrationWrap}>
          {/* Glow blobs */}
          <View style={styles.glowBlob1} />
          <View style={styles.glowBlob2} />

          {/* Package box */}
          <Animated.View style={[
            styles.packageBox,
            {
              transform: [
                { scale: scaleAnim },
                { rotate: rotateAnim.interpolate({ inputRange: [-3, 0], outputRange: ['-3deg', '0deg'] }) },
              ],
              opacity: opacityAnim,
            }
          ]}>
            <View style={styles.packageInner}>
              <Text style={styles.packageIcon}>📦</Text>
            </View>
            {/* Check badge */}
            <View style={styles.checkBadge}>
              <Text style={styles.checkBadgeText}>✓</Text>
            </View>
          </Animated.View>
        </View>

        {/* Headline */}
        <Animated.View style={[styles.headlineWrap, { opacity: opacityAnim }]}>
          <Text style={styles.headline}>Package Delivered Successfully</Text>
          <Text style={styles.subtext}>
            Your shipment has reached its destination. Thank you for choosing Dzpatch.
          </Text>
        </Animated.View>

        {/* Stats grid */}
        <Animated.View style={[styles.statsGrid, { opacity: opacityAnim }]}>
          {finalPrice && (
            <View style={[styles.statCard, styles.statCardAccent]}>
              <Text style={styles.statLabel}>FINAL PRICE</Text>
              <Text style={styles.statValue}>₦{Number(finalPrice).toLocaleString()}</Text>
            </View>
          )}
          {deliveryTime && (
            <View style={[styles.statCard, styles.statCardWarm]}>
              <Text style={styles.statLabel}>DELIVERY TIME</Text>
              <View style={styles.statValueRow}>
                <Text style={styles.statValue}>{deliveryTime}</Text>
                <Text style={styles.statValueIcon}>⚡</Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Receipt link */}
        <Pressable
          style={styles.receiptRow}
          onPress={() => router.push({ pathname: '/(customer)/order-details', params: { orderId } } as any)}
        >
          <Text style={styles.receiptIcon}>🧾</Text>
          <Text style={styles.receiptText}>View Digital Receipt</Text>
          <Text style={styles.receiptChevron}>›</Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={styles.rateBtn}
          onPress={() => router.replace({
            pathname: '/(customer)/driver-rating',
            params: { orderId, riderId, riderName },
          } as any)}
        >
          <Text style={styles.rateBtnIcon}>⭐</Text>
          <Text style={styles.rateBtnText}>Rate Rider</Text>
        </Pressable>

        <Pressable
          style={styles.doneBtn}
          onPress={() => router.replace('/(customer)/' as any)}
        >
          <Text style={styles.doneBtnText}>Done / Back to Home</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  brand: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E3E5',
  },

  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingTop: 28,
    gap: 20,
  },

  // Illustration
  illustrationWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowBlob1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0040e0',
    opacity: 0.06,
    left: -20,
    top: 0,
  },
  glowBlob2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffb692',
    opacity: 0.1,
    right: 0,
    bottom: 10,
  },
  packageBox: {
    width: 160,
    height: 160,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
    position: 'relative',
  },
  packageInner: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C4C6CF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageIcon: { fontSize: 56 },
  checkBadge: {
    position: 'absolute',
    bottom: -12,
    right: -12,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 3,
    borderColor: '#F7FAFC',
  },
  checkBadgeText: { fontSize: 22, color: '#FFFFFF', fontWeight: Typography.bold },

  headlineWrap: { alignItems: 'center', gap: 8 },
  headline: {
    fontSize: Typography.xl,
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
    maxWidth: 280,
  },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  statCard: {
    flex: 1,
    backgroundColor: '#F1F4F6',
    borderRadius: 20,
    padding: 18,
    gap: 6,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  statCardAccent: { borderLeftWidth: 3, borderLeftColor: '#0040e0' },
  statCardWarm: { borderLeftWidth: 3, borderLeftColor: '#ffb692' },
  statLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statValue: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValueIcon: { fontSize: 18 },

  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F1F4F6',
  },
  receiptIcon: { fontSize: 18 },
  receiptText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#0040e0', flex: 1 },
  receiptChevron: { fontSize: 18, color: '#0040e0', fontWeight: Typography.bold },

  // Actions
  actions: {
    paddingHorizontal: Spacing[5],
    paddingTop: 8,
    gap: 10,
  },
  rateBtn: {
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
  rateBtnIcon: { fontSize: 18 },
  rateBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
  doneBtn: {
    height: 52,
    backgroundColor: '#E0E3E5',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
});
