import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { RealtimeChannel } from '@supabase/supabase-js';

type AppStateChannelOptions = {
  onBackground?: () => void | Promise<void>;
  onForeground?: () => void | Promise<void>;
};

/**
 * Fires lifecycle callbacks when app moves between foreground and background.
 *
 * NOTE: We do NOT pause/resume Supabase channels here. Calling subscribe() on
 * a channel instance that has already gone through a join lifecycle causes
 * Phoenix to throw "tried to join multiple times". Screens that need channel
 * recovery after backgrounding must recreate the channel instance entirely
 * (remove + re-create in a new useEffect run triggered by a state change).
 *
 * This hook exists solely for the onBackground/onForeground callbacks (e.g.
 * to stop/start location timers or flush pending writes).
 */
export function useAppStateChannels(
  _channels: (RealtimeChannel | null)[],
  options?: AppStateChannelOptions,
) {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current === 'active' && nextState.match(/inactive|background/)) {
        void options?.onBackground?.();
      } else if (appState.current.match(/inactive|background/) && nextState === 'active') {
        void options?.onForeground?.();
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, [options]);
}
