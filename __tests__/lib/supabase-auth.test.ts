import '../utils/mocks';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { buildSupabaseEdgeHeaders, getSupabaseAccessToken } from '@/lib/supabase-auth';

describe('supabase-auth helpers', () => {
  beforeEach(() => {
    const { supabase } = require('@/lib/supabase');
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  it('returns the current access token when the session is still valid', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'current-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });

    await expect(getSupabaseAccessToken()).resolves.toBe('current-token');
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes the token when the current session is near expiry', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'stale-token',
          expires_at: Math.floor(Date.now() / 1000) + 10,
        },
      },
      error: null,
    });
    supabase.auth.refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'fresh-token',
        },
      },
      error: null,
    });

    await expect(getSupabaseAccessToken()).resolves.toBe('fresh-token');
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('returns null when the stored session can no longer be refreshed', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'stale-token',
          expires_at: Math.floor(Date.now() / 1000) + 10,
        },
      },
      error: null,
    });
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid Refresh Token: Refresh Token Not Found'),
    });

    await expect(getSupabaseAccessToken()).resolves.toBeNull();
  });

  it('builds edge headers with bearer auth and apikey', () => {
    const previousAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    expect(buildSupabaseEdgeHeaders('access-token')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-token',
      apikey: 'anon-key',
    });

    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousAnonKey;
  });
});
