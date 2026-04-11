import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  riderId: string | null; // riders.id UUID (distinct from profile.id); only populated when role === 'rider'
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  loadProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Module-level guard ensures onAuthStateChange is registered exactly once
// even if initialize() is called multiple times (e.g., hot reload, test env)
let _authListenerActive = false;
const AUTH_REQUEST_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function resetAuthState(set: (partial: Partial<AuthState>) => void) {
  set({
    session: null,
    user: null,
    profile: null,
    role: null,
    riderId: null,
    isLoading: false,
  });
}

function isStaleSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return (
    normalized.includes('refresh token') ||
    normalized.includes('jwt') ||
    normalized.includes('session not found')
  );
}

async function clearLocalSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('Failed to clear local Supabase session:', error);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  riderId: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      set({ isLoading: true, profile: null, role: null, riderId: null });

      const sessionPromise = supabase.auth.getSession();
      let sessionTimeout: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<{ data: { session: null }; error: null }>((resolve) =>
        sessionTimeout = setTimeout(() => {
          console.warn('Supabase getSession timeout after 10s - proceeding as unauthenticated');
          resolve({ data: { session: null }, error: null });
        }, 10000)
      );

      const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
      if (sessionTimeout) clearTimeout(sessionTimeout);

      if (error) {
        if (isStaleSessionError(error)) {
          console.warn('Clearing stale Supabase auth session:', error.message);
          await clearLocalSession();
          resetAuthState(set);
          return;
        }
        throw error;
      }

      if (session?.user) {
        set({ session, user: session.user, profile: null, role: null, riderId: null });
        try {
          await get().loadProfile(session.user.id);
        } catch (profileError) {
          set({ profile: null, role: null, riderId: null });
          console.error('Failed to load profile:', profileError);
        }
      } else {
        resetAuthState(set);
      }
    } catch (error) {
      if (isStaleSessionError(error)) {
        await clearLocalSession();
      }
      resetAuthState(set);
      console.error('Auth initialization error:', error);
    } finally {
      set({ isInitialized: true, isLoading: false });
    }

    if (!_authListenerActive) {
      _authListenerActive = true;
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'INITIAL_SESSION') return;

        if (event === 'TOKEN_REFRESH_FAILED') {
          console.warn('Supabase token refresh failed - clearing local session');
          await clearLocalSession();
          resetAuthState(set);
          return;
        }

        const currentState = get();
        const sameUser = !!session?.user?.id && session.user.id === currentState.user?.id;

        if (sameUser && currentState.profile?.id) {
          set({
            session,
            user: session?.user ?? null,
            isLoading: false,
          });
          return;
        }

        set(
          sameUser
            ? {
                session,
                user: session?.user ?? null,
                isLoading: true,
              }
            : {
                session,
                user: session?.user ?? null,
                profile: null,
                role: null,
                riderId: null,
                isLoading: true,
              }
        );

        if (session?.user) {
          try {
            await get().loadProfile(session.user.id);
          } catch (error) {
            if (!sameUser) {
              set({ profile: null, role: null, riderId: null });
            }
            console.error('Profile load error on auth change:', error);
          } finally {
            set({ isLoading: false });
          }
        } else {
          set({ profile: null, role: null, riderId: null, isLoading: false });
        }
      });
    }
  },

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      profile: null,
      role: null,
      riderId: null,
      isLoading: false,
    });
  },

  loadProfile: async (userId) => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        AUTH_REQUEST_TIMEOUT_MS,
        'Loading your profile took too long. Please try again.',
      );

      if (error) {
        console.error('Profile fetch error:', error.message);
        throw error;
      }

      if (!data) {
        console.warn('Profile not found for userId:', userId);
        throw new Error(`Profile not found for userId: ${userId}`);
      }

      const p = data as Profile;
      set({ profile: p, role: p.role });

      if (p.role === 'rider') {
        try {
          const { data: riderRow, error: riderError } = await withTimeout(
            supabase
              .from('riders')
              .select('id')
              .eq('profile_id', userId)
              .single(),
            AUTH_REQUEST_TIMEOUT_MS,
            'Loading your rider profile took too long. Please try again.',
          );

          if (riderError) {
            console.error('Rider fetch error:', riderError.message);
          }

          set({ riderId: (riderRow as any)?.id ?? null });
        } catch (riderErr) {
          console.error('Unexpected error fetching rider:', riderErr);
          set({ riderId: null });
        }
      } else {
        set({ riderId: null });
      }
    } catch (error) {
      console.error('loadProfile error:', error);
      throw error;
    }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error && isStaleSessionError(error)) {
      await clearLocalSession();
    } else if (error) {
      throw error;
    }
    resetAuthState(set);
  },
}));
