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
  dropoff_address: string;
  distance_km: number | null;
  customer_id: string;
}

interface CustomerInfo {
  full_name: string;
  phone: string;
}

const CALABAR_DROP = { latitude: 5.9631, longitude: 8.3271 };
const DELTA_SM = { latitudeDelta: 0.04, longitudeDelta: 0.04 };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NavigateToDropoffScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { riderId } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [arriving, setArriving] = useState(false);
  const mapRef = useRef<MapView>(null);
  const locationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch order + customer ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    supabase
      .from('orders')
      .select('dropoff_address, distance_km, customer_id')
      .eq('id', orderId)
      .single()
      .then(async ({ data }) => {
        if (!data) return;
        const o = data as OrderInfo;
        setOrder(o);
        // ETA: distance_km / 30 km/h avg speed, rounded to nearest minute, min 2
        const mins = o.distance_km ? Math.max(2, Math.round(o.distance_km / 30 * 60)) : null;
        setEta(mins);
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
    } catch {
      Alert.alert('Error', 'Could not update status. Please try again.');
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
        initialRegion={{ ...CALABAR_DROP, ...DELTA_SM }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        <Marker coordinate={CALABAR_DROP} title="Drop-off Location">
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

const styles = StyleSheet.create({
  container: { flex: 1 },

  markerWrap: { alignItems: 'center' },
  dropMarker: {
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20,
    padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
  },

  stepBadge: {
    position: 'absolute', left: 16,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  stepText: { fontSize: Typography.xs, fontWeight: '700', color: '#000D22' },

  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 20, paddingHorizontal: Spacing[5],
    gap: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  cardHeaderText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },
  etaText: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },

  addressLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  addressText: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },

  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F7FAFC', borderRadius: 14, padding: 12,
  },
  recipientAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0A2342', alignItems: 'center', justifyContent: 'center',
  },
  recipientInitial: { fontSize: Typography.sm, fontWeight: '900', color: '#FFFFFF' },
  recipientLabel: {
    fontSize: 9, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  recipientName: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
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
});
