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
  dropoff_address: string;
  dropoff_location: unknown;
  distance_km: number | null;
  customer_id: string;
}

interface CustomerInfo {
  full_name: string;
  phone: string;
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

export default function NavigateToDropoffScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { riderId } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [arriving, setArriving] = useState(false);
  const [dropoffCoord, setDropoffCoord] = useState<LatLng>(CALABAR_FALLBACK);
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

  // ── Fetch order + customer ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    supabase
      .from('orders')
      .select('dropoff_address, dropoff_location, distance_km, customer_id, status')
      .eq('id', orderId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error) {
          console.warn('navigate-to-dropoff load order failed:', error.message);
          return;
        }
        if (!data) return;
        const o = data as OrderInfo & { status: string };

        // Resume guard: if already past in_transit, redirect to delivery-completion
        if (
          o.status === 'arrived_dropoff' ||
          o.status === 'delivered' ||
          o.status === 'completed'
        ) {
          router.replace({ pathname: '/(rider)/delivery-completion' as any, params: { orderId } });
          return;
        }

        setOrder(o);
        // ETA: distance_km / 30 km/h avg speed, rounded to nearest minute, min 2
        const mins = o.distance_km ? Math.max(2, Math.round(o.distance_km / 30 * 60)) : null;
        setEta(mins);
        // Geocode dropoff address → move marker + animate map
        const storedCoord = parsePostgisPoint(o.dropoff_location);
        if (storedCoord) {
          setDropoffCoord(storedCoord);
          mapRef.current?.animateToRegion({ ...storedCoord, ...DELTA_SM }, 600);
        } else {
          geocodeAddress(o.dropoff_address).then((coord) => {
            if (coord) {
              setDropoffCoord(coord);
              mapRef.current?.animateToRegion({ ...coord, ...DELTA_SM }, 600);
            }
          });
        }
        const { data: cust } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', o.customer_id)
          .single();
        if (cust) setCustomer(cust as CustomerInfo);
      });
  }, [orderId]);

  // ── Update rider location every 10s ───────────────────────────────────────

  useEffect(() => {
    if (!riderId || !orderId) return;
    const syncCurrentLocation = async () => {
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
        // GPS temporarily unavailable â€” skip this sync attempt
      }
    };

    void syncCurrentLocation();
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

  // ── Open navigation ────────────────────────────────────────────────────────

  const openNavigation = async () => {
    if (!order) return;
    const encoded = encodeURIComponent(order.dropoff_address);
    const url = Platform.OS === 'ios'
      ? `maps:?daddr=${encoded}&dirflg=d`
      : `google.navigation:q=${encoded}&mode=d`;
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
    const supported = await Linking.canOpenURL(url);
    await Linking.openURL(supported ? url : fallback);
  };

  // ── Arrived at dropoff ─────────────────────────────────────────────────────

  const handleArrived = async () => {
    if (!orderId) return;
    setArriving(true);
    try {
      const { error } = await (supabase as any).rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: 'arrived_dropoff',
      });
      if (error) throw error;
      router.replace({
        pathname: '/(rider)/delivery-completion' as any,
        params: { orderId },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not update status. Please try again.');
    } finally {
      setArriving(false);
    }
  };

  const callCustomer = () => {
    if (!customer?.phone) return;
    Linking.openURL(`tel:${customer.phone}`);
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
        <Marker coordinate={dropoffCoord} title="Drop-off Location">
          <View style={styles.markerWrap}>
            <View style={styles.dropMarker}>
              <Ionicons name="location" size={28} color="#401600" />
            </View>
          </View>
        </Marker>
      </MapView>

      {/* Step badge */}
      <View style={[styles.stepBadge, { top: insets.top + 16 }]} pointerEvents="none">
        <Text style={styles.stepText}>Step 3 of 4</Text>
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
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderBadge}>
            <Ionicons name="navigate-outline" size={12} color="#0040e0" />
            <Text style={styles.cardHeaderText}>Heading to Drop-off</Text>
          </View>
          {eta && <Text style={styles.etaText}>{eta} min ETA</Text>}
        </View>

        <Text style={styles.addressLabel}>DROP-OFF ADDRESS</Text>
        <Text style={styles.addressText} numberOfLines={2}>
          {order?.dropoff_address ?? '—'}
        </Text>

        {/* Recipient card */}
        {customer && (
          <View style={styles.recipientCard}>
            <View style={styles.recipientAvatar}>
              <Text style={styles.recipientInitial}>
                {customer.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recipientLabel}>RECIPIENT</Text>
              <Text style={styles.recipientName}>{customer.full_name}</Text>
            </View>
            <Pressable style={styles.callBtn} onPress={callCustomer}>
              <Ionicons name="call" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable style={styles.navBtn} onPress={openNavigation}>
            <Ionicons name="navigate" size={16} color="#0040e0" />
            <Text style={styles.navBtnText}>Open Navigation</Text>
          </Pressable>
          <Pressable
            style={[styles.arrivalBtn, arriving && { opacity: 0.6 }]}
            onPress={handleArrived}
            disabled={arriving}
          >
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text style={styles.arrivalBtnText}>{arriving ? '...' : 'Arrived'}</Text>
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

  markerWrap: { alignItems: 'center' },
  dropMarker: {
    backgroundColor: colors.surface, borderRadius: 20,
    padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
  },

  stepBadge: {
    position: 'absolute', left: 16,
    backgroundColor: colors.surface,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  stepText: { fontSize: Typography.xs, fontWeight: '700', color: colors.textPrimary },

  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 20, paddingHorizontal: Spacing[5],
    gap: 10,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  cardHeaderText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },
  etaText: { fontSize: Typography.sm, fontWeight: '700', color: colors.textPrimary },

  addressLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  addressText: { fontSize: Typography.md, fontWeight: '800', color: colors.textPrimary },

  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.background, borderRadius: 14, padding: 12,
  },
  recipientAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0A2342', alignItems: 'center', justifyContent: 'center',
  },
  recipientInitial: { fontSize: Typography.sm, fontWeight: '900', color: '#FFFFFF' },
  recipientLabel: {
    fontSize: 9, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  recipientName: { fontSize: Typography.sm, fontWeight: '700', color: colors.textPrimary },
  callBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
  },

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
