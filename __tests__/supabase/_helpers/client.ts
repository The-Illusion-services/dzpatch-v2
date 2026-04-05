import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const SUPABASE_TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD ?? '123456';

export type SupabaseTestClient = SupabaseClient<Database>;

export type SupabaseTestEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export type SupabaseTestClients = {
  service: SupabaseTestClient;
  customer: SupabaseTestClient;
  customerTwo: SupabaseTestClient;
  rider: SupabaseTestClient;
  riderTwo: SupabaseTestClient;
  admin: SupabaseTestClient;
};

function readRequiredEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  return null;
}

export function getSupabaseTestEnv(): SupabaseTestEnv | null {
  const url = readRequiredEnv('SUPABASE_TEST_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = readRequiredEnv('SUPABASE_TEST_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = readRequiredEnv('SUPABASE_TEST_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
}

export function hasSupabaseTestEnv() {
  return getSupabaseTestEnv() !== null;
}

function createBaseClient(url: string, key: string): SupabaseTestClient {
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'dzpatch-supabase-tests',
      },
    },
  });
}

export function createSupabaseServiceClient(): SupabaseTestClient {
  const env = getSupabaseTestEnv();

  if (!env) {
    throw new Error('Supabase-backed tests require SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and SUPABASE_TEST_SERVICE_ROLE_KEY.');
  }

  return createBaseClient(env.url, env.serviceRoleKey);
}

export function createSupabaseAnonClient(): SupabaseTestClient {
  const env = getSupabaseTestEnv();

  if (!env) {
    throw new Error('Supabase-backed tests require SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY.');
  }

  return createBaseClient(env.url, env.anonKey);
}

export async function createAuthenticatedSupabaseTestClient(
  email: string,
  password = SUPABASE_TEST_PASSWORD,
): Promise<SupabaseTestClient> {
  const client = createSupabaseAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`Failed to sign in seeded Supabase test user ${email}: ${error.message}`);
  }

  return client;
}

export async function createSupabaseTestClients(): Promise<SupabaseTestClients> {
  return {
    service: createSupabaseServiceClient(),
    customer: await createAuthenticatedSupabaseTestClient('customer@test.com'),
    customerTwo: await createAuthenticatedSupabaseTestClient('customer2@test.com'),
    rider: await createAuthenticatedSupabaseTestClient('rider@test.com'),
    riderTwo: await createAuthenticatedSupabaseTestClient('rider2@test.com'),
    admin: await createAuthenticatedSupabaseTestClient('admin@test.com'),
  };
}
