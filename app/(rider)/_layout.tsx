import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

export default function RiderLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { colors, isDark } = useTheme();

  // In dev bypass mode, skip the KYC gate — no real profile exists
  const isDevBypass = __DEV__ && process.env.EXPO_PUBLIC_DEV_ROLE === 'rider';

  // If rider not approved yet, keep them in pending
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
