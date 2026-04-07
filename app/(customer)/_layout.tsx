import { Tabs, router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { useTheme } from '@/hooks/use-theme';

type TabIconProps = {
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
  focusedName: keyof typeof Ionicons.glyphMap;
};

function TabItem({ focused, name, focusedName }: TabIconProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={focused ? focusedName : name}
        size={26}
        color={focused ? colors.tabActive : colors.tabInactive}
      />
      {focused && <View style={[styles.activeDot, { backgroundColor: colors.tabActive }]} />}
    </View>
  );
}

type NegotiationBannerState = {
  orderId: string;
  bidCount: number;
  orderStatus: string;
  negotiationRound: number;
  latestBidId: string | null;
  latestBidAmount: number | null;
  latestBidRiderName: string | null;
  latestBidRiderId: string | null;
  parentBidAmount: number | null;
};

// Screens where a bid alert or banner would be redundant (customer is already in the flow)
const BID_FLOW_SCREENS = [
  '/finding-rider',
  '/live-bidding',
  '/counter-offer',
  '/waiting-response',
  '/active-order-tracking',
  '/booking-success',
  '/delivery-success',
  '/driver-rating',
];

function normalizeCustomerPath(pathname: string) {
  return pathname.replace('/(customer)', '') || '/';
}

// riderMadeLastMove = latest pending bid has parent_bid_id (rider replied to customer counter)
// !riderMadeLastMove + pendingBids.length === 0 = customer just sent counter, waiting for rider
// !riderMadeLastMove + pendingBids.length > 0 = fresh rider bid(s), no negotiation yet
async function fetchActiveNegotiation(profileId: string): Promise<NegotiationBannerState | null> {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status')
    .eq('customer_id', profileId)
    .in('status', ['pending', 'matched'])
    .limit(5);

  if (!orders || orders.length === 0) return null;

  for (const order of orders as any[]) {
    if (order.status === 'matched') {
      return {
        orderId: order.id,
        bidCount: 0,
        orderStatus: 'matched',
        negotiationRound: 0,
        latestBidId: null,
        latestBidAmount: null,
        latestBidRiderName: null,
        latestBidRiderId: null,
        parentBidAmount: null,
      };
    }

    // Fetch all pending bids for this order, newest first
    const { data: pendingBids } = await supabase
      .from('bids')
      .select(`
        id,
        amount,
        negotiation_round,
        parent_bid_id,
        rider_id,
        riders:rider_id(
          profiles(full_name)
        )
      `)
      .eq('order_id', order.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    // Also check if there are any 'countered' bids — means customer sent a counter
    // and the order is in mid-negotiation (no fresh pending bid from rider yet)
    const { data: counteredBids } = await supabase
      .from('bids')
      .select('id, amount, negotiation_round, rider_id, riders:rider_id(profiles(full_name))')
      .eq('order_id', order.id)
      .eq('status', 'countered')
      .order('created_at', { ascending: false })
      .limit(1);

    // Case 1: Rider replied to customer counter — pending bid with parent_bid_id
    if (pendingBids && pendingBids.length > 0) {
      const latestBid = pendingBids[0] as any;
      // If latest pending bid has a parent_bid_id, the rider countered back
      if (latestBid.parent_bid_id && latestBid.negotiation_round % 2 !== 0) {
        const { data: parentBid } = await supabase
          .from('bids')
          .select('amount')
          .eq('id', latestBid.parent_bid_id)
          .maybeSingle();
        return {
          orderId: order.id,
          bidCount: pendingBids.length,
          orderStatus: order.status,
          negotiationRound: latestBid.negotiation_round ?? 1,
          latestBidId: latestBid.id,
          latestBidAmount: latestBid.amount,
          latestBidRiderName: latestBid.riders?.profiles?.full_name ?? null,
          latestBidRiderId: latestBid.rider_id ?? null,
          parentBidAmount: (parentBid as any)?.amount ?? null,
        };
      }

      // Fresh bid(s) from rider(s), no negotiation yet
      return {
        orderId: order.id,
        bidCount: pendingBids.length,
        orderStatus: order.status,
        negotiationRound: latestBid.negotiation_round ?? 1,
        latestBidId: latestBid.id,
        latestBidAmount: latestBid.amount,
        latestBidRiderName: latestBid.riders?.profiles?.full_name ?? null,
        latestBidRiderId: latestBid.rider_id ?? null,
        parentBidAmount: null,
      };
    }

    // Case 2: No pending bids but there are countered bids = customer sent counter, waiting for rider
    if (counteredBids && counteredBids.length > 0) {
      const counteredBid = counteredBids[0] as any;
      return {
        orderId: order.id,
        bidCount: 0,
        orderStatus: order.status,
        // negotiationRound > 1 signals "customer already countered"
        negotiationRound: (counteredBid.negotiation_round ?? 1) + 1,
        latestBidId: null,
        latestBidAmount: counteredBid.amount,
        latestBidRiderName: counteredBid.riders?.profiles?.full_name ?? null,
        latestBidRiderId: counteredBid.rider_id ?? null,
        parentBidAmount: null,
      };
    }
  }

  return null;
}

function useBidAlerts() {
  const { profile } = useAuthStore();
  const pathname = usePathname();
  const normalizedPathname = normalizeCustomerPath(pathname);
  const pathnameRef = useRef(normalizedPathname);
  pathnameRef.current = normalizedPathname;

  useEffect(() => {
    if (!profile?.id) return;

    // On mount: check if there's already a pending order with bids waiting
    const checkExisting = async () => {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', profile.id)
        .eq('status', 'pending')
        .limit(5);

      if (!orders || orders.length === 0) return;

      for (const order of orders as any[]) {
        const { count } = await supabase
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', order.id)
          .eq('status', 'pending');

        if (count && count > 0) {
          const inFlow = BID_FLOW_SCREENS.some((s) => pathnameRef.current.startsWith(s));
          if (!inFlow) {
            Alert.alert(
              '🛵 Rider Offer Waiting',
              'A rider has placed a bid on your order.',
              [
                { text: 'View Offers', onPress: () => router.push({ pathname: '/(customer)/live-bidding', params: { orderId: order.id } } as any) },
                { text: 'Later', style: 'cancel' },
              ]
            );
          }
          return; // Alert once max
        }
      }
    };
    checkExisting();

    // Realtime: watch for new bids on this customer's pending orders
    const channel = supabase
      .channel(`customer-bid-alerts:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids' },
        async (payload) => {
          const bid = payload.new as any;
          if (bid.status !== 'pending') return;
          if (bid.negotiation_round % 2 === 0) return; // Ignore customer's own outgoing counter-offers

          // Verify this bid is on one of the customer's orders
          const { data: order } = await supabase
            .from('orders')
            .select('id')
            .eq('id', bid.order_id)
            .eq('customer_id', profile.id)
            .eq('status', 'pending')
            .maybeSingle();

          const ownedOrder = order as any;
          if (!ownedOrder) return;

          const inFlow = BID_FLOW_SCREENS.some((s) => pathnameRef.current.startsWith(s));
          if (inFlow) return; // Already on a bid screen — no alert needed

          Alert.alert(
            '🛵 New Rider Offer',
            'A rider has placed a bid on your order.',
            [
              { text: 'View Offers', onPress: () => router.push({ pathname: '/(customer)/live-bidding', params: { orderId: ownedOrder.id } } as any) },
              { text: 'Later', style: 'cancel' },
            ]
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);
}

// ── Persistent negotiation banner ──────────────────────────────────────────

function useNegotiationBanner() {
  const { profile } = useAuthStore();
  const [activeNegotiation, setActiveNegotiation] = useState<NegotiationBannerState | null>(null);

  // Channel effect — only depends on profile.id, never re-runs on navigation
  useEffect(() => {
    if (!profile?.id) return;

    const checkBids = async () => {
      setActiveNegotiation(await fetchActiveNegotiation(profile.id));
    };

    checkBids();

    const channel = supabase
      .channel(`negotiation-banner:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => checkBids())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids' }, () => checkBids())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => checkBids())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Re-fetch on navigation — no channel involved, no race condition
  const pathname = usePathname();
  const normalizedPathname = normalizeCustomerPath(pathname);
  useEffect(() => {
    if (!profile?.id) return;
    fetchActiveNegotiation(profile.id).then(setActiveNegotiation);
  }, [normalizedPathname, profile?.id]);

  const inBidFlow = BID_FLOW_SCREENS.some((s) => normalizedPathname.startsWith(s));
  return { activeNegotiation, showBanner: !!activeNegotiation && !inBidFlow };
}

function NegotiationBanner({
  orderId,
  bidCount,
  orderStatus,
  negotiationRound,
  latestBidId,
  latestBidAmount,
  latestBidRiderName,
  latestBidRiderId,
  parentBidAmount,
}: NegotiationBannerState) {
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    if (orderStatus === 'matched') {
      router.push({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
      return;
    }

    // Rider just countered customer's offer → go to counter-offer screen to respond
    if (latestBidId && latestBidAmount != null) {
      router.push({
        pathname: '/(customer)/counter-offer',
        params: {
          orderId,
          bidId: latestBidId,
          riderId: latestBidRiderId ?? '',
          riderName: latestBidRiderName ?? 'Rider',
          bidAmount: String(latestBidAmount),
          negotiationRound: String(negotiationRound),
        },
      } as any);
      return;
    }

    // Customer already countered, no pending bid from rider yet → go to waiting-response
    if (negotiationRound > 1 && !latestBidId && latestBidAmount != null) {
      router.push({
        pathname: '/(customer)/waiting-response',
        params: {
          orderId,
          riderId: latestBidRiderId ?? '',
          riderName: latestBidRiderName ?? 'Rider',
          counterAmount: String(latestBidAmount),
          originalBid: String(parentBidAmount ?? latestBidAmount),
          negotiationRound: String(negotiationRound),
        },
      } as any);
      return;
    }

    // Default: fresh bids waiting in live-bidding
    router.push({ pathname: '/(customer)/live-bidding', params: { orderId } } as any);
  };

  const resolvedBannerText = orderStatus === 'matched'
    ? 'Rider matched — tap to track'
    : (latestBidId != null)
      ? negotiationRound > 1
        ? 'Rider countered — tap to respond'
        : `${bidCount} rider offer${bidCount !== 1 ? 's' : ''} waiting — tap to view`
      : negotiationRound > 1
        ? 'Waiting for rider response — tap to view'
        : `${bidCount} rider offer${bidCount !== 1 ? 's' : ''} waiting — tap to view`;

  return (
    <Pressable
      style={[styles.negotiationBanner, { top: insets.top + 8 }]}
      onPress={handlePress}
    >
      <View style={styles.negotiationBannerDot} />
      <Text style={styles.negotiationBannerText}>{resolvedBannerText}</Text>
      <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
    </Pressable>
  );
}

export default function CustomerLayout() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  useBidAlerts();
  const { activeNegotiation, showBanner } = useNegotiationBanner();

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.tabBackground,
            borderTopColor: isDark ? colors.border : '#f1f5f9',
            paddingBottom: insets.bottom + 6,
          },
        ],
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} name="home-outline" focusedName="home" />
          ),
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} name="bicycle-outline" focusedName="bicycle" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} name="person-outline" focusedName="person" />
          ),
        }}
      />

      {/* Wallet — accessible via profile menu, not a tab */}
      <Tabs.Screen name="wallet" options={{ href: null }} />

      {/* Non-tab screens — hidden from tab bar */}
      <Tabs.Screen name="create-order" options={{ href: null }} />
      <Tabs.Screen name="order-tracking" options={{ href: null }} />
      <Tabs.Screen name="saved-addresses" options={{ href: null }} />
      <Tabs.Screen name="add-address" options={{ href: null }} />
      <Tabs.Screen name="finding-rider" options={{ href: null }} />
      <Tabs.Screen name="live-bidding" options={{ href: null }} />
      <Tabs.Screen name="counter-offer" options={{ href: null }} />
      <Tabs.Screen name="waiting-response" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="active-order-tracking" options={{ href: null }} />
      <Tabs.Screen name="cancel-order-modal" options={{ href: null }} />
      <Tabs.Screen name="booking-success" options={{ href: null }} />
      <Tabs.Screen name="delivery-success" options={{ href: null }} />
      <Tabs.Screen name="driver-rating" options={{ href: null }} />
      <Tabs.Screen name="fund-wallet" options={{ href: null }} />
      <Tabs.Screen name="withdraw" options={{ href: null }} />
      <Tabs.Screen name="order-history" options={{ href: null }} />
      <Tabs.Screen name="order-details" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>

    {/* Persistent negotiation banner — floats above all screens when bids are waiting */}
    {showBanner && activeNegotiation && (
      <NegotiationBanner {...activeNegotiation} />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingTop: 10,
    height: 70,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 10,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // Negotiation banner
  negotiationBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0040e0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  negotiationBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    opacity: 0.9,
  },
  negotiationBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
