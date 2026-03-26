import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
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

type OrderFilter = 'all' | 'active' | 'completed' | 'cancelled';

type Order = {
  id: string;
  status: string;
  final_price: number | null;
  base_price: number;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  package_category: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['pending', 'matched', 'pickup_en_route', 'arrived_pickup', 'in_transit', 'arrived_dropoff'];
const COMPLETED_STATUSES = ['delivered', 'completed'];
const CANCELLED_STATUSES = ['cancelled'];

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':          return 'Finding Rider';
    case 'matched':          return 'Rider Assigned';
    case 'pickup_en_route':  return 'Heading to Pickup';
    case 'arrived_pickup':   return 'At Pickup';
    case 'in_transit':       return 'In Transit';
    case 'arrived_dropoff':  return 'At Dropoff';
    case 'delivered':
    case 'completed':        return 'Delivered';
    case 'cancelled':        return 'Cancelled';
    default:                 return status;
  }
}

function statusColor(status: string): string {
  if (COMPLETED_STATUSES.includes(status)) return '#16A34A';
  if (CANCELLED_STATUSES.includes(status)) return '#ba1a1a';
  if (ACTIVE_STATUSES.includes(status)) return '#0040e0';
  return '#74777e';
}

function statusBg(status: string): string {
  if (COMPLETED_STATUSES.includes(status)) return '#dcfce7';
  if (CANCELLED_STATUSES.includes(status)) return '#ffdad6';
  if (ACTIVE_STATUSES.includes(status)) return '#dde1ff';
  return '#F1F4F6';
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function shortAddress(addr: string): string {
  return addr.split(',')[0] ?? addr;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrderHistoryScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('orders')
      .select('id, status, final_price, base_price, pickup_address, dropoff_address, created_at, package_category')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setOrders(data as Order[]);
  }, [profile?.id]);

  useEffect(() => {
    fetchOrders().finally(() => setLoading(false));
  }, [profile?.id, fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const filtered = useMemo(
    () => orders.filter((o) => {
      switch (filter) {
        case 'active':    return ACTIVE_STATUSES.includes(o.status);
        case 'completed': return COMPLETED_STATUSES.includes(o.status);
        case 'cancelled': return CANCELLED_STATUSES.includes(o.status);
        default:          return true;
      }
    }),
    [orders, filter]
  );

  const FILTERS: { key: OrderFilter; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'active',    label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/profile' as any)} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Order History</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0040e0" />}
        ListHeaderComponent={() => (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: Spacing[5], gap: 10 }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptyBody}>Your delivery history will appear here.</Text>
              <Pressable style={styles.newOrderBtn} onPress={() => router.push('/(customer)/create-order' as any)}>
                <Text style={styles.newOrderBtnText}>Send a Package</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => {
          const color = statusColor(item.status);
          const bg = statusBg(item.status);
          const isActive = ACTIVE_STATUSES.includes(item.status);
          const price = item.final_price ?? item.base_price;

          return (
            <Pressable
              style={[styles.orderCard, isActive && styles.orderCardActive]}
              onPress={() => router.push({
                pathname: '/(customer)/order-details',
                params: { orderId: item.id },
              } as any)}
            >
              {isActive && <View style={styles.activeAccent} />}

              {/* Top row */}
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.orderId}>#{item.id.slice(-6).toUpperCase()}</Text>
                  <Text style={styles.orderDate}>{formatRelativeDate(item.created_at)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: bg }]}>
                  <Text style={[styles.statusText, { color }]}>{statusLabel(item.status)}</Text>
                </View>
              </View>

              {/* Route */}
              <View style={styles.routeRow}>
                <View style={styles.routeLine}>
                  <View style={[styles.routeDotPickup]} />
                  <View style={styles.routeConnector} />
                  <View style={[styles.routeDotDropoff]} />
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View>
                    <Text style={styles.routeLabel}>FROM</Text>
                    <Text style={styles.routeAddr} numberOfLines={1}>{shortAddress(item.pickup_address)}</Text>
                  </View>
                  <View>
                    <Text style={styles.routeLabel}>TO</Text>
                    <Text style={styles.routeAddr} numberOfLines={1}>{shortAddress(item.dropoff_address)}</Text>
                  </View>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.priceAmount}>₦{Number(price).toLocaleString()}</Text>
                  {item.package_category && (
                    <Text style={styles.packageType}>{item.package_category}</Text>
                  )}
                </View>
              </View>

              {/* Active CTA */}
              {isActive && (
                <View style={styles.trackCta}>
                  <Text style={styles.trackCtaText}>Track Order →</Text>
                </View>
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
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

  listContent: { paddingTop: 4 },

  filterRow: { paddingHorizontal: Spacing[5], paddingVertical: 14, gap: 10 },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EBEEf0',
  },
  filterChipActive: { backgroundColor: '#000D22' },
  filterChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#44474e' },
  filterChipTextActive: { color: '#FFFFFF' },

  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: Spacing[5],
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  orderCardActive: {
    borderWidth: 1,
    borderColor: 'rgba(0,64,224,0.15)',
  },
  activeAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#0040e0',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  orderId: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: '#000D22' },
  orderDate: { fontSize: Typography.xs, color: '#74777e', marginTop: 2 },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: Typography.bold, letterSpacing: 0.3 },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeLine: { alignItems: 'center', width: 12, gap: 0 },
  routeDotPickup: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: '#0040e0', backgroundColor: '#FFFFFF',
  },
  routeConnector: { width: 2, height: 20, backgroundColor: '#dde1ff' },
  routeDotDropoff: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#0040e0',
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  routeAddr: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#000D22' },

  priceCol: { alignItems: 'flex-end', gap: 4 },
  priceAmount: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#000D22' },
  packageType: {
    fontSize: 10,
    fontWeight: Typography.semibold,
    color: '#74777e',
    textTransform: 'capitalize',
  },

  trackCta: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F4F6',
    alignItems: 'flex-end',
  },
  trackCtaText: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: '#0040e0' },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8, paddingHorizontal: Spacing[5] },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22' },
  emptyBody: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center' },
  newOrderBtn: {
    marginTop: 8,
    backgroundColor: '#0040e0',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  newOrderBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },
});
