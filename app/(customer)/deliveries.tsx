import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Card, SkeletonCard, StatusBadge } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { Order } from '@/types/database';

const FILTERS = ['All', 'Active', 'Completed', 'Cancelled'] as const;
type Filter = typeof FILTERS[number];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'price_high', label: 'Price ↑' },
  { key: 'price_low', label: 'Price ↓' },
] as const;
type SortKey = typeof SORT_OPTIONS[number]['key'];

const ACTIVE_TRACKING_STATUSES = new Set([
  'matched',
  'pickup_en_route',
  'arrived_pickup',
  'in_transit',
  'arrived_dropoff',
]);

export default function DeliveriesScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [showSort, setShowSort] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const fetchOrders = useCallback(async () => {
    let q = supabase
      .from('orders')
      .select('id, status, created_at, pickup_address, dropoff_address, final_price')
      .eq('customer_id', profile?.id ?? '')
      .limit(100);

    if (filter === 'Active') {
      // Exclude terminal statuses AND exclude pending orders past their expiry
      q = q
        .not('status', 'in', '("completed","cancelled")')
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    } else if (filter === 'Completed') {
      q = q.eq('status', 'completed');
    } else if (filter === 'Cancelled') {
      q = q.eq('status', 'cancelled');
    }

    // Sort in DB for date-based sorts
    if (sort === 'newest') q = q.order('created_at', { ascending: false });
    else if (sort === 'oldest') q = q.order('created_at', { ascending: true });
    else q = q.order('created_at', { ascending: false }); // price sort done client-side

    const { data } = await q;
    let result = ((data as any[]) ?? []) as Order[];

    // Client-side price sort
    if (sort === 'price_high') {
      result = [...result].sort((a, b) => (Number(b.final_price) || 0) - (Number(a.final_price) || 0));
    } else if (sort === 'price_low') {
      result = [...result].sort((a, b) => (Number(a.final_price) || 0) - (Number(b.final_price) || 0));
    }

    setOrders(result);
  }, [profile?.id, filter, sort]);

  useEffect(() => {
    setLoading(true);
    fetchOrders().finally(() => setLoading(false));
  }, [profile?.id, filter, sort, fetchOrders]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // Client-side search filter
  const filtered = useMemo(
    () => search.trim()
      ? orders.filter((o) => {
          const q = search.toLowerCase();
          return (
            o.id.slice(-6).toLowerCase().includes(q) ||
            o.pickup_address?.toLowerCase().includes(q) ||
            o.dropoff_address?.toLowerCase().includes(q)
          );
        })
      : orders,
    [orders, search]
  );

  const currentSortLabel = SORT_OPTIONS.find((s) => s.key === sort)?.label ?? 'Sort';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Deliveries</Text>
        <Pressable style={styles.sortBtn} onPress={() => setShowSort((v) => !v)}>
          <Ionicons name="funnel-outline" size={14} color="#0040e0" />
          <Text style={styles.sortBtnText}>{currentSortLabel}</Text>
          <Ionicons name={showSort ? 'chevron-up' : 'chevron-down'} size={12} color="#0040e0" />
        </Pressable>
      </View>

      {/* Sort dropdown */}
      {showSort && (
        <View style={styles.sortDropdown}>
          {SORT_OPTIONS.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.sortOption, sort === s.key && styles.sortOptionActive]}
              onPress={() => { setSort(s.key); setShowSort(false); }}
            >
              <Text style={[styles.sortOptionText, sort === s.key && styles.sortOptionTextActive]}>
                {s.label}
              </Text>
              {sort === s.key && <Ionicons name="checkmark" size={14} color="#0040e0" />}
            </Pressable>
          ))}
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#74777e" />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Search by address or order ID..."
          placeholderTextColor="#9ea2ac"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#9ea2ac" />
          </Pressable>
        )}
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

      {/* Results count */}
      {!loading && (
        <Text style={styles.resultsCount}>
          {filtered.length} order{filtered.length !== 1 ? 's' : ''}
          {search ? ` for "${search}"` : ''}
        </Text>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonCard />
          <SkeletonCard style={{ marginTop: 12 }} />
          <SkeletonCard style={{ marginTop: 12 }} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <Card variant="flat" style={styles.emptyCard}>
              <Ionicons name="bicycle-outline" size={40} color="#C4C6CF" />
              <Text style={styles.emptyTitle}>
                {search ? 'No results found' : 'No deliveries yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {search
                  ? `Try a different search term`
                  : filter === 'All'
                  ? 'Send your first package to get started.'
                  : `No ${filter.toLowerCase()} deliveries.`}
              </Text>
            </Card>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.orderRow}
              onPress={() =>
                router.push({
                  pathname: ACTIVE_TRACKING_STATUSES.has(item.status)
                    ? '/(customer)/active-order-tracking'
                    : '/(customer)/order-tracking',
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
              <Ionicons name="chevron-forward" size={16} color="#c4c6cf" />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: 'rgba(0,64,224,0.15)',
  },
  sortBtnText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#0040e0',
  },

  // Sort dropdown
  sortDropdown: {
    marginHorizontal: Spacing[5],
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 8,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F6',
  },
  sortOptionActive: { backgroundColor: '#F5F8FF' },
  sortOptionText: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#44474e',
  },
  sortOptionTextActive: { color: '#0040e0', fontWeight: Typography.bold },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing[5],
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sm,
    color: '#000D22',
    padding: 0,
  },

  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing[5],
    paddingBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#E0E3E5',
  },
  filterChipActive: { backgroundColor: '#0040e0' },
  filterText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: '#44474e',
  },
  filterTextActive: { color: '#FFFFFF' },

  resultsCount: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 8,
    fontSize: Typography.xs,
    color: '#74777e',
    fontWeight: Typography.medium,
  },

  loadingWrap: { paddingHorizontal: Spacing[5] },
  list: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 120,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
    backgroundColor: '#F1F4F6',
    marginTop: 20,
  },
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
  separator: { height: 10 },
});
