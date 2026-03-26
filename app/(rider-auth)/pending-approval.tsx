import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

const POLL_INTERVAL = 30_000; // 30s

export default function PendingApprovalScreen() {
  const insets = useSafeAreaInsets();
  const { user, loadProfile, profile } = useAuthStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  const [approved, setApproved] = useState(false);

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    ring.start();

    return () => { pulse.stop(); ring.stop(); };
  }, [pulseAnim, ringAnim]);

  // Poll for approval status
  useEffect(() => {
    const poll = async () => {
      if (!user?.id) return;
      await loadProfile(user.id);
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user?.id, loadProfile]);

  // React when profile kyc_status changes
  useEffect(() => {
    if (profile?.kyc_status === 'approved') {
      setApproved(true);
      setTimeout(() => router.replace('/(rider)' as any), 2000);
    }
  }, [profile?.kyc_status]);

  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 0.2, 0] });

  if (approved) {
    return (
      <View style={styles.approvedContainer}>
        <Ionicons name="checkmark-circle" size={72} color="#16A34A" />
        <Text style={styles.approvedTitle}>You&apos;re Approved!</Text>
        <Text style={styles.approvedSub}>Redirecting to your dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollableContent ringScale={ringScale} ringOpacity={ringOpacity} pulseAnim={pulseAnim} />
    </View>
  );
}

function ScrollableContent({ ringScale, ringOpacity, pulseAnim }: {
  ringScale: Animated.AnimatedInterpolation<number>;
  ringOpacity: Animated.AnimatedInterpolation<number>;
  pulseAnim: Animated.Value;
}) {
  return (
    <View style={styles.inner}>
      {/* Icon with pulse ring */}
      <View style={styles.iconContainer}>
        <Animated.View
          style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />
        <Animated.View style={[styles.iconCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="shield-checkmark" size={44} color="#0040e0" />
        </Animated.View>
        {/* Status badge */}
        <View style={styles.statusBadge}>
          <Ionicons name="time-outline" size={12} color="#f59e0b" />
        </View>
      </View>

      <View style={styles.textGroup}>
        <Text style={styles.headline}>Verification in Progress</Text>
        <Text style={styles.subtitle}>
          Our team is reviewing your documents.{'\n'}
          This typically takes <Text style={styles.bold}>24–48 hours</Text>.
        </Text>
      </View>

      {/* Queue card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="people-outline" size={18} color="#0040e0" />
          <Text style={styles.cardTitle}>Review Queue</Text>
        </View>
        <View style={styles.queueBar}>
          <View style={styles.queueFill} />
        </View>
        <Text style={styles.queueText}>Your application is in the review queue</Text>
      </View>

      {/* What happens next */}
      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>What happens next?</Text>
        {[
          { icon: 'mail-outline' as const, text: 'You\'ll receive an email/SMS when approved' },
          { icon: 'bicycle-outline' as const, text: 'Once approved, start accepting delivery jobs' },
          { icon: 'wallet-outline' as const, text: 'Earnings deposited to your bank every Friday' },
        ].map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <Ionicons name={step.icon} size={16} color="#0040e0" />
            </View>
            <Text style={styles.stepText}>{step.text}</Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      <Pressable
        style={styles.homeBtn}
        onPress={() => {
          Alert.alert('Sign Out', 'Sign out and return to the login screen?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign Out', style: 'destructive',
              onPress: async () => {
                const { signOut } = useAuthStore.getState();
                await signOut();
                router.replace('/(auth)/login' as any);
              },
            },
          ]);
        }}
      >
        <Ionicons name="log-out-outline" size={18} color="#0040e0" />
        <Text style={styles.homeBtnText}>Sign Out</Text>
      </Pressable>

      <Pressable hitSlop={8}>
        <Text style={styles.supportLink}>Contact support</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  inner: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingTop: 48, paddingBottom: 40,
    gap: 24,
  },

  iconContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center', width: 120, height: 120 },
  pulseRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: '#0040e0',
  },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fef3c7',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },

  textGroup: { alignItems: 'center', gap: 8 },
  headline: { fontSize: Typography.xl, fontWeight: Typography.bold, color: '#000D22', textAlign: 'center' },
  subtitle: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: Typography.bold, color: '#000D22' },

  card: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, gap: 12,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  queueBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  queueFill: { height: '100%', width: '65%', backgroundColor: '#0040e0', borderRadius: 4 },
  queueText: { fontSize: Typography.xs, color: '#74777e' },

  stepsCard: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, gap: 14,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  stepsTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepText: { flex: 1, fontSize: Typography.sm, color: '#44474e', lineHeight: 20 },

  homeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, width: '100%',
    backgroundColor: '#EEF2FF', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#0040e0',
  },
  homeBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#0040e0' },

  supportLink: { fontSize: Typography.sm, color: '#74777e', textDecorationLine: 'underline' },

  // Approved state
  approvedContainer: {
    flex: 1, backgroundColor: '#F7FAFC',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  approvedTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: '#16A34A' },
  approvedSub: { fontSize: Typography.sm, color: '#44474e' },
});
