import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
import { Avatar, Card, SkeletonCard, StatusBadge } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { Order } from '@/types/database';

export default function HomeScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActiveOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', profile?.id ?? '')
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(5);
    setActiveOrders(data ?? []);
  };

  useEffect(() => {
    fetchActiveOrders().finally(() => setLoading(false));
  }, [profile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchActiveOrders();
    setRefreshing(false);
  };

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back, {firstName}</Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationDot}>📍</Text>
            <Text style={styles.locationText}>Nigeria</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/profile' as any)}>
          <Avatar name={profile?.full_name ?? ''} uri={profile?.avatar_url} size="md" />
        </Pressable>
      </View>

      {/* Hero card */}
      <View style={styles.heroCard}>
        {/* Dot pattern overlay */}
        <View style={styles.heroDots} />
        <View style={styles.heroContent}>
          <View style={styles.heroIconWrap}>
            <Text style={styles.heroIcon}>📦</Text>
          </View>
          <Text style={styles.heroTitle}>Ready to move?</Text>
          <Text style={styles.heroSubtitle}>Professional delivery logistics at your fingertips.</Text>
        </View>
      </View>

      {/* Send a Package CTA */}
      <Pressable
        style={({ pressed }) => [styles.ctaCard, pressed && styles.ctaCardPressed]}
        onPress={() => router.push('/(customer)/create-order' as any)}
      >
        <View style={styles.ctaLeft}>
          <View style={styles.ctaIconWrap}>
            <Text style={styles.ctaIcon}>➤</Text>
          </View>
          <View>
            <Text style={styles.ctaTitle}>Send a Package</Text>
            <Text style={styles.ctaSubtitle}>Instant pick-up anywhere</Text>
          </View>
        </View>
        <View style={styles.ctaArrow}>
          <Text style={styles.ctaArrowText}>→</Text>
        </View>
      </Pressable>

      {/* Active Deliveries */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Deliveries</Text>
          <Pressable onPress={() => router.push('/deliveries' as any)} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard style={{ marginTop: 12 }} />
          </>
        ) : activeOrders.length === 0 ? (
          <Card variant="flat" style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>No active deliveries</Text>
            <Text style={styles.emptyBody}>Send your first package to get started.</Text>
          </Card>
        ) : (
          activeOrders.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => router.push({ pathname: '/(customer)/order-tracking', params: { orderId: order.id } } as any)}
            >
              <ActiveOrderCard order={order} />
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function ActiveOrderCard({ order }: { order: Order }) {
  const progressMap: Record<string, number> = {
    pending: 0.1,
    matched: 0.25,
    pickup_en_route: 0.4,
    arrived_pickup: 0.55,
    in_transit: 0.7,
    arrived_dropoff: 0.85,
    delivered: 1,
  };
  const progress = progressMap[order.status] ?? 0;

  return (
    <Card style={styles.orderCard}>
      {/* Status + ID */}
      <View style={styles.orderTop}>
        <View>
          <StatusBadge status={order.status} />
          <Text style={styles.orderId}>Order #{order.id.slice(-5).toUpperCase()}</Text>
        </View>
        {order.final_price && (
          <View style={styles.priceWrap}>
            <Text style={styles.orderPrice}>₦{Number(order.final_price).toLocaleString()}</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>
      <View style={styles.progressIcons}>
        <Text>🏪</Text>
        <Text>🚴</Text>
        <Text>🏠</Text>
      </View>

      {/* Addresses */}
      <View style={styles.addresses}>
        <View style={styles.addressRow}>
          <View style={styles.dotPickup} />
          <View>
            <Text style={styles.addressLabel}>PICK-UP</Text>
            <Text style={styles.addressText} numberOfLines={1}>{order.pickup_address}</Text>
          </View>
        </View>
        <View style={[styles.addressRow, { marginTop: 12 }]}>
          <View style={styles.dotDropoff} />
          <View>
            <Text style={styles.addressLabel}>DROP-OFF</Text>
            <Text style={styles.addressText} numberOfLines={1}>{order.dropoff_address}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 120,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  greeting: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  locationDot: {
    fontSize: 13,
  },
  locationText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#0040e0',
  },
  heroCard: {
    backgroundColor: '#0A2342',
    borderRadius: 28,
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    shadowColor: '#0A2342',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  heroDots: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  heroContent: {
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 112,
    height: 112,
    borderRadius: 20,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  heroIcon: {
    fontSize: 52,
  },
  heroTitle: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: Typography.sm,
    color: 'rgba(118,139,175,0.9)',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
    fontWeight: Typography.medium,
  },
  ctaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  ctaCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  ctaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ctaIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#dde1ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIcon: {
    fontSize: 20,
    color: '#0040e0',
  },
  ctaTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  ctaSubtitle: {
    fontSize: Typography.sm,
    color: '#44474e',
    marginTop: 2,
  },
  ctaArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c4c6cf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrowText: {
    fontSize: 18,
    color: '#000D22',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#0040e0',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
    backgroundColor: '#F1F4F6',
  },
  emptyIcon: {
    fontSize: 40,
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
  orderCard: {
    gap: 16,
    backgroundColor: '#F1F4F6',
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderId: {
    fontSize: Typography.xs,
    color: '#44474e',
    fontWeight: Typography.medium,
    marginTop: 4,
  },
  priceWrap: {},
  orderPrice: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(196,198,207,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0040e0',
    borderRadius: 2,
  },
  progressIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  addresses: {
    gap: 0,
    paddingTop: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dotPickup: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#0040e0',
    backgroundColor: '#FFFFFF',
    marginTop: 5,
  },
  dotDropoff: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0040e0',
    marginTop: 5,
  },
  addressLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  addressText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#000D22',
    marginTop: 1,
  },
});
