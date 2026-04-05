import type { UserRole } from '@/types/database';
import type { SupabaseTestClient } from './client';
import {
  SUPABASE_TEST_PASSWORD,
  createSupabaseServiceClient,
} from './client';

const PLATFORM_WALLET_OWNER_ID = '00000000-0000-0000-0000-000000000001';

type TestAccount = {
  email: string;
  role: UserRole;
  fullName: string;
  phone: string;
};

export type SeededSupabaseUsers = {
  customerId: string;
  customerTwoId: string;
  riderProfileId: string;
  riderId: string;
  riderTwoProfileId: string;
  riderTwoId: string;
  adminId: string;
  customerWalletId: string;
  customerTwoWalletId: string;
  riderWalletId: string;
  riderTwoWalletId: string;
  platformWalletId: string;
};

const TEST_ACCOUNTS: TestAccount[] = [
  {
    email: 'customer@test.com',
    role: 'customer',
    fullName: 'Test Customer',
    phone: '+2340000000001',
  },
  {
    email: 'customer2@test.com',
    role: 'customer',
    fullName: 'Test Customer Two',
    phone: '+2340000000005',
  },
  {
    email: 'rider@test.com',
    role: 'rider',
    fullName: 'Test Rider',
    phone: '+2340000000002',
  },
  {
    email: 'rider2@test.com',
    role: 'rider',
    fullName: 'Test Rider Two',
    phone: '+2340000000006',
  },
  {
    email: 'admin@test.com',
    role: 'admin',
    fullName: 'Test Admin',
    phone: '+2340000000004',
  },
];

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureAuthUser(service: SupabaseTestClient, account: TestAccount) {
  const existingProfile = await service
    .from('profiles')
    .select('id, email')
    .eq('email', account.email)
    .maybeSingle();

  if (existingProfile.error) {
    throw new Error(`Failed to resolve seeded profile for ${account.email}: ${existingProfile.error.message}`);
  }

  if (existingProfile.data?.id) {
    return existingProfile.data.id;
  }

  const { data, error } = await service.auth.admin.createUser({
    email: account.email,
    password: SUPABASE_TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: account.role,
      full_name: account.fullName,
      phone: account.phone,
    },
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
  });

  if (error && !/already been registered|already exists/i.test(error.message)) {
    throw new Error(`Failed to create seeded test user ${account.email}: ${error.message}`);
  }

  const explicitUserId = data.user?.id ?? null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('id, email')
      .eq('email', account.email)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to fetch seeded profile for ${account.email}: ${profileError.message}`);
    }

    if (profile?.id) {
      return profile.id;
    }

    if (explicitUserId) {
      await service.from('profiles').upsert({
        id: explicitUserId,
        role: account.role,
        full_name: account.fullName,
        phone: account.phone,
        email: account.email,
        kyc_status: account.role === 'rider' ? 'approved' : 'not_submitted',
      } as any);
    }

    await pause(250);
  }

  throw new Error(`Seeded profile for ${account.email} was not created in time.`);
}

async function ensureWallet(
  service: SupabaseTestClient,
  ownerType: 'customer' | 'rider' | 'platform',
  ownerId: string,
) {
  const { data: existingWallet, error: walletError } = await service
    .from('wallets')
    .select('id')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (walletError) {
    throw new Error(`Failed to resolve wallet for ${ownerType}:${ownerId}: ${walletError.message}`);
  }

  if (existingWallet?.id) {
    return existingWallet.id;
  }

  const { data: insertedWallet, error: insertError } = await service
    .from('wallets')
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      balance: 0,
      currency: 'NGN',
      is_active: true,
    } as any)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create wallet for ${ownerType}:${ownerId}: ${insertError.message}`);
  }

  return insertedWallet.id;
}

async function ensureRider(service: SupabaseTestClient, profileId: string, vehiclePlate: string) {
  const { data: existingRider, error: riderError } = await service
    .from('riders')
    .select('id, profile_id')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (riderError) {
    throw new Error(`Failed to resolve rider row for ${profileId}: ${riderError.message}`);
  }

  if (existingRider?.id) {
    await service
      .from('riders')
      .update({
        documents_verified: true,
        is_approved: true,
        is_online: true,
        is_commission_locked: false,
        unpaid_commission_count: 0,
      } as any)
      .eq('id', existingRider.id);

    await service
      .from('profiles')
      .update({
        kyc_status: 'approved',
      } as any)
      .eq('id', profileId);

    return existingRider.id;
  }

  const { data: insertedRider, error: insertError } = await service
    .from('riders')
    .insert({
      profile_id: profileId,
      vehicle_type: 'motorcycle',
      vehicle_plate: vehiclePlate,
      vehicle_color: 'Black',
      vehicle_make: 'Honda',
      vehicle_model: 'CG 125',
      documents_verified: true,
      is_approved: true,
      is_online: true,
      average_rating: 5,
      is_commission_locked: false,
      unpaid_commission_count: 0,
    } as any)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create rider row for ${profileId}: ${insertError.message}`);
  }

  await service
    .from('profiles')
    .update({
      kyc_status: 'approved',
    } as any)
    .eq('id', profileId);

  return insertedRider.id;
}

export async function seedSupabaseBaseState(
  serviceClient?: SupabaseTestClient,
): Promise<SeededSupabaseUsers> {
  const service = serviceClient ?? createSupabaseServiceClient();

  const customerId = await ensureAuthUser(service, TEST_ACCOUNTS[0]);
  const customerTwoId = await ensureAuthUser(service, TEST_ACCOUNTS[1]);
  const riderProfileId = await ensureAuthUser(service, TEST_ACCOUNTS[2]);
  const riderTwoProfileId = await ensureAuthUser(service, TEST_ACCOUNTS[3]);
  const adminId = await ensureAuthUser(service, TEST_ACCOUNTS[4]);

  const riderId = await ensureRider(service, riderProfileId, 'LG-001-AA');
  const riderTwoId = await ensureRider(service, riderTwoProfileId, 'LG-002-BB');

  const customerWalletId = await ensureWallet(service, 'customer', customerId);
  const customerTwoWalletId = await ensureWallet(service, 'customer', customerTwoId);
  const riderWalletId = await ensureWallet(service, 'rider', riderProfileId);
  const riderTwoWalletId = await ensureWallet(service, 'rider', riderTwoProfileId);
  const platformWalletId = await ensureWallet(service, 'platform', PLATFORM_WALLET_OWNER_ID);

  return {
    customerId,
    customerTwoId,
    riderProfileId,
    riderId,
    riderTwoProfileId,
    riderTwoId,
    adminId,
    customerWalletId,
    customerTwoWalletId,
    riderWalletId,
    riderTwoWalletId,
    platformWalletId,
  };
}
