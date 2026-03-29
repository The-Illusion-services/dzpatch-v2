import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography } from '@/constants/theme';
import type { Order } from '@/types/database';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Status timeline ──────────────────────────────────────────────────────────

const STEPS = [
  { key: 'matched',         label: 'Rider\nAssigned',    icon: '🏍️' },
  { key: 'pickup_en_route', label: 'Heading to\nPick-up', icon: '🛣️' },
  { key: 'arrived_pickup',  label: 'Picked\nUp',          icon: '📦' },
  { key: 'in_transit',      label: 'On the\nWay',         icon: '🚀' },
  { key: 'delivered',       label: 'Delivered',            icon: '✅' },
] as const;

const STATUS_STEP: Record<string, number> = {
  matched: 0,
  pickup_en_route: 1,
  arrived_pickup: 2,
  in_transit: 3,
  arrived_dropoff: 3,
  delivered: 4,
  completed: 4,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatLng {
  latitude: number;
  longitude: number;
}

interface RiderProfile {
  full_name: string;
  phone: string;
  average_rating: number;
  vehicle_plate?: string;
}

// Default Calabar coordinates
const LAGOS_DEFAULT: LatLng = { latitude: 5.9631, longitude: 8.3271 };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ActiveOrderTrackingScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null);
  const [riderLocation, setRiderLocation] = useState<LatLng>(LAGOS_DEFAULT);
  const [dropoffLocation, setDropoffLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapView>(null);
  const orderChannelRef = useRef<RealtimeChannel | null>(null);
  const locationChannelRef = useRef<RealtimeChannel | null>(null);

  // ── Rider pin bounce ──────────────────────────────────────────────────────
  const bounceAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -5, duration: 700, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch order ───────────────────────────────────────────────────────────

  const fetchOrder = useCallback(async (id: string) => {
    const { data } = await supabase.from('orders').select('id, status, rider_id, final_price, dropoff_address, created_at, delivery_code').eq('id', id).single();
    if (data) {
      const o = data as { rider_id: string | null; status: string; [key: string]: any };
      setOrder(o as unknown as Order);
      if (o.dropoff_lat && o.dropoff_lng) {
        setDropoffLocation({ latitude: o.dropoff_lat, longitude: o.dropoff_lng });
      }
      if (o.rider_id) {
        fetchRider(o.rider_id);
        fetchRiderLocation(o.rider_id);
      }
    }
  }, []);

  const fetchRider = async (riderId: string) => {
    const { data } = await supabase
      .from('riders')
      .select('average_rating, vehicle_plate, profiles(full_name, phone)')
      .eq('id', riderId)
      .single();
    if (data && (data as any).profiles) {
      setRiderProfile({
        ...(data as any).profiles,
        average_rating: (data as any).average_rating ?? 0,
        vehicle_plate: (data as any).vehicle_plate,
      });
    }
  };

  const fetchRiderLocation = async (riderId: string) => {
    const { data } = await supabase
      .from('rider_locations')
      .select('latitude, longitude')
      .eq('rider_id', riderId)
      .single();
    if (data) {
      const loc = data as { latitude: number; longitude: number };
      setRiderLocation({ latitude: loc.latitude, longitude: loc.longitude });
    }
  };

  // ── Realtime — order status ────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    fetchOrder(orderId).finally(() => setLoading(false));

    const channel = supabase
      .channel(`active-tracking:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as Order;
          setOrder(updated);
          if (updated.rider_id) fetchRider(updated.rider_id);
          if (updated.status === 'delivered' || updated.status === 'completed') {
            const createdAt = (order as any)?.created_at;
            const deliveryMins = createdAt
              ? Math.round((Date.now() - new Date(createdAt).getTime()) / 60000)
              : null;
            router.replace({
              pathname: '/(customer)/delivery-success',
              params: {
                orderId,
                finalPrice: String((updated as any).final_price ?? 0),
                riderId: (updated as any).rider_id ?? '',
                riderName: riderProfile?.full_name ?? '',
                deliveryTime: deliveryMins ? `${deliveryMins} min` : undefined,
              },
            } as any);
          }
        }
      )
      .subscribe();

    orderChannelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [orderId, fetchOrder]);

  // ── Realtime — rider location ──────────────────────────────────────────────

  useEffect(() => {
    if (!order?.rider_id) return;

    const locationChannel = supabase
      .channel(`rider-loc:${order.rider_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rider_locations',
          filter: `rider_id=eq.${order.rider_id}`,
        },
        (payload) => {
          const newLoc: LatLng = { latitude: (payload.new as any).latitude, longitude: (payload.new as any).longitude };
          setRiderLocation(newLoc);
          mapRef.current?.animateCamera({ center: newLoc }, { duration: 800 });
        }
      )
      .subscribe();

    locationChannelRef.current = locationChannel;

    return () => { supabase.removeChannel(locationChannel); };
  }, [order?.rider_id]);

  useAppStateChannels([orderChannelRef.current, locationChannelRef.current]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 36 }}>🗺️</Text>
        <Text style={{ fontSize: Typography.sm, color: '#44474e', marginTop: 8 }}>Loading map...</Text>
      </View>
    );
  }

  const currentStep = STATUS_STEP[order.status] ?? 0;
  const isDelivered = order.status === 'delivered' || order.status === 'completed';
  const routeCoords: LatLng[] = dropoffLocation ? [riderLocation, dropoffLocation] : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Track Order</Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{isDelivered ? 'Done' : 'Live'}</Text>
        </View>
      </View>

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{ ...riderLocation, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          customMapStyle={mapStyle}
        >
          {/* Rider marker */}
          <Marker coordinate={riderLocation} anchor={{ x: 0.5, y: 1 }}>
            <Animated.View style={[styles.riderMarker, { transform: [{ translateY: bounceAnim }] }]}>
              <View style={styles.riderMarkerBubble}>
                <Text style={styles.riderMarkerIcon}>🏍️</Text>
              </View>
              <View style={styles.riderMarkerTail} />
              {riderProfile && (
                <View style={styles.riderNameTag}>
                  <Text style={styles.riderNameTagText}>{riderProfile.full_name.split(' ')[0]}</Text>
                </View>
              )}
            </Animated.View>
          </Marker>

          {/* Drop-off marker */}
          {dropoffLocation && (
            <Marker coordinate={dropoffLocation}>
              <View style={styles.destMarker}>
                <Text style={{ fontSize: 22 }}>🏠</Text>
              </View>
            </Marker>
          )}

          {/* Route dashed line */}
          {routeCoords.length === 2 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="#0040e0"
              strokeWidth={3}
              lineDashPattern={[8, 6]}
            />
          )}
        </MapView>

        {/* ETA status pill */}
        <View style={styles.etaPill}>
          <Text style={styles.etaPillText}>
            {order.status === 'matched'         ? '🟡 Rider assigned' :
             order.status === 'pickup_en_route' ? '🟡 Heading to pick-up' :
             order.status === 'arrived_pickup'  ? '📦 Arrived at pick-up' :
             order.status === 'in_transit'      ? '🚀 On the way' :
             order.status === 'delivered'       ? '✅ Delivered!' : '📍 Tracking...'}
          </Text>
        </View>
      </View>

      {/* ── Bottom dashboard ── */}
      <View style={[styles.dashboard, { paddingBottom: insets.bottom + 12 }]}>
        {/* Progress timeline */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timelineScroll}>
          <View style={styles.timeline}>
            {STEPS.map((step, idx) => {
              const done = currentStep > idx;
              const active = currentStep === idx;
              return (
                <View key={step.key} style={styles.timelineStep}>
                  {idx < STEPS.length - 1 && (
                    <View style={[styles.connector, done && styles.connectorDone]} />
                  )}
                  <View style={[styles.stepCircle, done && styles.stepCircleDone, active && styles.stepCircleActive]}>
                    <Text style={styles.stepIcon}>{step.icon}</Text>
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive, done && styles.stepLabelDone]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Rider card */}
        {riderProfile ? (
          <View style={styles.riderCard}>
            <View style={styles.riderAvatarWrap}>
              <View style={styles.riderAvatarFallback}>
                <Text style={styles.riderAvatarInitials}>{riderProfile.full_name.charAt(0)}</Text>
              </View>
              <View style={styles.onlineDot} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.riderName}>{riderProfile.full_name}</Text>
              <Text style={styles.riderSub}>
                ⭐ {riderProfile.average_rating.toFixed(1)}
                {riderProfile.vehicle_plate ? `  ·  ${riderProfile.vehicle_plate}` : ''}
              </Text>
            </View>
            <View style={styles.riderActions}>
              <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${riderProfile.phone}`)}>
                <Text style={styles.actionIcon}>📞</Text>
              </Pressable>
              <Pressable
                style={styles.chatBtn}
                onPress={() => router.push({ pathname: '/(customer)/chat', params: { orderId } } as any)}
              >
                <Text style={styles.actionIcon}>💬</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingText}>Connecting with rider...</Text>
          </View>
        )}

        {/* Delivery code — visible once rider is in transit */}
        {(order as any).delivery_code && ['in_transit', 'arrived_dropoff'].includes(order.status) && (
          <View style={styles.deliveryCodeCard}>
            <Text style={styles.deliveryCodeLabel}>DELIVERY CODE</Text>
            <Text style={styles.deliveryCodeValue}>{(order as any).delivery_code}</Text>
            <Text style={styles.deliveryCodeHint}>Give this code to the rider when they arrive</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footerRow}>
          <Text style={styles.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
          {order.final_price && (
            <Text style={styles.finalPrice}>₦{Number(order.final_price).toLocaleString()}</Text>
          )}
          {['matched', 'pickup_en_route'].includes(order.status) && (
            <Pressable
              onPress={() => router.push({
                pathname: '/(customer)/cancel-order-modal',
                params: { orderId },
              } as any)}
            >
              <Text style={styles.cancelLink}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Custom map style (minimal grey) ─────────────────────────────────────────

const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e9e9e9' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d7e8' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
    zIndex: 10,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: '600' },
  headerTitle: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
    marginLeft: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dde1ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0040e0' },
  liveText: { fontSize: 11, fontWeight: Typography.bold, color: '#0040e0', textTransform: 'uppercase', letterSpacing: 1 },

  mapContainer: { flex: 1 },
  riderMarker: { alignItems: 'center' },
  riderMarkerBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  riderMarkerIcon: { fontSize: 24 },
  riderMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0040e0',
    marginTop: -1,
  },
  riderNameTag: {
    marginTop: 4,
    backgroundColor: '#000D22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  riderNameTagText: { fontSize: 10, fontWeight: Typography.bold, color: '#FFFFFF', letterSpacing: 0.5 },
  destMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000D22',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  etaPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  etaPillText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },

  dashboard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing[5],
    paddingTop: 16,
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },

  timelineScroll: { marginHorizontal: -Spacing[5] },
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing[5],
    paddingVertical: 4,
  },
  timelineStep: { alignItems: 'center', width: 72, position: 'relative' },
  connector: {
    position: 'absolute',
    top: 14,
    left: '50%',
    width: 72,
    height: 2,
    backgroundColor: '#E0E3E5',
    zIndex: 0,
  },
  connectorDone: { backgroundColor: '#0040e0' },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E3E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepCircleDone: { backgroundColor: '#dde1ff' },
  stepCircleActive: {
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  stepIcon: { fontSize: 14 },
  stepLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 6,
  },
  stepLabelActive: { color: '#0040e0' },
  stepLabelDone: { color: '#000D22' },

  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F1F4F6',
    borderRadius: 20,
    padding: 14,
  },
  riderAvatarWrap: { position: 'relative' },
  riderAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarInitials: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#FFFFFF' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#16A34A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  riderName: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  riderSub: { fontSize: Typography.xs, color: '#44474e', marginTop: 2 },
  riderActions: { flexDirection: 'row', gap: 8 },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 20 },

  waitingCard: {
    backgroundColor: '#F1F4F6',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  waitingText: { fontSize: Typography.sm, color: '#44474e', fontWeight: Typography.semibold },

  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderId: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: '#74777e' },
  finalPrice: {
    flex: 1,
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
    textAlign: 'center',
  },
  cancelLink: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#ba1a1a' },

  // Delivery code
  deliveryCodeCard: {
    backgroundColor: '#0A2342', borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 4,
  },
  deliveryCodeLabel: {
    fontSize: 10, fontWeight: '800', color: '#b8c3ff',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  deliveryCodeValue: {
    fontSize: 36, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: 8,
  },
  deliveryCodeHint: {
    fontSize: Typography.xs, color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
});
