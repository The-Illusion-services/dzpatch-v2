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

// Module-level guard — ensures onAuthStateChange is registered exactly once
// even if initialize() is called multiple times (e.g., hot reload, test env)
let _authListenerActive = false;

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
      // Add 10-second timeout to prevent infinite hanging
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => {
          console.warn('Supabase getSession timeout after 10s — proceeding as unauthenticated');
          resolve({ data: { session: null } });
        }, 10000)
      );

      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

      if (session?.user) {
        set({ session, user: session.user });
        try {
          await get().loadProfile(session.user.id);
        } catch (profileError) {
          console.error('Failed to load profile:', profileError);
          // Profile load failure shouldn't block app — user can retry
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      // Proceed as unauthenticated if auth check fails
    } finally {
      set({ isInitialized: true });
    }

    // Register auth state listener exactly once per app lifecycle
    if (!_authListenerActive) {
      _authListenerActive = true;
      supabase.auth.onAuthStateChange(async (event, session) => {
        // INITIAL_SESSION fires immediately after registration when a session already
        // exists — we already handled it above via getSession(), so skip it to avoid
        // running loadProfile twice and triggering a redundant splash re-render.
        if (event === 'INITIAL_SESSION') return;

        set({ session, user: session?.user ?? null });
        if (session?.user) {
          try {
            await get().loadProfile(session.user.id);
          } catch (error) {
            console.error('Profile load error on auth change:', error);
          }
        } else {
          set({ profile: null, role: null, riderId: null });
        }
      });
    }
  },

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  loadProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Profile fetch error:', error.message);
        throw error;
      }

      if (!data) {
        console.warn('Profile not found for userId:', userId);
        return;
      }

      const p = data as Profile;
      set({ profile: p, role: p.role });

      // For rider accounts, fetch riders.id (different from profile.id).
      // All delivery RPCs (update_rider_location, verify_delivery_code,
      // complete_delivery, place_bid) expect this UUID, not the auth profile UUID.
      if (p.role === 'rider') {
        try {
          const { data: riderRow, error: riderError } = await supabase
            .from('riders')
            .select('id')
            .eq('profile_id', userId)
            .single();

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
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, role: null, riderId: null });
  },
}));
