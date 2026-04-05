import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@/store/auth.store';

export default function SplashScreen() {
  const { isInitialized, session, role } = useAuthStore();
  const shimmerX = useRef(new Animated.Value(-1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 0.97, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();

    // Progress shimmer
    const shimmer = Animated.loop(
      Animated.timing(shimmerX, { toValue: 3, duration: 1500, useNativeDriver: true })
    );
    shimmer.start();

    return () => {
      pulse.stop();
      shimmer.stop();
    };
  }, [pulseScale, shimmerX]);

  useEffect(() => {
    if (!isInitialized) return;

    // Dev bypass: EXPO_PUBLIC_DEV_ROLE skips auth and jumps to role directly
    const devRole = process.env.EXPO_PUBLIC_DEV_ROLE;
    if (__DEV__ && devRole) {
      const timer = setTimeout(() => {
        switch (devRole) {
          case 'rider': router.replace('/(rider)' as any); break;
          case 'fleet': router.replace('/(fleet)' as any); break;
          case 'admin': router.replace('/(admin)' as any); break;
          default: router.replace('/(customer)'); break;
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    // No session — go to onboarding (don't wait for role)
    if (!session) {
      const timer = setTimeout(() => {
        router.replace('/(auth)/onboarding');
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Session exists but profile/role not loaded yet — wait
    if (!role) return;

    // Role is ready — navigate
    const timer = setTimeout(() => {
      switch (role) {
        case 'rider': router.replace('/(rider)' as any); break;
        default: {
          // Guard: if profile has no name the signup was never completed — send to onboarding
          const { profile } = useAuthStore.getState();
          if (!profile?.full_name) {
            router.replace('/(auth)/onboarding');
          } else {
            router.replace('/(customer)');
          }
          break;
        }
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [isInitialized, session, role]);

  return (
    <View style={styles.container}>
      {/* Background dot pattern */}
      <View style={styles.dotPattern} />

      {/* Ambient glow */}
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />

      {/* Logo cluster */}
      <Animated.View style={[styles.logoCluster, { transform: [{ scale: pulseScale }] }]}>
        <View style={styles.logoOuter}>
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          {/* Speed lines */}
          <View style={styles.speedLines}>
            <View style={[styles.speedLine, { width: 24, opacity: 0.6 }]} />
            <View style={[styles.speedLine, { width: 40 }]} />
            <View style={[styles.speedLine, { width: 16, opacity: 0.4 }]} />
          </View>
        </View>

        {/* Brand name */}
        <View style={styles.brandText}>
          <Text style={styles.brandName}>Dzpatch</Text>
          <Text style={styles.brandTagline}>PRECISION LOGISTICS</Text>
        </View>
      </Animated.View>

      {/* Loading bar */}
      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                transform: [{
                  translateX: shimmerX.interpolate({
                    inputRange: [0, 3],
                    outputRange: [-192, 192],
                  }),
                }],
              },
            ]}
          />
        </View>
        <View style={styles.trustRow}>
          <Text style={styles.trustLabel}>✓ Secure Node</Text>
          <View style={styles.dot} />
          <Text style={styles.trustLabel}>Real-time</Text>
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
  dotPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  glow: {
    position: 'absolute',
    width: 384,
    height: 384,
    borderRadius: 192,
  },
  glowTop: {
    top: -80,
    left: '10%',
    backgroundColor: '#0040e0',
    opacity: 0.08,
  },
  glowBottom: {
    bottom: -80,
    right: '10%',
    backgroundColor: '#2e5bff',
    opacity: 0.05,
  },
  logoCluster: {
    alignItems: 'center',
    gap: 48,
  },
  logoOuter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 128,
    height: 128,
    backgroundColor: '#0040e0',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 20,
  },
  logoIcon: {
    fontSize: 64,
  },
  speedLines: {
    position: 'absolute',
    right: -16,
    gap: 4,
    alignItems: 'flex-start',
  },
  speedLine: {
    height: 4,
    backgroundColor: '#dde1ff',
    borderRadius: 2,
  },
  brandText: {
    alignItems: 'center',
    gap: 12,
  },
  brandName: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  brandTagline: {
    fontSize: 11,
    fontWeight: '700',
    color: '#768baf',
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 64,
    alignItems: 'center',
    gap: 24,
  },
  progressTrack: {
    width: 192,
    height: 4,
    backgroundColor: '#0a2342',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    width: 64,
    borderRadius: 2,
    backgroundColor: '#0040e0',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    opacity: 0.4,
  },
  trustLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#768baf',
  },
});
});
