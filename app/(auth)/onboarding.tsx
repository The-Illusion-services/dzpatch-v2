import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    tag: 'Logistics Evolution',
    title: 'Fast\nDelivery',
    titleHighlight: 'Delivery',
    body: 'Experience the next generation of logistics. Secure, real-time tracked packages delivered with architectural precision.',
    icon: '📦',
    accent: '#0040e0',
  },
  {
    id: '2',
    tag: 'Live Intelligence',
    title: 'Real-Time\nTracking',
    titleHighlight: 'Tracking',
    body: 'Monitor your package at every step. Live GPS tracking keeps you informed from pickup to doorstep.',
    icon: '📍',
    accent: '#0040e0',
  },
  {
    id: '3',
    tag: 'Zero Friction',
    title: 'Secure\nPayments',
    titleHighlight: 'Payments',
    body: 'Integrated digital wallet with bank-grade security. Top up, pay, and withdraw with one tap.',
    icon: '🔐',
    accent: '#0040e0',
  },
];

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    } else {
      router.replace('/(auth)/login');
    }
  };

  const handleSkip = () => {
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            {/* Background accent */}
            <View style={styles.bgAccent} />

            {/* Slide number watermark */}
            <Text style={styles.slideNumber}>0{item.id}</Text>

            {/* Illustration card */}
            <View style={styles.illustrationWrap}>
              <View style={styles.illustrationShadow} />
              <View style={styles.illustrationCard}>
                <Text style={styles.illustrationIcon}>{item.icon}</Text>
                <View style={styles.illustrationLines}>
                  <View style={[styles.line, { width: 120 }]} />
                  <View style={[styles.line, { width: 80, opacity: 0.6 }]} />
                  <View style={[styles.etaRow]}>
                    <Text style={styles.etaText}>ETA: 12 MINS</Text>
                    <View style={styles.avatarRow}>
                      <View style={styles.avatar} />
                      <View style={[styles.avatar, { backgroundColor: '#0040e0' }]} />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Text content */}
            <View style={styles.textContent}>
              <View style={styles.tagPill}>
                <Text style={styles.tagText}>{item.tag}</Text>
              </View>
              <Text style={styles.title}>
                {item.title.split('\n')[0]}{'\n'}
                <Text style={styles.titleAccent}>{item.titleHighlight}</Text>
              </Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        )}
      />

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} hitSlop={8}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dotItem, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={handleNext} style={styles.nextBtn} activeOpacity={0.85}>
          <Text style={styles.nextText}>
            {activeIndex === SLIDES.length - 1 ? 'Start' : 'Next'}
          </Text>
          <Text style={styles.nextArrow}> →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  slide: {
    width,
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 120,
    justifyContent: 'center',
  },
  bgAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: '#F1F4F6',
    opacity: 0.5,
  },
  slideNumber: {
    position: 'absolute',
    bottom: 120,
    right: 32,
    fontSize: 128,
    fontWeight: '900',
    color: '#E5E9EB',
    opacity: 0.4,
  },
  illustrationWrap: {
    marginBottom: 48,
    position: 'relative',
  },
  illustrationShadow: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#0040e0',
    borderRadius: 16,
    transform: [{ translateX: 8 }, { translateY: 8 }, { rotate: '-3deg' }],
    opacity: 0.1,
  },
  illustrationCard: {
    backgroundColor: '#0A2342',
    borderRadius: 16,
    padding: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  illustrationIcon: {
    fontSize: 48,
  },
  illustrationLines: {
    flex: 1,
    gap: 12,
  },
  line: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
  },
  etaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  etaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#768baf',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: -8,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e3e5',
    borderWidth: 2,
    borderColor: '#0A2342',
  },
  textContent: {
    gap: 16,
  },
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,64,224,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0040e0',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#000D22',
    lineHeight: 52,
    letterSpacing: -1,
  },
  titleAccent: {
    color: '#0040e0',
  },
  body: {
    fontSize: 17,
    color: '#44474e',
    lineHeight: 28,
    maxWidth: 320,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 48,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a5f81',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dotItem: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e3e5',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#0040e0',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0040e0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  nextText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextArrow: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
