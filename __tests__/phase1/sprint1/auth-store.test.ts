import '../../utils/mocks';
import { useAuthStore } from '@/store/auth.store';

describe('Auth Store', () => {
  beforeEach(() => {
    // Reset store state between tests
    useAuthStore.setState({
      session: null,
      user: null,
      profile: null,
      role: null,
      isLoading: false,
      isInitialized: false,
    });
  });

  it('initializes with null session', () => {
    const { session, user, profile, role, isInitialized } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(user).toBeNull();
    expect(profile).toBeNull();
    expect(role).toBeNull();
    expect(isInitialized).toBe(false);
  });

  it('setSession updates session and user', () => {
    const mockSession = {
      user: { id: 'user-123', phone: '+2348012345678' },
      access_token: 'token',
      refresh_token: 'refresh',
    } as any;

    useAuthStore.getState().setSession(mockSession);
    const { session, user } = useAuthStore.getState();

    expect(session).toEqual(mockSession);
    expect(user).toEqual(mockSession.user);
  });

  it('setSession with null clears session and user', () => {
    useAuthStore.setState({ session: {} as any, user: {} as any });
    useAuthStore.getState().setSession(null);

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('signOut clears all auth state', async () => {
    useAuthStore.setState({
      session: {} as any,
      user: {} as any,
      profile: {} as any,
      role: 'customer',
    });

    await useAuthStore.getState().signOut();
    const { session, user, profile, role } = useAuthStore.getState();

    expect(session).toBeNull();
    expect(user).toBeNull();
    expect(profile).toBeNull();
    expect(role).toBeNull();
  });

  it('initialize marks isInitialized=true after getSession', async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it('loadProfile sets profile and role', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'user-123', role: 'customer', full_name: 'Test' },
        error: null,
      }),
    });

    await useAuthStore.getState().loadProfile('user-123');
    const { profile, role } = useAuthStore.getState();

    expect(profile).not.toBeNull();
    expect(role).toBe('customer');
  });
});
