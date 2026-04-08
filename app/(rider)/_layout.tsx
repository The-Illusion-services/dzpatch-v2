import { Redirect, Tabs, router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

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

// Screens where job/counter alerts are redundant (rider already in the flow)
const ACTIVE_FLOW_SCREENS = [
  '/(rider)/waiting-for-customer',
  '/(rider)/counter-offer',
  '/(rider)/navigate-to-pickup',
  '/(rider)/confirm-arrival',
  '/(rider)/navigate-to-dropoff',
  '/(rider)/delivery-completion',
  '/(rider)/trip-complete',
];

function useRiderAlerts() {
  const { riderId } = useAuthStore();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!riderId) return;
    // Only create one channel per riderId — guard against double-mount / StrictMode
    if (channelRef.current) return;

    const channel = supabase
      .channel(`rider-alerts:${riderId}`)
      // Watch for order status becoming 'matched' with this rider — bid was accepted
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `rider_id=eq.${riderId}`,
      }, (payload) => {
        const order = payload.new as { id: string; status: string };
        if (order.status !== 'matched') return;
        const inFlow = ACTIVE_FLOW_SCREENS.some((s) => pathnameRef.current.startsWith(s));
        if (inFlow) return;
        Alert.alert(
          '✅ Bid Accepted!',
          'Your bid was accepted. Head to the pickup location.',
          [{ text: 'Go to Order', onPress: () => router.replace({ pathname: '/(rider)/navigate-to-pickup' as any, params: { orderId: order.id } }) }],
          { cancelable: false }
        );
      })
      // Watch for new counter-offer bids inserted for this rider
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'bids',
      }, async (payload) => {
        const bid = payload.new as { id: string; order_id: string; rider_id: string; status: string; amount: number };
        if (bid.rider_id !== riderId || bid.status !== 'pending') return;

        // Only alert if there's a countered bid from this rider on the same order
        // (meaning this insert is a customer counter, not a fresh rider bid)
        const { data: bids } = await supabase
          .from('bids')
          .select('id, status, amount')
          .eq('order_id', bid.order_id)
          .eq('rider_id', riderId)
          .order('created_at', { ascending: false })
          .limit(3);

        const counteredBid = (bids as any[] ?? []).find((b: any) => b.status === 'countered');
        if (!counteredBid) return; // Not a counter-offer, just a fresh bid

        const inFlow = ACTIVE_FLOW_SCREENS.some((s) => pathnameRef.current.startsWith(s));
        if (inFlow) return;

        Alert.alert(
          '💬 Customer Counter-Offer',
          `Customer offered ₦${Number(bid.amount).toLocaleString()}. Tap to respond.`,
          [
            {
              text: 'Respond',
              onPress: () => router.replace({
                pathname: '/(rider)/counter-offer' as any,
                params: {
                  orderId: bid.order_id,
                  originalBidId: counteredBid.id,
                  counterBidId: bid.id,
                  customerCounterAmount: String(bid.amount),
                  myOriginalAmount: String(counteredBid.amount),
                },
              }),
            },
            { text: 'Later', style: 'cancel' },
          ]
        );
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [riderId]);
}

export default function RiderLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { colors, isDark } = useTheme();
  useRiderAlerts();

  // In dev bypass mode, skip the KYC gate — no real profile exists
  const isDevBypass = __DEV__ && process.env.EXPO_PUBLIC_DEV_ROLE === 'rider';

  // Not logged in at all — send to auth
  if (!isDevBypass && !profile) {
    return <Redirect href={'/(rider-auth)/splash' as any} />;
  }

  // Logged in but not yet approved — hold in pending
  if (!isDevBypass && profile?.kyc_status !== 'approved') {
    return <Redirect href={'/(rider-auth)/pending-approval' as any} />;
  }

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
            <TabItem focused={focused} name="map-outline" focusedName="map" />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} name="wallet-outline" focusedName="wallet" />
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
      {/* Non-tab screens — hidden from bottom bar */}
      <Tabs.Screen name="job-details" options={{ href: null }} />
      <Tabs.Screen name="counter-offer" options={{ href: null }} />
      <Tabs.Screen name="waiting-for-customer" options={{ href: null }} />
      <Tabs.Screen name="bid-declined" options={{ href: null }} />
      <Tabs.Screen name="navigate-to-pickup" options={{ href: null }} />
      <Tabs.Screen name="confirm-arrival" options={{ href: null }} />
      <Tabs.Screen name="navigate-to-dropoff" options={{ href: null }} />
      <Tabs.Screen name="delivery-completion" options={{ href: null }} />
      <Tabs.Screen name="trip-complete" options={{ href: null }} />
      <Tabs.Screen name="rider-withdraw" options={{ href: null }} />
      <Tabs.Screen name="rider-wallet" options={{ href: null }} />
      <Tabs.Screen name="edit-vehicle" options={{ href: null }} />
      <Tabs.Screen name="documents-management" options={{ href: null }} />
      <Tabs.Screen name="bank-account-settings" options={{ href: null }} />
      <Tabs.Screen name="account-locked" options={{ href: null }} />
      <Tabs.Screen name="sos-modal" options={{ href: null }} />
      <Tabs.Screen name="rider-chat" options={{ href: null }} />
    </Tabs>
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
});
