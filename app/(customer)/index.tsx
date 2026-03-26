import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Avatar, Card, SkeletonCard, StatusBadge } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { Order } from '@/types/database';

// Dummy rider positions — scaled for latitudeDelta 0.018
const DUMMY_RIDERS = [
  { id: 'r1', latOffset: 0.004,  lngOffset: 0.005  },
  { id: 'r2', latOffset: -0.003, lngOffset: 0.007  },
  { id: 'r3', latOffset: 0.006,  lngOffset: -0.004 },
  { id: 'r4', latOffset: -0.005, lngOffset: -0.006 },
  { id: 'r5', latOffset: 0.001,  lngOffset: -0.008 },
];

// Default center — Lagos Island (fallback if no location permission)
const DEFAULT_REGION = {
  latitude: 6.4551,
  longitude: 3.3841,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

export default function HomeScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const mapRef = useRef<MapView>(null);

  // Animate rider markers slightly
  const riderAnims = useRef(DUMMY_RIDERS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Subtle float animation for each rider marker
    const animations = riderAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 400),
          Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get location — animate map to user's actual position
  // Last known position first (instant), then refine
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const r = { latitude: last.coords.latitude, longitude: last.coords.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 };
        setRegion(r);
        mapRef.current?.animateToRegion(r, 400);
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userRegion = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 };
      setRegion(userRegion);
      mapRef.current?.animateToRegion(userRegion, 600);
    })();
  }, []);

  const fetchActiveOrders = async (userId: string) => {
    if (!userId) return;
    const { data } = await supabase
      .from('orders')
      .select('id, status, created_at, pickup_address, dropoff_address, final_price')
      .eq('customer_id', userId)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(5);
    setActiveOrders(data ?? []);
  };

  // Re-fetch on focus and whenever profile loads
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id) return;
      setLoading(true);
      fetchActiveOrders(profile.id).finally(() => setLoading(false));
    }, [profile?.id])
  );

  const onRefresh = async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    await fetchActiveOrders(profile.id);
    setRefreshing(false);
  };

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const isEmpty = !loading && activeOrders.length === 0;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.timeGreeting}>{timeGreeting},</Text>
          <Text style={styles.greeting}>{firstName} 👋</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.notifBtn}
            onPress={() => router.push('/(customer)/notifications' as any)}
          >
            <Ionicons name="notifications-outline" size={20} color="#000D22" />
          </Pressable>
          <Pressable onPress={() => router.push('/profile' as any)}>
            <Avatar name={profile?.full_name ?? ''} uri={profile?.avatar_url} size="md" />
          </Pressable>
        </View>
      </View>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <View style={[styles.mapCard, isEmpty ? styles.mapCardLarge : styles.mapCardSmall]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          region={region}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          customMapStyle={mapStyle}
        >
          {/* Customer location pin */}
          <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.myPinOuter}>
              <View style={styles.myPinInner} />
            </View>
          </Marker>

          {/* Dummy rider markers */}
          {DUMMY_RIDERS.map((r) => (
            <Marker
              key={r.id}
              coordinate={{
                latitude:  region.latitude  + r.latOffset,
                longitude: region.longitude + r.lngOffset,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.riderPin}>
                <Text style={styles.riderPinText}>🛵</Text>
              </View>
            </Marker>
          ))}
        </MapView>

        {/* Riders nearby pill */}
        <View style={styles.mapPill}>
          <View style={styles.mapPillDot} />
          <Text style={styles.mapPillText}>5 riders nearby</Text>
        </View>
      </View>

      {/* ── Send a Package CTA ───────────────────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [styles.sendCta, isEmpty && styles.sendCtaLarge, pressed && { opacity: 0.9 }]}
        onPress={() => router.push('/(customer)/create-order' as any)}
      >
        <View style={styles.sendCtaIconWrap}>
          <Ionicons name="cube-outline" size={26} color="#FFFFFF" />
        </View>
        <View style={styles.sendCtaBody}>
          <Text style={styles.sendCtaTitle}>Send a Package</Text>
          <Text style={styles.sendCtaSub}>Book a rider in seconds</Text>
        </View>
        <View style={styles.sendCtaArrow}>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </View>
      </Pressable>


      {/* ── Active Deliveries ───────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Deliveries</Text>
          <Pressable onPress={() => router.push('/deliveries' as any)} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard style={{ marginTop: 12 }} />
          </>
        ) : activeOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="bicycle-outline" size={28} color="#0040e0" />
            </View>
            <View style={styles.emptyText}>
              <Text style={styles.emptyTitle}>No active deliveries</Text>
              <Text style={styles.emptyBody}>Your active orders will appear here.</Text>
            </View>
          </View>
        ) : (
          activeOrders.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => router.push({ pathname: '/(customer)/order-tracking', params: { orderId: order.id } } as any)}
              style={{ marginBottom: 12 }}
            >
              <ActiveOrderCard order={order} />
            </Pressable>
          ))
        )}
      </View>

    </ScrollView>
  );
}

// ─── Active Order Card ────────────────────────────────────────────────────────

function ActiveOrderCard({ order }: { order: Order }) {
  const progressMap: Record<string, number> = {
    pending: 0.1,
    matched: 0.25,
    pickup_en_route: 0.4,
    arrived_pickup: 0.55,
    in_transit: 0.7,
    arrived_dropoff: 0.85,
    delivered: 1,
  };
  const progress = progressMap[order.status] ?? 0;

  return (
    <Card style={styles.orderCard}>
      <View style={styles.orderTop}>
        <View>
          <StatusBadge status={order.status} />
          <Text style={styles.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
        </View>
        {order.final_price && (
          <Text style={styles.orderPrice}>₦{Number(order.final_price).toLocaleString()}</Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>
      <View style={styles.progressIcons}>
        <Text style={styles.progressEmoji}>🏪</Text>
        <Text style={styles.progressEmoji}>🛵</Text>
        <Text style={styles.progressEmoji}>🏠</Text>
      </View>

      <View style={styles.addressRow}>
        <View style={styles.dotPickup} />
        <Text style={styles.addressText} numberOfLines={1}>{order.pickup_address}</Text>
      </View>
      <View style={[styles.addressRow, { marginTop: 8 }]}>
        <View style={styles.dotDropoff} />
        <Text style={styles.addressText} numberOfLines={1}>{order.dropoff_address}</Text>
      </View>
    </Card>
  );
}

// ─── Custom map style (muted, clean) ─────────────────────────────────────────

const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e9f6' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F5F8',
  },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 40,
    gap: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  headerLeft: { gap: 2 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeGreeting: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#74777e',
  },
  greeting: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  // Map card
  mapCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  mapCardLarge: { height: 340 },
  mapCardSmall: { height: 220 },

  // My location pin
  myPinOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,64,224,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#0040e0',
  },
  myPinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0040e0',
  },

  // Rider marker
  riderPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(0,64,224,0.15)',
  },
  riderPinText: { fontSize: 20 },

  // Map overlay pill (top-left)
  mapPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  mapPillText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#000D22',
  },

  // Send a Package CTA button (below map)
  sendCta: {
    backgroundColor: '#0A2342',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
    shadowColor: '#0A2342',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  sendCtaIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  sendCtaBody: { flex: 1, gap: 3 },
  sendCtaTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  sendCtaSub: {
    fontSize: Typography.xs,
    color: 'rgba(168,196,255,0.8)',
    fontWeight: Typography.medium,
  },
  sendCtaArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Larger CTA when no active deliveries
  sendCtaLarge: {
    paddingVertical: 22,
    paddingHorizontal: 22,
    borderRadius: 26,
  },


  // Section
  section: { gap: 0 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#0040e0',
  },

  // Empty state
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyText: { flex: 1, gap: 3 },
  emptyTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  emptyBody: {
    fontSize: Typography.xs,
    color: '#74777e',
  },

  // Order card
  orderCard: { gap: 12 },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderId: {
    fontSize: Typography.xs,
    color: '#74777e',
    fontWeight: Typography.semibold,
    marginTop: 4,
    letterSpacing: 1,
  },
  orderPrice: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(196,198,207,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0040e0',
    borderRadius: 2,
  },
  progressIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  progressEmoji: { fontSize: 14 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotPickup: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 2, borderColor: '#0040e0', backgroundColor: '#FFFFFF', flexShrink: 0,
  },
  dotDropoff: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#0040e0', flexShrink: 0,
  },
  addressText: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#000D22',
  },
});
