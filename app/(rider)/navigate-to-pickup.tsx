import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderInfo {
  pickup_address: string;
  dropoff_address: string;
  package_size: string | null;
  distance_km: number | null;
  customer_id: string;
}

const LAGOS = { latitude: 6.5244, longitude: 3.3792 };
const DELTA_SM = { latitudeDelta: 0.04, longitudeDelta: 0.04 };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NavigateToPickupScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile, riderId } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const mapRef = useRef<MapView>(null);
  const locationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch order details ────────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId || !profile?.id) return;
    supabase
      .from('orders')
      .select('pickup_address, dropoff_address, package_size, distance_km, customer_id')
      .eq('id', orderId)
      .single()
      .then(({ data }) => {
        if (data) setOrder(data as OrderInfo);
        setEta(Math.floor(Math.random() * 6) + 3);
      });

    // Set status to pickup_en_route when rider opens this screen
    (supabase as any).rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: 'pickup_en_route',
      p_changed_by: profile.id,
    }).then(({ error }: { error: any }) => {
      if (error) console.warn('pickup_en_route update failed:', error.message);
    });
  }, [orderId, profile?.id]);

  // ── Update rider location every 10s ───────────────────────────────────────

  useEffect(() => {
    if (!riderId || !orderId) return;
    locationTimer.current = setInterval(async () => {
      const { default: ExpoLocation } = await import('expo-location');
      const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
      await (supabase as any).rpc('update_rider_location', {
        p_rider_id: riderId,
        p_lat: loc.coords.latitude,
        p_lng: loc.coords.longitude,
        p_order_id: orderId,
      });
    }, 10000);
    return () => { if (locationTimer.current) clearInterval(locationTimer.current); };
  }, [riderId, orderId]);

  // ── Open native navigation ─────────────────────────────────────────────────

  const openNavigation = async () => {
    if (!order) return;
    const encoded = encodeURIComponent(order.pickup_address);
    const url = Platform.OS === 'ios'
      ? `maps:?daddr=${encoded}&dirflg=d`
      : `google.navigation:q=${encoded}&mode=d`;
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
    const supported = await Linking.canOpenURL(url);
    await Linking.openURL(supported ? url : fallback);
  };

  // ── Confirm arrival ────────────────────────────────────────────────────────

  const handleConfirmArrival = async () => {
    if (!orderId || !profile?.id) return;
    setConfirming(true);
    try {
      const { error } = await (supabase as any).rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: 'arrived_pickup',
        p_changed_by: profile.id,
      });
      if (error) throw error;
      router.replace({
        pathname: '/(rider)/confirm-arrival' as any,
        params: { orderId },
      });
    } catch {
      Alert.alert('Error', 'Could not confirm arrival. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* MapView */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={{ ...LAGOS, ...DELTA_SM }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        <Marker coordinate={LAGOS} title="Pickup Location">
          <View style={styles.markerWrap}>
            <Ionicons name="location" size={32} color="#0040e0" />
          </View>
        </Marker>
      </MapView>

      {/* Top badge — glassmorphism pickup label */}
      <View style={[styles.topBadge, { top: insets.top + 16 }]} pointerEvents="none">
        <Ionicons name="locate-outline" size={14} color="#0040e0" />
        <Text style={styles.topBadgeText} numberOfLines={2}>
          {order?.pickup_address ?? 'Loading...'}
        </Text>
      </View>

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.etaRow}>
          <View style={styles.etaBadge}>
            <Ionicons name="navigate-outline" size={14} color="#FFFFFF" />
            <Text style={styles.etaText}>En Route to Pickup</Text>
          </View>
          {eta && <Text style={styles.etaTime}>{eta} min ETA</Text>}
        </View>

        <Text style={styles.addressLabel}>PICKUP ADDRESS</Text>
        <Text style={styles.addressText} numberOfLines={2}>
          {order?.pickup_address ?? '—'}
        </Text>

        {order?.package_size && (
          <View style={styles.packageChip}>
            <Ionicons name="cube-outline" size={12} color="#74777e" />
            <Text style={styles.packageText}>{order.package_size} package</Text>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable style={styles.navBtn} onPress={openNavigation}>
            <Ionicons name="navigate" size={16} color="#0040e0" />
            <Text style={styles.navBtnText}>Open Navigation</Text>
          </Pressable>
          <Pressable
            style={[styles.arrivalBtn, confirming && { opacity: 0.6 }]}
            onPress={handleConfirmArrival}
            disabled={confirming}
          >
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text style={styles.arrivalBtnText}>{confirming ? 'Confirming...' : 'Arrived'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  markerWrap: { alignItems: 'center', justifyContent: 'center' },

  topBadge: {
    position: 'absolute', left: 16, right: 80,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  topBadgeText: { flex: 1, fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },

  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 20, paddingHorizontal: Spacing[5],
    gap: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
  },
  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0040e0', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  etaText: { fontSize: Typography.xs, fontWeight: '700', color: '#FFFFFF' },
  etaTime: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },

  addressLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  addressText: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },

  packageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F1F4F6', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  packageText: { fontSize: Typography.xs, fontWeight: '600', color: '#74777e' },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 14,
    borderWidth: 2, borderColor: '#0040e0', backgroundColor: '#EEF2FF',
  },
  navBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#0040e0' },
  arrivalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 14,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  arrivalBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' },
});
