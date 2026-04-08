import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parsePostgisPoint } from '@/lib/location';
import { getGoogleMapsApiKey } from '@/lib/google-maps';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderInfo {
  pickup_address: string;
  pickup_location: unknown;
  dropoff_address: string;
  package_size: string | null;
  distance_km: number | null;
  customer_id: string;
}

interface LatLng { latitude: number; longitude: number; }

const DELTA_SM = { latitudeDelta: 0.04, longitudeDelta: 0.04 };
const CALABAR_FALLBACK: LatLng = { latitude: 5.9631, longitude: 8.3271 };

async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const key = getGoogleMapsApiKey();
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'OK' && json.results?.[0]) {
      const loc = json.results[0].geometry.location;
      return { latitude: loc.lat, longitude: loc.lng };
    }
  } catch { /* ignore — fall back to default */ }
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NavigateToPickupScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile, riderId } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [enRouteReady, setEnRouteReady] = useState(false);
  const [pickupCoord, setPickupCoord] = useState<LatLng>(CALABAR_FALLBACK);
  const mapRef = useRef<MapView>(null);
  const locationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Keep-screen-on warning (fires once on mount) ───────────────────────────
  useEffect(() => {
    Alert.alert(
      '📍 Keep App Open',
      'Your location is shared with the customer while you navigate. Keep this app in the foreground for accurate tracking.',
      [{ text: 'Got it', style: 'default' }],
    );
  }, []);

  // ── Fetch order details ────────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId || !profile?.id) return;
    supabase
      .from('orders')
      .select('pickup_address, pickup_location, dropoff_address, package_size, distance_km, customer_id, status')
      .eq('id', orderId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('navigate-to-pickup load order failed:', error.message);
          return;
        }
        if (!data) return;

        const o = data as OrderInfo & { status: string };

        // Resume guard: if the order has already passed pickup, redirect to the correct screen
        if (o.status === 'arrived_pickup' || o.status === 'in_transit' ||
            o.status === 'arrived_dropoff' || o.status === 'delivered' || o.status === 'completed') {
          router.replace({ pathname: '/(rider)/confirm-arrival' as any, params: { orderId } });
          return;
        }

        setOrder(o);
        // ETA: distance_km / 30 km/h avg speed, rounded to nearest minute, min 2
        const mins = o.distance_km ? Math.max(2, Math.round(o.distance_km / 30 * 60)) : null;
        setEta(mins);
        // Geocode pickup address → move marker + animate map
        const storedCoord = parsePostgisPoint(o.pickup_location);
        if (storedCoord) {
          setPickupCoord(storedCoord);
          mapRef.current?.animateToRegion({ ...storedCoord, ...DELTA_SM }, 600);
        } else {
          geocodeAddress(o.pickup_address).then((coord) => {
            if (coord) {
              setPickupCoord(coord);
              mapRef.current?.animateToRegion({ ...coord, ...DELTA_SM }, 600);
            }
          });
        }

        // Only push pickup_en_route if order is still in matched state
        if (o.status === 'matched' || o.status === 'pickup_en_route') {
          if (o.status === 'pickup_en_route') {
            // Already set — no transition needed
            setEnRouteReady(true);
            return;
          }
          (supabase as any).rpc('update_order_status', {
            p_order_id: orderId,
            p_new_status: 'pickup_en_route',
            p_changed_by: profile.id,
          }).then(({ error: rpcErr }: { error: any }) => {
            if (rpcErr) {
              console.warn('pickup_en_route update failed:', rpcErr.message);
            } else {
              setEnRouteReady(true);
            }
          });
        }
      });
  }, [orderId, profile?.id]);

  // ── Update rider location every 10s ───────────────────────────────────────

  useEffect(() => {
    if (!riderId || !orderId) return;
    locationTimer.current = setInterval(async () => {
      try {
        const { default: ExpoLocation } = await import('expo-location');
        const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
        await (supabase as any).rpc('update_rider_location', {
          p_rider_id: riderId,
          p_lat: loc.coords.latitude,
          p_lng: loc.coords.longitude,
          p_order_id: orderId,
        });
      } catch {
        // GPS temporarily unavailable — skip this interval tick
      }
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
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not confirm arrival. Please try again.');
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
        initialRegion={{ ...CALABAR_FALLBACK, ...DELTA_SM }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        <Marker coordinate={pickupCoord} title="Pickup Location">
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

      {/* Chat button — top right */}
      <Pressable
        style={[styles.chatFab, { top: insets.top + 16 }]}
        onPress={() => router.push({ pathname: '/(rider)/rider-chat', params: { orderId } } as any)}
        hitSlop={8}
      >
        <Ionicons name="chatbubble-ellipses" size={20} color="#0040e0" />
      </Pressable>

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
            style={[styles.arrivalBtn, (!enRouteReady || confirming) && { opacity: 0.6 }]}
            onPress={handleConfirmArrival}
            disabled={!enRouteReady || confirming}
          >
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text style={styles.arrivalBtnText}>{confirming ? 'Confirming...' : !enRouteReady ? 'Setting up...' : 'Arrived'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof import('@/hooks/use-theme').useTheme>['colors']) {
  return StyleSheet.create({
  container: { flex: 1 },

  markerWrap: { alignItems: 'center', justifyContent: 'center' },

  topBadge: {
    position: 'absolute', left: 16, right: 80,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  topBadgeText: { flex: 1, fontSize: Typography.sm, fontWeight: '700', color: colors.textPrimary },

  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 20, paddingHorizontal: Spacing[5],
    gap: 10,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
  },
  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0040e0', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  etaText: { fontSize: Typography.xs, fontWeight: '700', color: '#FFFFFF' },
  etaTime: { fontSize: Typography.sm, fontWeight: '700', color: colors.textPrimary },

  addressLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  addressText: { fontSize: Typography.md, fontWeight: '800', color: colors.textPrimary },

  packageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.background, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  packageText: { fontSize: Typography.xs, fontWeight: '600', color: colors.textSecondary },

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

  chatFab: {
    position: 'absolute', right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  }); // end makeStyles
}
