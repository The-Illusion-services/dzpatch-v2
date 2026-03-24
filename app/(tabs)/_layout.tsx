import { Tabs } from 'expo-router';

// Placeholder — full tab bar built in Sprint 2 (customer home screens)
export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" />
    </Tabs>
  );
}
