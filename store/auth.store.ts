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

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  riderId: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({ session, user: session.user });
      await get().loadProfile(session.user.id);
    }
    set({ isInitialized: true });

    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        await get().loadProfile(session.user.id);
      } else {
        set({ profile: null, role: null, riderId: null });
      }
    });
  },

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  loadProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      const p = data as Profile;
      set({ profile: p, role: p.role });

      // For rider accounts, fetch riders.id (different from profile.id).
      // All delivery RPCs (update_rider_location, verify_delivery_code,
      // complete_delivery, place_bid) expect this UUID, not the auth profile UUID.
      if (p.role === 'rider') {
        const { data: riderRow } = await supabase
          .from('riders')
          .select('id')
          .eq('profile_id', userId)
          .single();
        set({ riderId: (riderRow as any)?.id ?? null });
      } else {
        set({ riderId: null });
      }
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, role: null, riderId: null });
  },
}));
