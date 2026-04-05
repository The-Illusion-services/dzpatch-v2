import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RLS - Saved Addresses', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  it('customer can create, update, and delete own saved address', async () => {
    const created = await clients.customer
      .from('saved_addresses')
      .insert({
        user_id: seeded.customerId,
        label: 'Home',
        address: 'Test Address',
        location: 'POINT(3.3792 6.5244)',
        latitude: 6.5244,
        longitude: 3.3792,
      } as any)
      .select('*')
      .single();

    expect(created.error).toBeNull();
    expect(created.data?.user_id).toBe(seeded.customerId);

    const updated = await clients.customer
      .from('saved_addresses')
      .update({ label: 'Updated Home' } as any)
      .eq('id', created.data!.id)
      .select('*')
      .single();

    expect(updated.error).toBeNull();
    expect(updated.data?.label).toBe('Updated Home');

    const deleted = await clients.customer
      .from('saved_addresses')
      .delete()
      .eq('id', created.data!.id)
      .select('*')
      .single();

    expect(deleted.error).toBeNull();
    expect(deleted.data?.id).toBe(created.data!.id);
  });

  it('customer cannot read another user saved addresses', async () => {
    const service = clients.service;
    const seededAddress = await service
      .from('saved_addresses')
      .insert({
        user_id: seeded.customerId,
        label: 'Private',
        address: 'Private Address',
        location: 'POINT(3.3 6.5)',
        latitude: 6.5,
        longitude: 3.3,
      } as any)
      .select('id')
      .single();

    const read = await clients.customerTwo
      .from('saved_addresses')
      .select('*')
      .eq('id', seededAddress.data!.id)
      .maybeSingle();

    expect(read.error).toBeNull();
    expect(read.data).toBeNull();

    await service.from('saved_addresses').delete().eq('id', seededAddress.data!.id);
  });
});
