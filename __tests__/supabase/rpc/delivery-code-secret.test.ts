import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  createSupabaseServiceClient,
  hasSupabaseTestEnv,
  createSupabaseTestClients,
  type SupabaseTestClients,
} from '../_helpers/client';
import {
  seedSupabaseBaseState,
  type SeededSupabaseUsers,
} from '../_helpers/seed';
import { createOrderAsCustomer } from '../_helpers/factories';

const integrationEnabled = process.env.FOODHUNT_DZPATCH_INTEGRATION === '1';
const missingIntegrationEnv = !hasSupabaseTestEnv();
const describeSupabase = integrationEnabled && !missingIntegrationEnv ? describe : describe.skip;

if (integrationEnabled && missingIntegrationEnv) {
  throw new Error(
    'FOODHUNT_DZPATCH_INTEGRATION=1 requires Supabase test env so Foodhunt x Dzpatch tests do not silently skip.'
  );
}

describeSupabase('Delivery Code Secrecy and Verification', () => {
  jest.setTimeout(60000);
  const supabaseAdmin = createSupabaseServiceClient();

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;
  let testOrderId: string;
  let testDeliveryCode: string;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(supabaseAdmin);
    clients = await createSupabaseTestClients();

    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'wallet',
      suggestedPrice: 1500,
      packageDescription: 'delivery-code-secret test package',
    });
    testOrderId = orderId;

    const { data: codeData, error: codeError } = await clients.customer
      .rpc('get_order_delivery_code', { p_order_id: testOrderId } as any);

    expect(codeError).toBeNull();
    expect(typeof codeData).toBe('string');
    testDeliveryCode = String(codeData);
  });

  afterAll(async () => {
    if (testOrderId) {
      await supabaseAdmin.from('order_delivery_secrets').delete().eq('order_id', testOrderId);
      await supabaseAdmin.from('orders').delete().eq('id', testOrderId);
    }
  });

  it('verifies delivery_code is null on order after trigger capture', async () => {
    // Check orders table
    const { data: orderRow } = await supabaseAdmin
      .from('orders')
      .select('delivery_code')
      .eq('id', testOrderId)
      .single();

    // The raw `orders` table shouldn't expose the code in plaintext if trigger captures it.
    if (orderRow) {
      expect(orderRow.delivery_code).toBeNull();
    }

    // Check order_delivery_secrets table
    const { data: secretRow } = await supabaseAdmin
      .from('order_delivery_secrets')
      .select('*')
      .eq('order_id', testOrderId)
      .single();

    expect(secretRow).toBeDefined();
    expect(secretRow.code_hash).toBeDefined();
    
    // Customer can fetch delivery code via RPC
    const { data: codeData, error: codeError } = await clients.customer
      .rpc('get_order_delivery_code', { p_order_id: testOrderId } as any);
      
    expect(codeError).toBeNull();
    expect(codeData).toBeDefined();
    expect(String(codeData)).toHaveLength(6);
  });

  it('ensures rider cannot read delivery code plaintext', async () => {
    // Assign order to rider
    await supabaseAdmin
      .from('orders')
      .update({ rider_id: seeded.riderId, status: 'arrived_dropoff' })
      .eq('id', testOrderId);

    // Read order as rider
    const { data: riderOrder } = await clients.rider
      .from('orders')
      .select('*')
      .eq('id', testOrderId)
      .single();

    expect(riderOrder).toBeDefined();
    if (riderOrder && 'delivery_code' in riderOrder) {
        expect(riderOrder.delivery_code).toBeNull();
    }
  });

  it('fails verify_delivery_code for wrong code and succeeds for correct code', async () => {
    // 1. Get correct code
    const { data: correctCode } = await clients.customer
      .rpc('get_order_delivery_code', { p_order_id: testOrderId });

    // 2. Rider attempts verification with wrong code
    const { data: wrongVerify, error: wrongError } = await clients.rider
      .rpc('verify_delivery_code', {
        p_order_id: testOrderId,
        p_rider_id: seeded.riderId,
        p_code: testDeliveryCode === '000000' ? '000001' : '000000',
      });

    // Our RPC returns a boolean or throws an error.
    if (wrongError) {
      expect(wrongError).toBeDefined();
    } else {
      expect(wrongVerify).toBe(false);
    }

    // 3. Rider attempts verification with correct code
    const { data: correctVerify, error: correctError } = await clients.rider
      .rpc('verify_delivery_code', {
        p_order_id: testOrderId,
        p_rider_id: seeded.riderId,
        p_code: correctCode ?? testDeliveryCode,
      });

    expect(correctError).toBeNull();
    expect(correctVerify).toBe(true);
  });
});
