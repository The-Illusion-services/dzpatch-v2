import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth.store';

export default function RiderSplashScreen() {
  const { isInitialized, session, role } = useAuthStore();
  const shimmerX = useRef(new Animated.Value(-1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseRing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 0.96, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRing, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseRing, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    ring.start();

    const shimmer = Animated.loop(
      Animated.timing(shimmerX, { toValue: 3, duration: 1600, useNativeDriver: true })
    );
    shimmer.start();

    return () => { pulse.stop(); ring.stop(); shimmer.stop(); };
  }, [pulseScale, pulseRing, shimmerX]);

  useEffect(() => {
    if (!isInitialized) return;
    const timer = setTimeout(() => {
      if (!session) {
        router.replace('/(rider-auth)/onboarding' as any);
      } else if (role === 'rider') {
        router.replace('/(rider)' as any);
      } else {
        router.replace('/(rider-auth)/onboarding' as any);
      }
    }, 2200);
    return () => clearTimeout(timer);
  }, [isInitialized, session, role]);

  const ringScale = pulseRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulseRing.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 0.3, 0] });

  return (
    <View style={styles.container}>
      {/* Ambient glows */}
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />

      {/* Logo cluster */}
      <Animated.View style={[styles.logoCluster, { transform: [{ scale: pulseScale }] }]}>
        {/* Pulse ring */}
        <Animated.View
          style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />

        <View style={styles.iconBox}>
          <Ionicons name="bicycle" size={40} color="#FFFFFF" />
        </View>

        <View style={styles.brandRow}>
          <Text style={styles.brandName}>Dzpatch</Text>
          <View style={styles.riderBadge}>
            <Text style={styles.riderBadgeText}>RIDER</Text>
          </View>
        </View>

        <Text style={styles.tagline}>DELIVERING THE FUTURE</Text>
      </Animated.View>

      {/* Progress footer */}
      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                transform: [{
                  translateX: shimmerX.interpolate({
                    inputRange: [0, 3],
                    outputRange: [-160, 160],
                  }),
                }],
              },
            ]}
          />
        </View>
        <Text style={styles.loadingText}>Authenticating secure terminal...</Text>
        <View style={styles.trustRow}>
          <Text style={styles.trustLabel}>✓ Encrypted</Text>
          <View style={styles.dot} />
          <Text style={styles.trustLabel}>Real-time</Text>
          <View style={styles.dot} />
          <Text style={styles.trustLabel}>Secure</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000D22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  glowTop: { top: -60, left: '15%', backgroundColor: '#0040e0', opacity: 0.1 },
  glowBottom: { bottom: -60, right: '10%', backgroundColor: '#2e5bff', opacity: 0.06 },

  logoCluster: {
    alignItems: 'center',
    gap: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#0040e0',
  },
  iconBox: {
    width: 80,
    height: 80,
    backgroundColor: '#0040e0',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  riderBadge: {
    backgroundColor: '#0a2342',
    borderWidth: 1,
    borderColor: '#0040e0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  riderBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#dde1ff',
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '700',
    color: '#768baf',
    letterSpacing: 5,
    textTransform: 'uppercase',
  },

  footer: {
    position: 'absolute',
    bottom: 64,
    alignItems: 'center',
    gap: 16,
  },
  progressTrack: {
    width: 160,
    height: 3,
    backgroundColor: '#0a2342',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    width: 60,
    borderRadius: 2,
    backgroundColor: '#0040e0',
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#768baf',
    letterSpacing: 0.5,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    opacity: 0.5,
  },
  trustLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#768baf',
  },
});
