import { supabase } from '@/lib/supabase';

const EDGE_AUTH_TIMEOUT_MS = 12000;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function isRecoverableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return (
    normalized.includes('refresh token') ||
    normalized.includes('jwt') ||
    normalized.includes('session not found') ||
    normalized.includes('session missing')
  );
}

export async function getSupabaseAccessToken(forceRefresh = false) {
  try {
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      EDGE_AUTH_TIMEOUT_MS,
      'We could not restore your session in time. Please try again.',
    );

    if (sessionError) {
      throw sessionError;
    }

    const session = sessionData.session;
    if (!session) {
      return null;
    }

    const expiresSoon =
      typeof session.expires_at === 'number' &&
      session.expires_at * 1000 <= Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS;

    if (!forceRefresh && !expiresSoon) {
      return session.access_token ?? null;
    }

    const { data: refreshData, error: refreshError } = await withTimeout(
      supabase.auth.refreshSession(),
      EDGE_AUTH_TIMEOUT_MS,
      'Refreshing your session took too long. Please try again.',
    );

    if (refreshError) {
      throw refreshError;
    }

    return refreshData.session?.access_token ?? session.access_token ?? null;
  } catch (error) {
    if (isRecoverableAuthError(error)) {
      console.warn('Unable to refresh Supabase access token for edge function call:', error);
      return null;
    }

    throw error;
  }
}

export function buildSupabaseEdgeHeaders(accessToken: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    headers.apikey = anonKey;
  }

  return headers;
}
