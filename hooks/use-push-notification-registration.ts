import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';

function getExpoProjectId(): string | undefined {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  return typeof projectId === 'string' && projectId.length > 0
    ? projectId
    : undefined;
}

function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

export function usePushNotificationRegistration() {
  const { profile } = useAuthStore();
  const lastRegisteredTokenRef = useRef<string | null>(null);
  const lastRegisteredUserRef = useRef<string | null>(null);
  const loggedExpoGoSkipRef = useRef(false);

  useEffect(() => {
    if (!profile?.id) {
      lastRegisteredTokenRef.current = null;
      lastRegisteredUserRef.current = null;
      return;
    }

    let isActive = true;

    const register = async () => {
      try {
        if (isExpoGo()) {
          if (!loggedExpoGoSkipRef.current) {
            console.warn(
              'push registration skipped in Expo Go: use a development build for remote notifications'
            );
            loggedExpoGoSkipRef.current = true;
          }
          return;
        }

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const currentPermissions = await Notifications.getPermissionsAsync();
        let permissionStatus = currentPermissions.status;

        if (permissionStatus !== 'granted') {
          const requestedPermissions = await Notifications.requestPermissionsAsync();
          permissionStatus = requestedPermissions.status;
        }

        if (permissionStatus !== 'granted') {
          return;
        }

        const projectId = getExpoProjectId();
        if (!projectId) {
          console.warn('push registration skipped: Expo project id is missing');
          return;
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const pushToken = tokenResponse.data;

        if (!isActive || !pushToken) {
          return;
        }

        if (
          lastRegisteredUserRef.current === profile.id &&
          lastRegisteredTokenRef.current === pushToken
        ) {
          return;
        }

        const pushTokenSave = await (supabase as any)
          .from('push_tokens')
          .upsert(
            {
              profile_id: profile.id,
              token: pushToken,
              platform: Platform.OS,
              last_seen: new Date().toISOString(),
            },
            { onConflict: 'profile_id,token' }
          );

        const pushTokensUnavailable = pushTokenSave.error?.code === 'PGRST205';

        if (pushTokenSave.error && !pushTokensUnavailable) {
          console.warn('push registration save failed:', pushTokenSave.error.message);
          return;
        }

        if (pushTokensUnavailable) {
          const legacySave = await supabase
            .from('profiles')
            .update({ push_token: pushToken })
            .eq('id', profile.id);

          if (legacySave.error) {
            console.warn('push registration save failed:', legacySave.error.message);
            return;
          }
        }

        lastRegisteredUserRef.current = profile.id;
        lastRegisteredTokenRef.current = pushToken;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('push registration failed:', message);
      }
    };

    void register();

    return () => {
      isActive = false;
    };
  }, [profile?.id]);
}
