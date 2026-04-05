import {
  SUPABASE_TEST_PASSWORD,
  createAuthenticatedSupabaseTestClient,
} from './client';

export async function signInSeededTestUser(
  email: string,
  password = SUPABASE_TEST_PASSWORD,
) {
  return createAuthenticatedSupabaseTestClient(email, password);
}
