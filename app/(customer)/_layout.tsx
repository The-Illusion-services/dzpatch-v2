import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

type TabIconProps = {
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
  focusedName: keyof typeof Ionicons.glyphMap;
};

function TabItem({ focused, name, focusedName }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={focused ? focusedName : name}
        size={26}
        color={focused ? '#0040e0' : '#9ea2ac'}
      />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function CustomerLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { paddingBottom: insets.bottom + 6 }],
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
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
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
    backgroundColor: '#0040e0',
  },
});
