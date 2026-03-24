import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography } from '@/constants/theme';

type TabIconProps = { focused: boolean; icon: string; label: string };

function TabItem({ focused, icon, label }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function CustomerLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { paddingBottom: insets.bottom + 8 }],
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} icon="⊞" label="Home" />
          ),
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} icon="🚚" label="Deliveries" />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} icon="💳" label="Wallet" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem focused={focused} icon="👤" label="Profile" />
          ),
        }}
      />

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
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    height: 80,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 8,
  },
  tabItem: {
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.4,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.tabInactive,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tabLabelActive: {
    color: Colors.tabActive,
  },
});
