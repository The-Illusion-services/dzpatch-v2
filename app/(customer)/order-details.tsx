import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { SkeletonCard } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderDetail = {
  id: string;
  status: string;
  dynamic_price: number;
  final_price: number | null;
  vat_amount: number | null;
  pickup_address: string;
  dropoff_address: string;
  package_category: string | null;
  package_size: string | null;
  package_description: string | null;
  created_at: string;
  delivered_at: string | null;
  rider_id: string | null;
  cancellation_reason: string | null;
  payment_method: string | null;
};

type RiderInfo = {
  full_name: string;
  phone: string;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  average_rating: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'pending',          label: 'Order Placed' },
  { key: 'matched',          label: 'Rider Assigned' },
  { key: 'pickup_en_route',  label: 'Heading to Pickup' },
  { key: 'in_transit',       label: 'In Transit' },
  { key: 'delivered',        label: 'Delivered' },
];

function statusStepIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  if (['arrived_pickup', 'in_transit', 'arrived_dropoff'].includes(status)) return 3;
  if (['delivered', 'completed'].includes(status)) return 4;
  return 0;
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) + ' • ' + new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrderDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile } = useAuthStore();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    const load = async () => {
      try {
        const { data: orderRaw } = await supabase
          .from('orders')
          .select('id, status, dynamic_price, final_price, vat_amount, pickup_address, dropoff_address, category_id, package_size, package_description, created_at, delivered_at, rider_id, payment_method')
          .eq('id', orderId)
          .maybeSingle();

        const baseOrder = orderRaw as {
          id: string;
          status: string;
          dynamic_price: number;
          final_price: number | null;
          vat_amount: number | null;
          pickup_address: string;
          dropoff_address: string;
          category_id: string | null;
          package_size: string | null;
          package_description: string | null;
          created_at: string;
          delivered_at: string | null;
          rider_id: string | null;
          payment_method: string | null;
        } | null;

        if (!baseOrder) {
          setOrder(null);
          setRider(null);
          return;
        }

        const categoryPromise = baseOrder.category_id
          ? supabase
              .from('package_categories')
              .select('name')
              .eq('id', baseOrder.category_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

        const cancellationPromise = baseOrder.status === 'cancelled'
          ? supabase
              .from('cancellations')
              .select('reason')
              .eq('order_id', orderId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

        const [{ data: categoryData }, { data: cancellationData }] = await Promise.all([
          categoryPromise,
          cancellationPromise,
        ]);

        const orderData: OrderDetail = {
          ...baseOrder,
          package_category: (categoryData as { name?: string } | null)?.name ?? baseOrder.package_description ?? null,
          cancellation_reason: (cancellationData as { reason?: string } | null)?.reason ?? null,
        };

        setOrder(orderData);

        if (orderData.rider_id) {
          const { data: riderData } = await supabase
            .from('riders')
            .select('vehicle_type, vehicle_plate, average_rating, profiles(full_name, phone)')
            .eq('id', orderData.rider_id)
            .maybeSingle();

          if (riderData && (riderData as any).profiles) {
            setRider({
              ...(riderData as any).profiles,
              vehicle_type: (riderData as any).vehicle_type,
              vehicle_plate: (riderData as any).vehicle_plate,
              average_rating: (riderData as any).average_rating ?? 0,
            });
          } else {
            setRider(null);
          }
        } else {
          setRider(null);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  const isActive = order && !['delivered', 'completed', 'cancelled'].includes(order.status);
  const isCancelled = order?.status === 'cancelled';
  const price = order?.final_price ?? order?.dynamic_price ?? 0;
  const stepIdx = order ? statusStepIndex(order.status) : 0;

  const handleReportIssue = () => {
    const subjects = ['Wrong delivery', 'Damaged item', 'Payment issue', 'Rider behaviour', 'Other'];
    Alert.alert('Report an Issue', 'What went wrong?', [
      ...subjects.map((subject) => ({
        text: subject,
        onPress: async () => {
          if (!orderId || !profile?.id) return;
          const { error } = await supabase.rpc('raise_dispute', {
            p_order_id: orderId,
            p_subject: subject,
            p_description: `Issue reported from order-details screen. Order: ${orderId}`,
          } as any);
          if (error) {
            Alert.alert('Error', 'Could not submit report. Please try again.');
          } else {
            Alert.alert('Report Submitted', 'Our support team will review your issue within 24 hours.');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/order-history' as any)} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Order Details</Text>
        {order && (
          <View style={styles.orderIdBadge}>
            <Text style={styles.orderIdText}>#{order.id.slice(-6).toUpperCase()}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ padding: Spacing[5], gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : !order ? (
        <View style={styles.errorState}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>Order not found</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        >
          {/* Status banner */}
          <View style={[styles.statusBanner, isCancelled && styles.statusBannerCancelled]}>
            <View style={styles.statusBannerLeft}>
              <Text style={styles.statusBannerIcon}>
                {isCancelled ? '✕' : order.status === 'delivered' || order.status === 'completed' ? '✓' : '●'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusBannerTitle}>
                {isCancelled ? 'Order Cancelled' : order.status === 'delivered' || order.status === 'completed' ? 'Order Delivered' : 'Order In Progress'}
              </Text>
              <Text style={styles.statusBannerSub}>
                {isCancelled
                  ? order.cancellation_reason ?? 'Cancelled by customer'
                  : order.delivered_at
                  ? `Delivered on ${formatFullDate(order.delivered_at)}`
                  : `Placed on ${formatFullDate(order.created_at)}`}
              </Text>
            </View>
          </View>

          {/* Progress timeline (not shown for cancelled) */}
          {!isCancelled && (
            <View style={styles.progressCard}>
              <View style={styles.progressSteps}>
                {STATUS_STEPS.map((step, i) => {
                  const done = i <= stepIdx;
                  const active = i === stepIdx;
                  return (
                    <View key={step.key} style={styles.progressStepWrap}>
                      <View style={[styles.progressDot, done && styles.progressDotDone, active && styles.progressDotActive]}>
                        {done && <Text style={styles.progressCheck}>✓</Text>}
                      </View>
                      {i < STATUS_STEPS.length - 1 && (
                        <View style={[styles.progressBar, done && i < stepIdx && styles.progressBarDone]} />
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={styles.progressLabels}>
                {STATUS_STEPS.map((step, i) => (
                  <Text
                    key={step.key}
                    style={[styles.progressLabel, i <= stepIdx && styles.progressLabelDone]}
                    numberOfLines={2}
                  >
                    {step.label}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Rider card */}
          {rider && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Rider</Text>
              <View style={styles.riderRow}>
                <View style={styles.riderAvatar}>
                  <Text style={styles.riderAvatarText}>{rider.full_name.charAt(0)}</Text>
                  <View style={styles.riderVerifiedDot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.riderName}>{rider.full_name}</Text>
                  {rider.vehicle_plate && (
                    <Text style={styles.riderVehicle}>
                      {rider.vehicle_type ?? 'Motorcycle'} · {rider.vehicle_plate}
                    </Text>
                  )}
                  {typeof rider.average_rating === 'number' && rider.average_rating > 0 && (
                    <Text style={styles.riderRating}>⭐ {Number(rider.average_rating).toFixed(1)}</Text>
                  )}
                </View>
                <View style={styles.riderActions}>
                  <Pressable
                    style={styles.riderCallBtn}
                    onPress={() => Linking.openURL(`tel:${rider.phone}`)}
                  >
                    <Text style={styles.riderCallIcon}>📞</Text>
                    <Text style={styles.riderCallText}>Call</Text>
                  </Pressable>
                  {isActive && (
                    <Pressable
                      style={styles.riderChatBtn}
                      onPress={() => router.push({ pathname: '/(customer)/chat', params: { orderId } } as any)}
                    >
                      <Text style={styles.riderChatIcon}>💬</Text>
                      <Text style={styles.riderChatText}>Chat</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Payment summary */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Delivery Fee</Text>
              <Text style={styles.paymentValue}>₦{Number(order.dynamic_price).toLocaleString()}</Text>
            </View>
            {order.vat_amount != null && order.vat_amount > 0 && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Service Tax</Text>
                <Text style={styles.paymentValue}>₦{Number(order.vat_amount).toLocaleString()}</Text>
              </View>
            )}
            <View style={styles.paymentDivider} />
            <View style={styles.paymentRow}>
              <Text style={styles.paymentTotal}>Total Paid</Text>
              <Text style={styles.paymentTotalValue}>₦{Number(price).toLocaleString()}</Text>
            </View>
            <View style={styles.paymentMethodRow}>
              <Text style={styles.paymentMethodIcon}>{order.payment_method === 'cash' ? '💵' : '💳'}</Text>
              <Text style={styles.paymentMethodText}>
                {order.payment_method === 'cash' ? 'Cash' : 'DZpatch Wallet'}
              </Text>
            </View>
          </View>

          {/* Route */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Route</Text>
            <View style={styles.routeWrap}>
              <View style={styles.routeTimeline}>
                <View style={styles.routeDotPickup} />
                <View style={styles.routeConnector} />
                <View style={styles.routeDotDropoff} />
              </View>
              <View style={{ flex: 1, gap: 16 }}>
                <View>
                  <Text style={styles.routeLabel}>PICK-UP</Text>
                  <Text style={styles.routeAddr}>{order.pickup_address}</Text>
                </View>
                <View>
                  <Text style={styles.routeLabel}>DROP-OFF</Text>
                  <Text style={styles.routeAddr}>{order.dropoff_address}</Text>
                </View>
              </View>
            </View>
            {(order.package_category || order.package_description || order.package_size) && (
              <View style={styles.packageInfo}>
                <Text style={styles.packageInfoText}>
                  📦 {order.package_category ?? order.package_description ?? 'Package'}
                  {order.package_size ? ` · ${order.package_size}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          {isActive && (
            <Pressable
              style={styles.trackBtn}
              onPress={() => router.push({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any)}
            >
              <Text style={styles.trackBtnText}>Track Live</Text>
              <Text style={styles.trackBtnIcon}>📍</Text>
            </Pressable>
          )}

          <Pressable style={styles.disputeBtn} onPress={handleReportIssue}>
            <Text style={styles.disputeBtnText}>Report an Issue</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: Typography.bold },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22', letterSpacing: -0.3 },
  orderIdBadge: {
    backgroundColor: '#dde1ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  orderIdText: { fontSize: 11, fontWeight: Typography.extrabold, color: '#0040e0' },

  scrollContent: { gap: 12, paddingTop: 12 },

  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0a2342',
    marginHorizontal: Spacing[5],
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
  },
  statusBannerCancelled: { backgroundColor: '#ffdad6' },
  statusBannerLeft: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusBannerIcon: { fontSize: 20, color: '#FFFFFF', fontWeight: Typography.extrabold },
  statusBannerTitle: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#FFFFFF', marginBottom: 4 },
  statusBannerSub: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', lineHeight: 17 },

  // Progress
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: Spacing[5],
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  progressSteps: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressStepWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E0E3E5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  progressDotDone: { backgroundColor: '#0040e0' },
  progressDotActive: { backgroundColor: '#0040e0', shadowColor: '#0040e0', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  progressCheck: { fontSize: 10, color: '#FFFFFF', fontWeight: Typography.bold },
  progressBar: { flex: 1, height: 3, backgroundColor: '#E0E3E5', marginHorizontal: 2 },
  progressBarDone: { backgroundColor: '#0040e0' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { flex: 1, fontSize: 9, color: '#74777e', textAlign: 'center', lineHeight: 13 },
  progressLabelDone: { color: '#0040e0', fontWeight: Typography.semibold },

  // Cards
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: Spacing[5],
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },

  // Rider
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  riderAvatarText: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#FFFFFF' },
  riderVerifiedDot: {
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
  riderName: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#000D22' },
  riderVehicle: { fontSize: Typography.xs, color: '#44474e', marginTop: 2 },
  riderRating: { fontSize: Typography.xs, color: '#44474e', marginTop: 2 },
  riderActions: { gap: 8 },
  riderCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dde1ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  riderCallIcon: { fontSize: 14 },
  riderCallText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#0040e0' },
  riderChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  riderChatIcon: { fontSize: 14 },
  riderChatText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#44474e' },

  // Payment
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentLabel: { fontSize: Typography.sm, color: '#44474e' },
  paymentValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#000D22' },
  paymentDivider: { height: 1, backgroundColor: '#F1F4F6' },
  paymentTotal: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  paymentTotalValue: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#0040e0' },
  paymentMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paymentMethodIcon: { fontSize: 14 },
  paymentMethodText: { fontSize: Typography.xs, color: '#74777e' },

  // Route
  routeWrap: { flexDirection: 'row', gap: 14 },
  routeTimeline: { alignItems: 'center', paddingTop: 4, width: 12 },
  routeDotPickup: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: '#0040e0', backgroundColor: '#FFFFFF', flexShrink: 0,
  },
  routeConnector: { width: 2, flex: 1, backgroundColor: '#dde1ff', marginVertical: 4 },
  routeDotDropoff: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#0040e0', flexShrink: 0,
  },
  routeLabel: {
    fontSize: 9, fontWeight: Typography.bold, color: '#74777e',
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3,
  },
  routeAddr: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#000D22', lineHeight: 20 },
  packageInfo: {
    backgroundColor: '#F1F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  packageInfoText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: '#44474e' },

  // Buttons
  trackBtn: {
    marginHorizontal: Spacing[5],
    height: 52,
    backgroundColor: '#0040e0',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  trackBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
  trackBtnIcon: { fontSize: 18 },
  disputeBtn: {
    marginHorizontal: Spacing[5],
    height: 52,
    backgroundColor: '#fff8ed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e66100',
  },
  disputeBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#e66100' },

  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorIcon: { fontSize: 40 },
  errorText: { fontSize: Typography.md, color: '#44474e' },
});
