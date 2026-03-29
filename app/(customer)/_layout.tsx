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

// Screens where a bid alert would be redundant (customer is already in the flow)
const BID_FLOW_SCREENS = [
  '/(customer)/finding-rider',
  '/(customer)/live-bidding',
  '/(customer)/counter-offer',
  '/(customer)/waiting-response',
  '/(customer)/active-order-tracking',
];

function useBidAlerts() {
  const { profile } = useAuthStore();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

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

      for (const order of orders) {
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
          const bid = payload.new as { order_id: string; status: string };
          if (bid.status !== 'pending') return;

          // Verify this bid is on one of the customer's orders
          const { data: order } = await supabase
            .from('orders')
            .select('id')
            .eq('id', bid.order_id)
            .eq('customer_id', profile.id)
            .eq('status', 'pending')
            .maybeSingle();

          if (!order) return;

          const inFlow = BID_FLOW_SCREENS.some((s) => pathnameRef.current.startsWith(s));
          if (inFlow) return; // Already on a bid screen — no alert needed

          Alert.alert(
            '🛵 New Rider Offer',
            'A rider has placed a bid on your order.',
            [
              { text: 'View Offers', onPress: () => router.push({ pathname: '/(customer)/live-bidding', params: { orderId: order.id } } as any) },
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
  const pathname = usePathname();
  const [activeNegotiation, setActiveNegotiation] = useState<{ orderId: string; bidCount: number } | null>(null);

  const inBidFlow = BID_FLOW_SCREENS.some((s) => pathname.startsWith(s));

  useEffect(() => {
    if (!profile?.id) return;

    const checkBids = async () => {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', profile.id)
        .eq('status', 'pending')
        .limit(5);

      if (!orders || orders.length === 0) { setActiveNegotiation(null); return; }

      for (const order of orders) {
        const { count } = await supabase
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', order.id)
          .eq('status', 'pending');

        if (count && count > 0) {
          setActiveNegotiation({ orderId: order.id, bidCount: count });
          return;
        }
      }
      setActiveNegotiation(null);
    };

    checkBids();

    const channel = supabase
      .channel(`negotiation-banner:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => checkBids())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids' }, () => checkBids())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => checkBids())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, pathname]);

  return { activeNegotiation, showBanner: !!activeNegotiation && !inBidFlow };
}

function NegotiationBanner({ orderId, bidCount }: { orderId: string; bidCount: number }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={[styles.negotiationBanner, { top: insets.top + 8 }]}
      onPress={() => router.push({ pathname: '/(customer)/live-bidding', params: { orderId } } as any)}
    >
      <View style={styles.negotiationBannerDot} />
      <Text style={styles.negotiationBannerText}>
        {bidCount} rider offer{bidCount !== 1 ? 's' : ''} waiting — tap to view
      </Text>
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
      <NegotiationBanner
        orderId={activeNegotiation.orderId}
        bidCount={activeNegotiation.bidCount}
      />
    )}
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
