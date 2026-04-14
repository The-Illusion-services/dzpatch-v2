import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ─── Screen ───────────────────────────────────────────────────────────────────

const STARS = [1, 2, 3, 4, 5];

export default function TripCompleteScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { riderEarnings, commission, distanceKm, tripMinutes } = useLocalSearchParams<{
    distanceKm?: string;
    orderId?: string;
    riderEarnings: string;
    commission: string;
    tripMinutes?: string;
  }>();

  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // ── Pulse animation for hero ───────────────────────────────────────────────

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    animate(ring1, 0);
    animate(ring2, 800);
  }, [ring1, ring2]);

  const ringStyle = (anim: Animated.Value) => ({
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 0.2, 0] }),
  });

  // ── Submit rating ──────────────────────────────────────────────────────────

  const submitRating = async (stars: number) => {
    setRating(stars);
    if (submitted) return;
    setSubmitted(true);
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const gross = parseInt(riderEarnings || '0', 10) + parseInt(commission || '0', 10);
  const net = parseInt(riderEarnings || '0', 10);
  const comm = parseInt(commission || '0', 10);
  const distanceLabel = distanceKm ? `${Number(distanceKm).toFixed(1)} km` : '-';
  const tripTimeLabel = tripMinutes ? `${tripMinutes} min` : '-';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.checkWrap}>
          <Animated.View style={[styles.ring, ringStyle(ring1)]} />
          <Animated.View style={[styles.ring, ringStyle(ring2)]} />
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={52} color="#FFFFFF" />
          </View>
        </View>
        <Text style={styles.heroHeadline}>Trip Completed!</Text>
        <Text style={styles.heroSub}>Great job! Your earnings are on their way.</Text>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="map-outline" size={20} color="#0040e0" />
          <Text style={styles.statValue}>{distanceLabel}</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="time-outline" size={20} color="#0040e0" />
          <Text style={styles.statValue}>{tripTimeLabel}</Text>
          <Text style={styles.statLabel}>Trip Time</Text>
        </View>
      </View>

      {/* Earnings breakdown */}
      <View style={styles.earningsCard}>
        <Text style={styles.earningsTitle}>Earnings Breakdown</Text>
        <View style={styles.earningsRow}>
          <Text style={styles.earningsRowLabel}>Gross Earnings</Text>
          <Text style={styles.earningsRowValue}>₦{gross.toLocaleString()}</Text>
        </View>
        <View style={styles.earningsDivider} />
        <View style={styles.earningsRow}>
          <View style={styles.earningsLabelRow}>
            <Ionicons name="remove-circle-outline" size={14} color="#ba1a1a" />
            <Text style={[styles.earningsRowLabel, { color: '#ba1a1a' }]}>Commission (18%)</Text>
          </View>
          <Text style={[styles.earningsRowValue, { color: '#ba1a1a' }]}>-₦{comm.toLocaleString()}</Text>
        </View>
        <View style={styles.earningsDivider} />
        <View style={styles.earningsRow}>
          <Text style={[styles.earningsRowLabel, { fontWeight: '900', color: colors.textPrimary }]}>Net Pay</Text>
          <Text style={[styles.earningsRowValue, { color: '#0040e0', fontSize: Typography.lg }]}>
            ₦{net.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Rate customer */}
      <View style={styles.ratingCard}>
        <Text style={styles.ratingTitle}>Rate the Customer</Text>
        <Text style={styles.ratingSubtitle}>
          Rider-to-customer reviews are still being finalized, so this screen won&apos;t overwrite the delivery rating record.
        </Text>
        <View style={styles.starsRow}>
          {STARS.map((star) => (
            <Pressable key={star} onPress={() => submitRating(star)} hitSlop={8}>
              <Ionicons
                name={star <= rating ? 'star' : 'star-outline'}
                size={36}
                color={star <= rating ? '#D97706' : '#C4C6CF'}
              />
            </Pressable>
          ))}
        </View>
        {submitted && <Text style={styles.ratingThanks}>Thanks. Customer review syncing will be enabled in a later update.</Text>}
      </View>

      {/* Back to Home */}
      <Pressable
        style={styles.homeBtn}
        onPress={() => router.replace({ pathname: '/(rider)/' as any })}
      >
        <Ionicons name="map-outline" size={18} color="#FFFFFF" />
        <Text style={styles.homeBtnText}>Back to Home</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof import('@/hooks/use-theme').useTheme>['colors']) {
  return StyleSheet.create({
  content: { gap: 20, paddingHorizontal: Spacing[5] },

  // Hero
  hero: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  checkWrap: { alignItems: 'center', justifyContent: 'center', width: 140, height: 140 },
  ring: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0040e0',
  },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#0040e0',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  heroHeadline: { fontSize: Typography['2xl'], fontWeight: '900', color: colors.textPrimary },
  heroSub: { fontSize: Typography.sm, color: colors.textSecondary, textAlign: 'center' },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 20,
    padding: 18, gap: 4, alignItems: 'center',
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: Typography.lg, fontWeight: '900', color: colors.textPrimary },
  statLabel: { fontSize: Typography.xs, color: colors.textSecondary },

  // Earnings
  earningsCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 12,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  earningsTitle: { fontSize: Typography.md, fontWeight: '800', color: colors.textPrimary },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earningsRowLabel: { fontSize: Typography.sm, fontWeight: '600', color: colors.textSecondary },
  earningsRowValue: { fontSize: Typography.sm, fontWeight: '800', color: colors.textPrimary },
  earningsDivider: { height: 1, backgroundColor: colors.border },

  // Rating
  ratingCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    alignItems: 'center', gap: 12,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  ratingTitle: { fontSize: Typography.md, fontWeight: '800', color: colors.textPrimary },
  ratingSubtitle: {
    fontSize: Typography.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  starsRow: { flexDirection: 'row', gap: 8 },
  ratingThanks: { fontSize: Typography.sm, color: '#16A34A', fontWeight: '600' },

  // Home button
  homeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  homeBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
  }); // end makeStyles
}
