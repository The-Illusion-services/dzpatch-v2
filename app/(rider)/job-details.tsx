import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { buildRiderEarningsBreakdown } from '@/lib/sprint4-ux';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

type OrderDetail = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  package_size: string;
  package_description: string | null;
  package_notes: string | null;
  dynamic_price: number | null;
  suggested_price: number | null;
  platform_commission_rate: number | null;
  platform_commission_amount: number | null;
  rider_net_amount: number | null;
  distance_km: number | null;
  created_at: string;
  expires_at: string | null;
  category: { name: string } | null;
};

export default function JobDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { riderId } = useAuthStore();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    let isActive = true;

    const loadOrder = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, pickup_address, dropoff_address,
          package_size, package_description, package_notes,
          dynamic_price, suggested_price, platform_commission_rate, platform_commission_amount, rider_net_amount, distance_km,
          created_at, expires_at,
          category:category_id(name)
        `)
        .eq('id', orderId)
        .single();

      if (!isActive) return;

      setLoading(false);
      if (error || !data) {
        if (error) {
          console.warn('job-details load failed:', error.message);
        }
        Alert.alert('Error', 'Order not found.');
        router.back();
        return;
      }
      setOrder(data as any);
    };

    void loadOrder();

    return () => {
      isActive = false;
    };
  }, [orderId]);

  const formatPrice = (price: number | null, fallback: number | null) => {
    const p = price ?? fallback ?? 0;
    return `₦${p.toLocaleString()}`;
  };

  const timeSince = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return 'just now';
    if (diff === 1) return '1 min ago';
    return `${diff} mins ago`;
  };

  const handleAccept = async () => {
    if (!orderId || !order) return;
    if (!riderId) {
      Alert.alert('Not Ready', 'Your rider profile is still loading. Please wait a moment and try again.');
      return;
    }
    // Use suggested_price (customer's agreed price) first; fall back to dynamic_price
    const price = order.suggested_price ?? order.dynamic_price;
    if (!price) {
      Alert.alert('Error', 'No price available for this order.');
      return;
    }
    setAccepting(true);
    try {
      // Accepting = placing a bid at the listed price
      const { error } = await (supabase as any).rpc('place_bid', {
        p_order_id: orderId,
        p_rider_id: riderId,
        p_amount: price,
      });
      if (error) throw error;
      router.replace({
        pathname: '/(rider)/waiting-for-customer' as any,
        params: { orderId, bidAmount: String(price) },
      });
    } catch (error: any) {
      Alert.alert('Could not place bid', error.message ?? 'Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleCounterOffer = () => {
    router.push({ pathname: '/(rider)/counter-offer', params: { orderId } } as any);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0040e0" />
      </View>
    );
  }

  if (!order) return null;

  const isExpired = order.expires_at ? new Date(order.expires_at) < new Date() : false;
  const isAvailable = order.status === 'pending' && !isExpired;
  const orderPrice = order.suggested_price ?? order.dynamic_price ?? 0;
  const earningsBreakdown = buildRiderEarningsBreakdown({
    gross: orderPrice,
    commissionAmount: order.platform_commission_amount,
    commissionRatePercentage: order.platform_commission_rate,
  });
  const estimatedNet = order.rider_net_amount ? Math.round(order.rider_net_amount) : earningsBreakdown.net;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        {!isAvailable && (
          <View style={styles.expiredBanner}>
            <Ionicons name="time-outline" size={16} color="#ba1a1a" />
            <Text style={styles.expiredText}>
              {isExpired ? 'This order has expired' : `Order status: ${order.status}`}
            </Text>
          </View>
        )}

        {/* Price + time */}
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroLabel}>Est. Take-Home</Text>
            <Text style={styles.heroPrice}>₦{estimatedNet.toLocaleString()}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroRight}>
            <Text style={styles.heroLabel}>Gross / Request</Text>
            <Text style={styles.heroTime}>₦{orderPrice.toLocaleString()} · {timeSince(order.created_at)}</Text>
          </View>
        </View>

        {/* Feasibility chip */}
        {order.distance_km && (
          <View style={styles.feasibilityChip}>
            <Text style={styles.feasibilityIcon}>📍</Text>
            <Text style={styles.feasibilityText}>
              ~{Math.max(2, Math.round(order.distance_km / 30 * 60))} min to reach pickup · {order.distance_km} km
            </Text>
          </View>
        )}

        {/* Route card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="map-outline" size={18} color="#0040e0" />
            </View>
            <Text style={styles.cardTitle}>Route</Text>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeLine} />
            {/* Pickup */}
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#0040e0' }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeAddr}>{order.pickup_address}</Text>
              </View>
            </View>
            {/* Drop-off */}
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#401600' }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeAddr}>{order.dropoff_address}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Package card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="cube-outline" size={18} color="#0040e0" />
            </View>
            <Text style={styles.cardTitle}>Package</Text>
          </View>
          <View style={styles.specGrid}>
            <SpecItem label="Size" value={order.package_size.charAt(0).toUpperCase() + order.package_size.slice(1)} />
            <SpecItem label="Category" value={order.category?.name ?? '—'} />
            {order.distance_km && <SpecItem label="Distance" value={`${order.distance_km} km`} />}
          </View>
          {order.package_description && (
            <Text style={styles.packageDesc}>{order.package_description}</Text>
          )}
          {order.package_notes && (
            <View style={styles.instructionsBox}>
              <Ionicons name="information-circle-outline" size={14} color="#0040e0" />
              <Text style={styles.instructionsText}>{order.package_notes}</Text>
            </View>
          )}
        </View>

        {/* Earnings breakdown */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="wallet-outline" size={18} color="#0040e0" />
            </View>
            <Text style={styles.cardTitle}>Earnings</Text>
          </View>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Order price</Text>
            <Text style={styles.earningsValue}>₦{earningsBreakdown.gross.toLocaleString()}</Text>
          </View>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Platform commission</Text>
            <Text style={styles.earningsValue}>₦{earningsBreakdown.commission.toLocaleString()}</Text>
          </View>
          <View style={[styles.earningsRow, styles.earningsDivider]}>
            <Text style={styles.earningsLabelTotal}>Estimated take-home</Text>
            <Text style={styles.earningsTotal}>₦{estimatedNet.toLocaleString()}</Text>
          </View>
          <Text style={styles.earningsNote}>
            This preview uses the order&apos;s saved commission values so you can judge the job before bidding.
          </Text>
        </View>
      </ScrollView>

      {/* Footer actions */}
      {isAvailable && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.counterBtn} onPress={handleCounterOffer}>
            <Text style={styles.counterBtnText}>Counter-Offer</Text>
          </Pressable>
          <Pressable
            style={[styles.acceptBtn, accepting && styles.acceptBtnDisabled]}
            onPress={handleAccept}
            disabled={accepting}
          >
            {accepting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept for {formatPrice(order.suggested_price, order.dynamic_price)}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SpecItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={specStyles.item}>
      <Text style={specStyles.label}>{label}</Text>
      <Text style={[specStyles.value, highlight && specStyles.highlight]}>{value}</Text>
    </View>
  );
}

const specStyles = StyleSheet.create({
  item: { flex: 1, minWidth: '45%', backgroundColor: '#F1F4F6', borderRadius: 14, padding: 12, gap: 2 },
  label: { fontSize: 10, fontWeight: '700', color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  highlight: { color: '#ba1a1a' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  center: { alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: Typography.md, fontWeight: '700', color: '#000D22' },

  scroll: { paddingHorizontal: Spacing[5], paddingTop: 20, paddingBottom: 24, gap: 16 },

  expiredBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFDAD6', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  expiredText: { fontSize: Typography.xs, fontWeight: '600', color: '#ba1a1a', flex: 1 },

  feasibilityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  feasibilityIcon: { fontSize: 14 },
  feasibilityText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },

  // Hero card
  heroCard: {
    backgroundColor: '#0A2342', borderRadius: 20,
    padding: 20, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  heroLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(168,196,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  heroPrice: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
  heroDivider: { width: 1, height: 40, backgroundColor: 'rgba(168,196,255,0.2)', marginHorizontal: 20 },
  heroRight: {},
  heroTime: { fontSize: Typography.sm, fontWeight: '600', color: 'rgba(168,196,255,0.9)' },

  // Cards
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, gap: 12,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },

  // Route
  routeContainer: { gap: 16, paddingLeft: 8 },
  routeLine: {
    position: 'absolute', left: 17, top: 50, bottom: 22,
    width: 1, borderWidth: 1, borderColor: '#C4C6CF', borderStyle: 'dashed',
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 4, borderColor: '#FFFFFF', marginTop: 2, flexShrink: 0 },
  routeTextBlock: { flex: 1, gap: 2 },
  routeLabel: { fontSize: 10, fontWeight: '700', color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddr: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },

  // Package
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  packageDesc: { fontSize: Typography.xs, color: '#44474e', lineHeight: 18 },
  instructionsBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 10,
  },
  instructionsText: { flex: 1, fontSize: Typography.xs, color: '#000D22', lineHeight: 18 },

  // Earnings
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsLabel: { fontSize: Typography.xs, color: '#74777e' },
  earningsValue: { fontSize: Typography.sm, fontWeight: '600', color: '#000D22' },
  earningsDivider: { borderTopWidth: 1, borderTopColor: '#F1F4F6', paddingTop: 10, marginTop: 4 },
  earningsLabelTotal: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  earningsTotal: { fontSize: Typography.md, fontWeight: '800', color: '#0040e0' },
  earningsNote: { fontSize: 11, color: '#74777e', lineHeight: 16 },

  // Footer
  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
  },
  counterBtn: {
    flex: 1, height: 54, borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#0040e0',
  },
  counterBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#0040e0' },
  acceptBtn: {
    flex: 2, height: 54, borderRadius: 16,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' },
});
