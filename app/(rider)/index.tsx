import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import type { RealtimeChannel } from '@supabase/supabase-js';

const LOCATION_UPDATE_INTERVAL = 10_000; // 10s
const NEARBY_REFRESH_INTERVAL = 20_000;  // 20s

const ACTIVE_TRIP_STATUSES = ['matched', 'pickup_en_route', 'arrived_pickup', 'in_transit', 'arrived_dropoff'];

type ActiveTrip = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
};

function tripPhaseLabel(status: string): string {
  if (status === 'matched') return 'Bid Accepted';
  if (status === 'pickup_en_route') return 'En Route to Pickup';
  if (status === 'arrived_pickup') return 'Arrived at Pickup';
  if (status === 'in_transit') return 'En Route to Dropoff';
  if (status === 'arrived_dropoff') return 'Arrived at Dropoff';
  return 'Active Trip';
}

function tripScreen(status: string): string {
  if (status === 'arrived_pickup') return '/(rider)/confirm-arrival';
  if (status === 'in_transit') return '/(rider)/navigate-to-dropoff';
  if (status === 'arrived_dropoff') return '/(rider)/delivery-completion';
  return '/(rider)/navigate-to-pickup';
}

type NearbyOrder = {
  order_id: string;
  customer_name: string;
  pickup_address: string;
  dropoff_address: string;
  distance_to_pickup: number;
  dynamic_price: number | null;
  suggested_price: number | null;
  package_size: string;
  package_description: string | null;
  category_name: string | null;
  created_at: string;
  expires_at: string | null;
};

const CALABAR_REGION: Region = {
  latitude: 5.9631,
  longitude: 8.3271,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

// Deterministic offset from order_id characters — stable across re-renders
function pinCoordFromId(id: string, center: { lat: number; lng: number } | null) {
  const base = center ?? { lat: CALABAR_REGION.latitude, lng: CALABAR_REGION.longitude };
  const seed1 = (id.charCodeAt(0) + id.charCodeAt(4) + id.charCodeAt(8)) / 765;  // 0..1
  const seed2 = (id.charCodeAt(1) + id.charCodeAt(5) + id.charCodeAt(9)) / 765;
  return {
    latitude: base.lat + (seed1 - 0.5) * 0.04,
    longitude: base.lng + (seed2 - 0.5) * 0.04,
  };
}

export default function RiderHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const mapRef = useRef<MapView>(null);

  const [riderId, setRiderId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyOrders, setNearbyOrders] = useState<NearbyOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<NearbyOrder | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);

  const cardAnim = useRef(new Animated.Value(0)).current;
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);
  const nearbyInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingOrdersChannelRef = useRef<RealtimeChannel | null>(null);

  // Fetch rider record ID + check for active trip
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('riders')
      .select('id, is_online')
      .eq('profile_id', user.id)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) return;
        const id = (data as any).id;
        setRiderId(id);
        setIsOnline((data as any).is_online);

        // Check for any in-progress order
        const { data: tripData } = await supabase
          .from('orders')
          .select('id, status, pickup_address, dropoff_address')
          .eq('rider_id', id)
          .in('status', ACTIVE_TRIP_STATUSES)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tripData) setActiveTrip(tripData as ActiveTrip);
      });
  }, [user?.id]);

  // Animate card in/out
  useEffect(() => {
    Animated.spring(cardAnim, {
      toValue: selectedOrder ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [selectedOrder, cardAnim]);

  const fetchNearbyOrders = useCallback(async () => {
    if (!riderId || !isOnline || activeTrip) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_nearby_orders', {
        p_rider_id: riderId,
        p_radius_meters: 10000,
      });
      if (error) {
        // RPC throws if no location — silently ignore
        if (!error.message.includes('location not available')) {
          console.warn('get_nearby_orders error:', error.message);
        }
      } else {
        const orders = (data as NearbyOrder[]) ?? [];
        setNearbyOrders(orders);
        // Auto-select first order so detail card shows by default
        if (orders.length > 0) {
          setSelectedOrder((prev) => prev ?? orders[0]);
        }
      }
    } finally {
      setLoadingOrders(false);
    }
  }, [riderId, isOnline, activeTrip]);

  // Start/stop location watching + nearby polling when online state changes
  useEffect(() => {
    if (!riderId || activeTrip) return;

    if (isOnline) {
      // Start location watcher
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Required', 'Please enable location to go online.');
          return;
        }

        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: LOCATION_UPDATE_INTERVAL, distanceInterval: 20 },
          (loc) => {
            const { latitude: lat, longitude: lng } = loc.coords;
            setUserLocation({ lat, lng });
            (supabase as any).rpc('update_rider_location', {
              p_rider_id: riderId,
              p_lat: lat,
              p_lng: lng,
            }).then();
          }
        );
        locationWatcher.current = sub;
      })();

      // Start nearby orders polling
      fetchNearbyOrders();
      nearbyInterval.current = setInterval(fetchNearbyOrders, NEARBY_REFRESH_INTERVAL);
    } else {
      // Stop tracking
      locationWatcher.current?.remove();
      locationWatcher.current = null;
      if (nearbyInterval.current) {
        clearInterval(nearbyInterval.current);
        nearbyInterval.current = null;
      }
      setNearbyOrders([]);
      setSelectedOrder(null);
    }

    return () => {
      locationWatcher.current?.remove();
      if (nearbyInterval.current) clearInterval(nearbyInterval.current);
    };
  }, [isOnline, riderId, activeTrip, fetchNearbyOrders]);

  // Realtime: listen for new pending orders while online
  useEffect(() => {
    if (!isOnline || !riderId || activeTrip) return;

    // Remove any existing channel before creating a new one
    if (pendingOrdersChannelRef.current) {
      supabase.removeChannel(pendingOrdersChannelRef.current);
      pendingOrdersChannelRef.current = null;
    }

    const channel = supabase
      .channel(`rider-pending-orders-${riderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.pending' },
        async () => {
          await fetchNearbyOrders();
          Alert.alert('🛵 New Order Nearby', 'A new delivery request is available. Check the job feed below!', [
            { text: 'View', style: 'default' },
          ]);
        }
      )
      // Remove orders that are no longer available (cancelled, matched, expired)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          if (updated.status !== 'pending') {
            setNearbyOrders((prev) => prev.filter((o) => o.order_id !== updated.id));
            setSelectedOrder((prev) => prev?.order_id === updated.id ? null : prev);
          }
        }
      )
      .subscribe();

    pendingOrdersChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      pendingOrdersChannelRef.current = null;
    };
  }, [isOnline, riderId, activeTrip, fetchNearbyOrders]);

  useAppStateChannels([pendingOrdersChannelRef.current]);

  const handleToggleOnline = async () => {
    if (togglingOnline) return;
    if (!riderId) {
      Alert.alert('Account Error', 'Rider profile not found. Please sign out and sign back in.');
      return;
    }

    if (!isOnline) {
      // Request location before going online
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location services to go online.');
        return;
      }
    }

    setTogglingOnline(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;

      if (!isOnline) {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        setUserLocation({ lat, lng });
        mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 800);
      }

      const { error } = await (supabase as any).rpc('toggle_rider_online', {
        p_rider_id: riderId,
        p_is_online: !isOnline,
        ...(lat !== undefined ? { p_lat: lat, p_lng: lng } : {}),
      });

      if (error) throw error;
      setIsOnline((prev) => !prev);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not update online status.');
    } finally {
      setTogglingOnline(false);
    }
  };

  const handleCenterMap = async () => {
    if (userLocation) {
      mapRef.current?.animateToRegion(
        { latitude: userLocation.lat, longitude: userLocation.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500
      );
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        mapRef.current?.animateToRegion(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          500
        );
      }
    }
  };

  const formatDistance = useCallback((meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  }, []);

  // suggested_price = customer's agreed price; dynamic_price = server baseline
  // Always show suggested_price first — that's what the customer is paying
  const formatOrderPrice = useCallback((suggested: number | null, dynamic: number | null) => {
    const p = suggested ?? dynamic ?? 0;
    return `₦${p.toLocaleString()}`;
  }, []);

  const cardTranslateY = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const cardOpacity = cardAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  return (
    <View style={styles.container}>
      {/* Full-screen Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={CALABAR_REGION}
        showsUserLocation={isOnline}
        showsMyLocationButton={false}
        customMapStyle={mapStyle}
      >
        {/* Nearby order pins — coords approximated from order_id hash until RPC returns exact coords */}
        {nearbyOrders.map((order) => (
          <Marker
            key={order.order_id}
            coordinate={pinCoordFromId(order.order_id, userLocation)}
            onPress={() => setSelectedOrder(order)}
          >
            <View style={[
              styles.orderPin,
              selectedOrder?.order_id === order.order_id && styles.orderPinActive,
            ]}>
              <Ionicons name="cube-outline" size={14} color="#FFFFFF" />
              <Text style={styles.orderPinPrice}>
                {formatOrderPrice(order.suggested_price, order.dynamic_price)}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Header: glassmorphism with online toggle */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.brand}>DZpatch</Text>
        </View>

        {/* Center: Online/Offline toggle */}
        <View style={styles.togglePill}>
          <Pressable
            style={[styles.toggleBtn, isOnline && styles.toggleBtnActive]}
            onPress={() => !isOnline && handleToggleOnline()}
            disabled={togglingOnline}
          >
            {togglingOnline && !isOnline ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                {isOnline && <View style={styles.onlineDot} />}
                <Text style={[styles.toggleBtnText, isOnline && styles.toggleBtnTextActive]}>
                  ONLINE
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, !isOnline && styles.toggleBtnOfflineActive]}
            onPress={() => isOnline && handleToggleOnline()}
            disabled={togglingOnline}
          >
            {togglingOnline && isOnline ? (
              <ActivityIndicator size="small" color="#44474e" />
            ) : (
              <Text style={[styles.toggleBtnText, !isOnline && styles.toggleBtnTextOffline]}>
                OFFLINE
              </Text>
            )}
          </Pressable>
        </View>

        {/* Right: order count badge */}
        <View style={styles.headerRight}>
          {isOnline && nearbyOrders.length > 0 && (
            <View style={styles.ordersBadge}>
              <Text style={styles.ordersBadgeText}>{nearbyOrders.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Map controls */}
      <View style={[styles.mapControls, { top: insets.top + 76 }]}>
        <Pressable style={styles.mapControlBtn} onPress={handleCenterMap}>
          <Ionicons name="locate" size={20} color="#000D22" />
        </Pressable>
      </View>

      {/* ── Active trip mode — replaces job feed ─────────────────────────── */}
      {activeTrip ? (
        <View style={[styles.activeTripCard, { bottom: insets.bottom + 80 }]}>
          {/* Phase badge */}
          <View style={styles.activeTripBadge}>
            <View style={styles.activeTripDot} />
            <Text style={styles.activeTripBadgeText}>{tripPhaseLabel(activeTrip.status)}</Text>
          </View>

          {/* Route */}
          <View style={styles.routeContainer}>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, styles.routeDotPickup]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeAddr} numberOfLines={1}>{activeTrip.pickup_address}</Text>
              </View>
            </View>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, styles.routeDotDropoff]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Drop-off</Text>
                <Text style={styles.routeAddr} numberOfLines={1}>{activeTrip.dropoff_address}</Text>
              </View>
            </View>
          </View>

          {/* CTA */}
          <Pressable
            style={styles.continueTripBtn}
            onPress={() => router.replace({ pathname: tripScreen(activeTrip.status) as any, params: { orderId: activeTrip.id } })}
          >
            <Ionicons name="navigate" size={16} color="#FFFFFF" />
            <Text style={styles.continueTripBtnText}>Continue Delivery</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Offline state banner */}
          {!isOnline && (
            <View style={[styles.offlineBanner, { top: insets.top + 72 }]}>
              <Ionicons name="moon-outline" size={16} color="#74777e" />
              <Text style={styles.offlineBannerText}>You are offline. Go online to see delivery jobs.</Text>
            </View>
          )}

          {/* Loading indicator for orders */}
          {loadingOrders && isOnline && (
            <View style={[styles.loadingBar, { top: insets.top + 72 }]}>
              <ActivityIndicator size="small" color="#0040e0" />
              <Text style={styles.loadingBarText}>Finding nearby orders...</Text>
            </View>
          )}

          {/* Online + no orders state */}
          {isOnline && !loadingOrders && nearbyOrders.length === 0 && !selectedOrder && (
            <View style={[styles.emptyState, { top: insets.top + 72 }]}>
              <Ionicons name="search-outline" size={16} color="#74777e" />
              <Text style={styles.emptyStateText}>No orders nearby right now</Text>
            </View>
          )}

          {/* Job list (horizontal scroll when no job selected) */}
          {isOnline && nearbyOrders.length > 0 && !selectedOrder && (
            <View style={[styles.jobListContainer, { bottom: insets.bottom + 80 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.jobListScroll}
              >
                {nearbyOrders.map((order) => (
                  <Pressable
                    key={order.order_id}
                    style={styles.jobChip}
                    onPress={() => setSelectedOrder(order)}
                  >
                    <View style={styles.jobChipTop}>
                      <Text style={styles.jobChipPrice}>
                        {formatOrderPrice(order.suggested_price, order.dynamic_price)}
                      </Text>
                      <Text style={styles.jobChipDist}>
                        {formatDistance(order.distance_to_pickup)}
                      </Text>
                    </View>
                    <Text style={styles.jobChipAddr} numberOfLines={1}>
                      {order.pickup_address}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Job Preview Card (bottom sheet style) */}
          {selectedOrder && (
            <Animated.View
              style={[
                styles.previewCard,
                { bottom: insets.bottom + 80, transform: [{ translateY: cardTranslateY }], opacity: cardOpacity },
              ]}
            >
              {/* Close */}
              <Pressable style={styles.previewClose} onPress={() => setSelectedOrder(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color="#44474e" />
              </Pressable>

              {/* Header row: distance + price */}
              <View style={styles.previewHeader}>
                <View>
                  <Text style={styles.previewMetaLabel}>Pickup Distance</Text>
                  <View style={styles.previewMetaValue}>
                    <Ionicons name="navigate-outline" size={16} color="#0040e0" />
                    <Text style={styles.previewDistance}>
                      {formatDistance(selectedOrder.distance_to_pickup)}
                    </Text>
                  </View>
                </View>
                <View style={styles.previewPriceBlock}>
                  <Text style={styles.previewMetaLabel}>Order Price</Text>
                  <Text style={styles.previewPrice}>
                    {formatOrderPrice(selectedOrder.suggested_price, selectedOrder.dynamic_price)}
                  </Text>
                </View>
              </View>

              {/* Package chip */}
              <View style={styles.packageChip}>
                <Ionicons name="cube-outline" size={14} color="#324768" />
                <Text style={styles.packageChipText}>
                  {selectedOrder.package_size.charAt(0).toUpperCase() + selectedOrder.package_size.slice(1)} Parcel
                  {selectedOrder.category_name ? ` · ${selectedOrder.category_name}` : ''}
                </Text>
              </View>

              {/* Route */}
              <View style={styles.routeContainer}>
                <View style={styles.routeLine} />
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, styles.routeDotPickup]} />
                  <View style={styles.routeTextBlock}>
                    <Text style={styles.routeLabel}>Pickup</Text>
                    <Text style={styles.routeAddr} numberOfLines={1}>
                      {selectedOrder.pickup_address}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, styles.routeDotDropoff]} />
                  <View style={styles.routeTextBlock}>
                    <Text style={styles.routeLabel}>Drop-off</Text>
                    <Text style={styles.routeAddr} numberOfLines={1}>
                      {selectedOrder.dropoff_address}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.previewActions}>
                <Pressable
                  style={styles.viewDetailsBtn}
                  onPress={() => router.push({ pathname: '/(rider)/job-details', params: { orderId: selectedOrder.order_id } } as any)}
                >
                  <Text style={styles.viewDetailsBtnText}>View Details</Text>
                </Pressable>
                <Pressable
                  style={styles.acceptBtn}
                  onPress={() => router.push({ pathname: '/(rider)/job-details', params: { orderId: selectedOrder.order_id } } as any)}
                >
                  <Text style={styles.acceptBtnText}>Accept Order</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}

// Subtle custom map style (light, desaturated)
const mapStyle = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9dff0' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f7fa' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e8ecf0' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c4c6cf' }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  // Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  headerLeft: { width: 80 },
  brand: { fontSize: 18, fontWeight: '800', color: '#000D22', letterSpacing: -0.5 },
  headerRight: { width: 80, alignItems: 'flex-end' },

  // Toggle pill
  togglePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999, paddingHorizontal: 4, paddingVertical: 4,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: 'rgba(196,198,207,0.3)',
  },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 999,
  },
  toggleBtnActive: { backgroundColor: '#0040e0', shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  toggleBtnOfflineActive: { backgroundColor: 'transparent' },
  toggleBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#74777e' },
  toggleBtnTextActive: { color: '#FFFFFF' },
  toggleBtnTextOffline: { color: '#44474e' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },

  // Orders badge
  ordersBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0A2342',
    alignItems: 'center', justifyContent: 'center',
  },
  ordersBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  // Map controls
  mapControls: { position: 'absolute', right: Spacing[4], zIndex: 40 },
  mapControlBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },

  // Order pins on map
  orderPin: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#0040e0', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 6,
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  orderPinActive: { backgroundColor: '#0A2342', transform: [{ scale: 1.1 }] },
  orderPinPrice: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  // Banners
  offlineBanner: {
    position: 'absolute', left: Spacing[5], right: Spacing[5], zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  offlineBannerText: { fontSize: Typography.xs, color: '#74777e', flex: 1 },
  loadingBar: {
    position: 'absolute', left: Spacing[5], right: Spacing[5], zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  loadingBarText: { fontSize: Typography.xs, color: '#0040e0', fontWeight: '600' },
  emptyState: {
    position: 'absolute', left: Spacing[5], right: Spacing[5], zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyStateText: { fontSize: Typography.xs, color: '#74777e' },

  // Job list horizontal scroll
  jobListContainer: { position: 'absolute', left: 0, right: 0, zIndex: 40 },
  jobListScroll: { paddingHorizontal: Spacing[5], gap: 10 },
  jobChip: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    padding: 14, gap: 4, minWidth: 160,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  jobChipTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobChipPrice: { fontSize: Typography.sm, fontWeight: '800', color: '#0040e0' },
  jobChipDist: { fontSize: Typography.xs, fontWeight: '600', color: '#74777e' },
  jobChipAddr: { fontSize: 11, color: '#44474e' },

  // Active trip card
  activeTripCard: {
    position: 'absolute', left: Spacing[4], right: Spacing[4], zIndex: 40,
    backgroundColor: '#FFFFFF', borderRadius: 28,
    padding: 20, gap: 16,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14, shadowRadius: 24, elevation: 14,
    borderWidth: 1.5, borderColor: '#0040e0',
  },
  activeTripBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#0040e0', borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  activeTripDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF',
  },
  activeTripBadgeText: { fontSize: Typography.xs, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  continueTripBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: 14,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  continueTripBtnText: { fontSize: Typography.sm, fontWeight: '800', color: '#FFFFFF' },

  // Preview card
  previewCard: {
    position: 'absolute', left: Spacing[4], right: Spacing[4], zIndex: 40,
    backgroundColor: '#FFFFFF', borderRadius: 28,
    padding: 20, gap: 14,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 12,
  },
  previewClose: {
    position: 'absolute', top: 14, right: 14,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F4F6', alignItems: 'center', justifyContent: 'center',
  },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: 36 },
  previewMetaLabel: { fontSize: 10, fontWeight: '700', color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  previewMetaValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewDistance: { fontSize: 26, fontWeight: '800', color: '#000D22', letterSpacing: -0.5 },
  previewPriceBlock: { alignItems: 'flex-end' },
  previewPrice: { fontSize: 26, fontWeight: '800', color: '#0040e0', letterSpacing: -0.5 },

  packageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F1F4F6', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  packageChipText: { fontSize: Typography.xs, fontWeight: '600', color: '#324768' },

  // Route
  routeContainer: { gap: 16, paddingLeft: 8 },
  routeLine: {
    position: 'absolute', left: 17, top: 22, bottom: 22,
    width: 1, borderWidth: 1, borderColor: '#C4C6CF', borderStyle: 'dashed',
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 4, borderColor: '#FFFFFF', marginTop: 2, flexShrink: 0 },
  routeDotPickup: { backgroundColor: '#0040e0' },
  routeDotDropoff: { backgroundColor: '#401600' },
  routeTextBlock: { flex: 1, gap: 2 },
  routeLabel: { fontSize: 10, fontWeight: '700', color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddr: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },

  // Buttons
  previewActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  viewDetailsBtn: {
    flex: 1, height: 48, borderRadius: 14,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  viewDetailsBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  acceptBtn: {
    flex: 1.5, height: 48, borderRadius: 14,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  acceptBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' },
});
