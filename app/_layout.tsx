import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/auth.store';
import { useAppDataStore } from '@/store/app-data.store';
import { usePushNotificationRegistration } from '@/hooks/use-push-notification-registration';

// Keep native splash visible until auth is initialized
SplashScreen.preventAutoHideAsync();
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';
if (!isExpoGo) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // expo-notifications unavailable in this environment — skip
  }
}

// Required by expo-router to set the initial route group
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const { initialize, isInitialized } = useAuthStore();
  usePushNotificationRegistration();

  useEffect(() => {
    initialize();
    useAppDataStore.getState().fetchCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="transparent" translucent />
    </>
  );
}
