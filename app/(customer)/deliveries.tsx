import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Card, SkeletonCard, StatusBadge } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { Order } from '@/types/database';

const FILTERS = ['All', 'Active', 'Completed', 'Cancelled'] as const;
type Filter = typeof FILTERS[number];

export default function DeliveriesScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');

  const fetchOrders = async () => {
    let q = supabase
      .from('orders')
      .select('*')
      .eq('customer_id', profile?.id ?? '')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter === 'Active') {
      q = q.not('status', 'in', '("completed","cancelled")');
    } else if (filter === 'Completed') {
      q = q.eq('status', 'completed');
    } else if (filter === 'Cancelled') {
      q = q.eq('status', 'cancelled');
    }

    const { data } = await q;
    setOrders(data ?? []);
  };

  useEffect(() => {
    setLoading(true);
    fetchOrders().finally(() => setLoading(false));
  }, [profile?.id, filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Deliveries</Text>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonCard />
          <SkeletonCard style={{ marginTop: 12 }} />
          <SkeletonCard style={{ marginTop: 12 }} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <Card variant="flat" style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No deliveries yet</Text>
              <Text style={styles.emptyBody}>
                {filter === 'All' ? 'Send your first package to get started.' : `No ${filter.toLowerCase()} deliveries.`}
              </Text>
            </Card>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.orderRow}
              onPress={() =>
                router.push({
                  pathname: '/(customer)/order-tracking',
                  params: { orderId: item.id },
                } as any)
              }
            >
              <View style={styles.orderLeft}>
                <StatusBadge status={item.status} />
                <Text style={styles.orderId}>#{item.id.slice(-6).toUpperCase()}</Text>
                <Text style={styles.orderDate}>
                  {new Date(item.created_at).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.orderAddress} numberOfLines={1}>{item.dropoff_address}</Text>
                {item.final_price ? (
                  <Text style={styles.orderPrice}>₦{Number(item.final_price).toLocaleString()}</Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing[5],
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#E0E3E5',
  },
  filterChipActive: {
    backgroundColor: '#0040e0',
  },
  filterText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: '#44474e',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  loadingWrap: {
    paddingHorizontal: Spacing[5],
  },
  list: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 120,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
    backgroundColor: '#F1F4F6',
    marginTop: 20,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  emptyBody: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  orderLeft: {
    gap: 4,
    minWidth: 80,
  },
  orderId: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#000D22',
    marginTop: 4,
  },
  orderDate: {
    fontSize: Typography.xs,
    color: '#74777e',
  },
  orderRight: {
    flex: 1,
    gap: 4,
  },
  orderAddress: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
  },
  orderPrice: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#0040e0',
  },
  chevron: {
    fontSize: 20,
    color: '#c4c6cf',
  },
  separator: {
    height: 10,
  },
});
