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
import {
  advanceOrderToDropoff,
  createOrderAsCustomer,
  extractBidId,
} from '../_helpers/factories';
import {
  seedSupabaseBaseState,
  type SeededSupabaseUsers,
} from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RPC - Delivery Code Security', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;
  let scenario: SupabaseScenarioState;

  beforeAll(async () => {
    const service = createSupabaseServiceClient();
    seeded = await seedSupabaseBaseState(service);
    clients = await createSupabaseTestClients();
  });

  beforeEach(async () => {
    scenario = createSupabaseScenarioState('delivery-code');
    await cleanupSupabaseScenarioData(clients.service, undefined, seeded);
  });

  afterEach(async () => {
    await cleanupSupabaseScenarioData(clients.service, scenario, seeded);
  });

  async function createDropoffReadyOrder() {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, orderId);

    const bid = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2200,
    } as any);
    expect(bid.error).toBeNull();

    const accepted = await clients.customer.rpc('accept_bid', {
      p_bid_id: extractBidId(bid.data),
      p_customer_id: seeded.customerId,
    } as any);
    expect(accepted.error).toBeNull();

    await advanceOrderToDropoff(clients.rider, orderId, seeded.riderProfileId);

    const { data: order, error } = await clients.service
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) {
      throw new Error(`Failed to load dropoff-ready order ${orderId}: ${error.message}`);
    }

    return order as any;
  }

  it('correct code verifies successfully', async () => {
    const order = await createDropoffReadyOrder();

    const { data, error } = await clients.rider.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_code: order.delivery_code,
    } as any);

    expect(error).toBeNull();
    expect(data).toBe(true);

    const refreshedOrder = await clients.service
      .from('orders')
      .select('delivery_code_verified, failed_delivery_attempts, delivery_locked_until')
      .eq('id', order.id)
      .single();

    expect(refreshedOrder.data?.delivery_code_verified).toBe(true);
    expect((refreshedOrder.data as any)?.failed_delivery_attempts).toBe(0);
    expect((refreshedOrder.data as any)?.delivery_locked_until).toBeNull();
  });

  it('wrong code increments attempts and third wrong attempt locks the order', async () => {
    const order = await createDropoffReadyOrder();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await clients.rider.rpc('verify_delivery_code', {
        p_order_id: order.id,
        p_rider_id: seeded.riderId,
        p_code: '999999',
      } as any);

      expect(response.error).toBeNull();
      expect(response.data).toBe(false);
    }

    const refreshedOrder = await clients.service
      .from('orders')
      .select('failed_delivery_attempts, delivery_locked_until')
      .eq('id', order.id)
      .single();

    expect((refreshedOrder.data as any)?.failed_delivery_attempts).toBe(3);
    expect(new Date((refreshedOrder.data as any)?.delivery_locked_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('locked order rejects later attempts until expiry and expired lock allows retry', async () => {
    const order = await createDropoffReadyOrder();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await clients.rider.rpc('verify_delivery_code', {
        p_order_id: order.id,
        p_rider_id: seeded.riderId,
        p_code: '999999',
      } as any);
    }

    const lockedResponse = await clients.rider.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_code: order.delivery_code,
    } as any);

    expect(lockedResponse.error).not.toBeNull();

    await clients.service
      .from('orders')
      .update({
        delivery_locked_until: new Date(Date.now() - 60_000).toISOString(),
      } as any)
      .eq('id', order.id);

    const unlockedResponse = await clients.rider.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_code: order.delivery_code,
    } as any);

    expect(unlockedResponse.error).toBeNull();
    expect(unlockedResponse.data).toBe(true);
  });

  it('only assigned rider can verify code and only at delivery-stage statuses', async () => {
    const order = await createDropoffReadyOrder();

    const wrongRiderAttempt = await clients.riderTwo.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderTwoId,
      p_code: order.delivery_code,
    } as any);

    expect(wrongRiderAttempt.error).not.toBeNull();

    const freshOrder = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, freshOrder.orderId);

    const freshBid = await clients.rider.rpc('place_bid', {
      p_order_id: freshOrder.orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2100,
    } as any);
    expect(freshBid.error).toBeNull();

    const accepted = await clients.customer.rpc('accept_bid', {
      p_bid_id: extractBidId(freshBid.data),
      p_customer_id: seeded.customerId,
    } as any);
    expect(accepted.error).toBeNull();

    const { data: matchedOrder } = await clients.service
      .from('orders')
      .select('delivery_code')
      .eq('id', freshOrder.orderId)
      .single();

    const wrongStatusAttempt = await clients.rider.rpc('verify_delivery_code', {
      p_order_id: freshOrder.orderId,
      p_rider_id: seeded.riderId,
      p_code: (matchedOrder as any)?.delivery_code,
    } as any);

    expect(wrongStatusAttempt.error).not.toBeNull();
  });
});
