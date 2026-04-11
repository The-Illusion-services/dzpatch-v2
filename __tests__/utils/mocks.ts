// Shared mocks for Supabase, expo-router, expo-secure-store

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      refreshSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithOtp: jest.fn().mockResolvedValue({ error: null }),
      verifyOtp: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: jest.fn().mockReturnValue({}),
  Redirect: ({ href }: { href: string }) => null,
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-image
jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// Shared test fixtures
export const mockProfile = {
  id: 'user-123',
  role: 'customer' as const,
  full_name: 'Test User',
  phone: '+2348012345678',
  email: null,
  avatar_url: null,
  push_token: null,
  is_verified: true,
  is_banned: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockSession = {
  user: { id: 'user-123', phone: '+2348012345678' },
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
};

export const mockWallet = {
  id: 'wallet-123',
  owner_type: 'customer' as const,
  owner_id: 'user-123',
  balance: 5000,
  currency: 'NGN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
