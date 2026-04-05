import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  SUPABASE_TEST_PASSWORD,
  createAuthenticatedSupabaseTestClient,
  createSupabaseServiceClient,
  hasSupabaseTestEnv,
} from '../_helpers/client';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase Auth - Bootstrap and Identity', () => {
  jest.setTimeout(90_000);

  const service = createSupabaseServiceClient();
  let seeded: SeededSupabaseUsers;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(service);
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await service.auth.admin.deleteUser(userId);
    }
  });

  async function createUser(role: 'customer' | 'rider') {
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const phone = `+2349${Date.now().toString().slice(-9)}`;

    const { data, error } = await service.auth.admin.createUser({
      email,
      password: SUPABASE_TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role,
        full_name: role === 'rider' ? 'Auth Rider' : 'Auth Customer',
        phone,
      },
      app_metadata: {
        provider: 'email',
        providers: ['email'],
      },
    });

    if (error || !data.user) {
      throw new Error(`Failed to create auth test user: ${error?.message ?? 'unknown error'}`);
    }

    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function waitForProfile(userId: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const profile = await service.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (profile.data) {
        return profile;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return service.from('profiles').select('*').eq('id', userId).maybeSingle();
  }

  it('new auth user creates profiles row and customer wallet automatically', async () => {
    const userId = await createUser('customer');

    const profile = await waitForProfile(userId);
    expect(profile.error).toBeNull();
    expect(profile.data?.role).toBe('customer');

    const wallet = await service
      .from('wallets')
      .select('*')
      .eq('owner_type', 'customer')
      .eq('owner_id', userId)
      .maybeSingle();

    expect(wallet.error).toBeNull();
    expect(wallet.data?.owner_id).toBe(userId);
  });

  it('rider signup creates linked riders row and rider wallet automatically', async () => {
    const userId = await createUser('rider');

    const profile = await waitForProfile(userId);
    expect(profile.error).toBeNull();
    expect(profile.data?.role).toBe('rider');

    const wallet = await service
      .from('wallets')
      .select('*')
      .eq('owner_type', 'rider')
      .eq('owner_id', userId)
      .maybeSingle();

    expect(wallet.error).toBeNull();
    expect(wallet.data?.owner_id).toBe(userId);
  });

  it('authenticated user can read own profile but not another profile directly', async () => {
    const customerClient = await createAuthenticatedSupabaseTestClient('customer@test.com');

    const ownProfile = await customerClient
      .from('profiles')
      .select('*')
      .eq('id', seeded.customerId)
      .maybeSingle();

    expect(ownProfile.error).toBeNull();
    expect(ownProfile.data?.id).toBe(seeded.customerId);

    const otherProfile = await customerClient
      .from('profiles')
      .select('*')
      .eq('id', seeded.riderProfileId)
      .maybeSingle();

    expect(otherProfile.error).toBeNull();
    expect(otherProfile.data).toBeNull();
  });

  it('admin role can read admin-allowed records', async () => {
    const adminClient = await createAuthenticatedSupabaseTestClient('admin@test.com');

    const profiles = await adminClient
      .from('profiles')
      .select('id, role')
      .in('id', [seeded.customerId, seeded.riderProfileId]);

    expect(profiles.error).toBeNull();
    expect((profiles.data ?? []).length).toBe(2);

    const wallets = await adminClient
      .from('wallets')
      .select('id, owner_id')
      .in('owner_id', [seeded.customerId, seeded.riderProfileId]);

    expect(wallets.error).toBeNull();
    expect((wallets.data ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
