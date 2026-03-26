import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';


type Slide = {
  headline: string;
  accent: string;
  body: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  badge: string;
  badgeIcon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  stat1Label: string;
  stat1Value: string;
  stat2Label: string;
  stat2Value: string;
  bgAccent: string;
};

const SLIDES: Slide[] = [
  {
    headline: 'Earn on Your',
    accent: 'Terms.',
    body: 'No fixed shifts. No boss. Just you, your wheels, and the road. Set your own pace and watch your earnings grow.',
    icon: 'cash-outline',
    badge: 'Up to ₦45k/day',
    badgeIcon: 'trending-up',
    stat1Label: 'Avg. Weekly',
    stat1Value: '₦85k+',
    stat2Label: 'Top Riders',
    stat2Value: '₦200k/mo',
    bgAccent: '#0040e0',
  },
  {
    headline: 'Your time,',
    accent: 'your rules.',
    body: 'Orchestrate your day with absolute precision. Work mornings, nights, or weekends — the choice is always yours.',
    icon: 'time-outline',
    badge: '24/7 Access',
    badgeIcon: 'infinite-outline',
    stat1Label: 'Avg. Hours',
    stat1Value: '4–6 hrs',
    stat2Label: 'Flexibility',
    stat2Value: '100%',
    bgAccent: '#0a2342',
  },
  {
    headline: 'Choose Your',
    accent: 'Momentum.',
    body: 'Whether you thrive in a team or prefer the freedom of solo riding — Dzpatch supports both. Join a fleet or go it alone.',
    icon: 'people-outline',
    badge: '12k+ Riders',
    badgeIcon: 'shield-checkmark-outline',
    stat1Label: 'Active Fleets',
    stat1Value: '200+',
    stat2Label: 'Cities',
    stat2Value: '5 & growing',
    bgAccent: '#16A34A',
  },
];

export default function RiderOnboarding() {
  const [step, setStep] = useState(0);
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const slide = SLIDES[step];

  const goNext = () => {
    if (step < SLIDES.length - 1) {
      animateTransition(() => setStep((s) => s + 1));
    } else {
      router.push('/(rider-auth)/signup-personal' as any);
    }
  };

  const goBack = () => {
    if (step > 0) animateTransition(() => setStep((s) => s - 1));
  };

  const animateTransition = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  };

  const isLast = step === SLIDES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Skip */}
      {!isLast && (
        <Pressable
          style={styles.skipBtn}
          onPress={() => router.push('/(rider-auth)/signup-personal' as any)}
          hitSlop={12}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      )}

      {/* Hero illustration area */}
      <View style={[styles.heroArea, { backgroundColor: slide.bgAccent + '15' }]}>
        {/* Large icon */}
        <View style={[styles.iconWrap, { backgroundColor: slide.bgAccent }]}>
          <Ionicons name={slide.icon} size={44} color="#FFFFFF" />
        </View>

        {/* Floating badge */}
        <View style={styles.badge}>
          <Ionicons name={slide.badgeIcon} size={14} color="#0040e0" />
          <Text style={styles.badgeText}>{slide.badge}</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{slide.stat1Value}</Text>
            <Text style={styles.statLabel}>{slide.stat1Label}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{slide.stat2Value}</Text>
            <Text style={styles.statLabel}>{slide.stat2Label}</Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.headline}>
          {slide.headline}{' '}
          <Text style={[styles.accentText, { color: '#0040e0' }]}>{slide.accent}</Text>
        </Text>
        <Text style={styles.body}>{slide.body}</Text>
      </Animated.View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotActive]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          {step > 0 && (
            <Pressable style={styles.backBtn} onPress={goBack} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color="#44474e" />
            </Pressable>
          )}
          <Pressable
            style={[styles.nextBtn, step === 0 && { flex: 1 }]}
            onPress={goNext}
          >
            <Text style={styles.nextBtnText}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Step indicator */}
        <Text style={styles.stepText}>
          {step + 1} of {SLIDES.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  skipBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#44474e',
  },

  heroArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000D22',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 32,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  statCard: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#000D22' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 36, backgroundColor: '#E5E7EB' },

  content: {
    paddingHorizontal: 28,
    paddingVertical: 20,
    gap: 12,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: '#000D22',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  accentText: { fontWeight: '900' },
  body: {
    fontSize: 15,
    color: '#44474e',
    lineHeight: 24,
  },

  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
    backgroundColor: '#F7FAFC',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C4C6CF',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#0040e0',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  backBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    backgroundColor: '#0040e0',
    borderRadius: 16,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    fontSize: 12,
    color: '#9ea2ac',
    textAlign: 'center',
    fontWeight: '500',
  },
});
