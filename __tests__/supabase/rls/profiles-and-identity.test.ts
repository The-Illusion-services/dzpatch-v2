import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import {
  cleanupSupabaseScenarioData,
  createSupabaseScenarioState,
  trackSupabaseOrder,
  type SupabaseScenarioState,
} from '../_helpers/cleanup';
import { createMatchedOrder } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RLS - Profiles, Riders, and Identity', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;
  let scenario: SupabaseScenarioState;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  beforeEach(async () => {
    scenario = createSupabaseScenarioState('profiles-identity');
    await cleanupSupabaseScenarioData(clients.service, undefined, seeded);
  });

  afterEach(async () => {
    await cleanupSupabaseScenarioData(clients.service, scenario, seeded);
  });

  it('rider can read and update own rider row', async () => {
    const ownRead = await clients.rider.from('riders').select('*').eq('id', seeded.riderId).maybeSingle();
    expect(ownRead.error).toBeNull();
    expect(ownRead.data?.profile_id).toBe(seeded.riderProfileId);

    const update = await clients.rider
      .from('riders')
      .update({ vehicle_color: 'Blue' } as any)
      .eq('id', seeded.riderId)
      .select('*')
      .maybeSingle();

    expect(update.error).toBeNull();
    expect(update.data?.vehicle_color).toBe('Blue');
  });

  it('customer cannot update rider row but can read assigned rider details in matched context', async () => {
    const denied = await clients.customer
      .from('riders')
      .update({ vehicle_color: 'Red' } as any)
      .eq('id', seeded.riderId)
      .select('*')
      .maybeSingle();

    expect(denied.error !== null || denied.data === null).toBe(true);

    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, matched.orderId);

    const allowedRead = await clients.customer
      .from('riders')
      .select('id, profile_id, vehicle_type')
      .eq('id', seeded.riderId)
      .maybeSingle();

    expect(allowedRead.error).toBeNull();
    expect(allowedRead.data?.id).toBe(seeded.riderId);
  });

  it('rider document and bank inserts use correct rider identity, while mismatches are rejected', async () => {
    const docInsert = await clients.rider
      .from('rider_documents')
      .insert({
        rider_id: seeded.riderId,
        document_type: 'national_id',
        document_url: 'rider-docs/test/doc.png',
      } as any)
      .select('*')
      .single();

    expect(docInsert.error).toBeNull();
    expect(docInsert.data?.rider_id).toBe(seeded.riderId);

    const bankInsert = await clients.rider
      .from('rider_bank_accounts')
      .insert({
        rider_id: seeded.riderId,
        bank_name: 'Test Bank',
        bank_code: '999',
        account_number: '1234567890',
        account_name: 'Test Rider',
      } as any)
      .select('*')
      .single();

    expect(bankInsert.error).toBeNull();
    expect(bankInsert.data?.rider_id).toBe(seeded.riderId);

    const badBankInsert = await clients.rider
      .from('rider_bank_accounts')
      .insert({
        rider_id: seeded.riderTwoId,
        bank_name: 'Wrong Bank',
        bank_code: '998',
        account_number: '0000000000',
        account_name: 'Wrong Rider',
      } as any)
      .select('*')
      .maybeSingle();

    expect(badBankInsert.error).not.toBeNull();
  });
});
