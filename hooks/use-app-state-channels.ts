import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Pauses all provided Supabase channels when app goes to background,
 * resumes them when app returns to foreground.
 */
export function useAppStateChannels(channels: (RealtimeChannel | null)[]) {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current === 'active' && nextState.match(/inactive|background/)) {
        // Going to background — unsubscribe
        channels.forEach((ch) => ch?.unsubscribe());
      } else if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // Coming to foreground — resubscribe
        channels.forEach((ch) => ch?.subscribe());
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [channels]);
}
