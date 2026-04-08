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

describeSupabase('Supabase RPC - Complete Delivery', () => {
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
    scenario = createSupabaseScenarioState('complete-delivery');
    await cleanupSupabaseScenarioData(clients.service, undefined, seeded);
  });

  afterEach(async () => {
    await cleanupSupabaseScenarioData(clients.service, scenario, seeded);
  });

  async function createAcceptedOrder(paymentMethod: 'cash' | 'wallet') {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod,
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

    const { data: order, error } = await clients.service
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch accepted order ${orderId}: ${error.message}`);
    }

    return order as any;
  }

  it('authorized rider can move matched to pickup_en_route and arrived_pickup to in_transit', async () => {
    const order = await createAcceptedOrder('cash');

    const toPickup = await clients.rider.rpc('update_order_status', {
      p_order_id: order.id,
      p_new_status: 'pickup_en_route',
      p_changed_by: seeded.riderProfileId,
    } as any);
    expect(toPickup.error).toBeNull();

    const arrivedPickup = await clients.rider.rpc('update_order_status', {
      p_order_id: order.id,
      p_new_status: 'arrived_pickup',
      p_changed_by: seeded.riderProfileId,
    } as any);
    expect(arrivedPickup.error).toBeNull();

    const inTransit = await clients.rider.rpc('update_order_status', {
      p_order_id: order.id,
      p_new_status: 'in_transit',
      p_changed_by: seeded.riderProfileId,
    } as any);
    expect(inTransit.error).toBeNull();

    const { data: refreshedOrder } = await clients.service
      .from('orders')
      .select('status, picked_up_at')
      .eq('id', order.id)
      .single();

    expect(refreshedOrder?.status).toBe('in_transit');
    expect(refreshedOrder?.picked_up_at).not.toBeNull();
  });

  it('complete_delivery fails in invalid status, for unassigned rider, and when code is not verified', async () => {
    const matchedOrder = await createAcceptedOrder('cash');

    const invalidStatus = await clients.rider.rpc('complete_delivery', {
      p_order_id: matchedOrder.id,
      p_rider_id: seeded.riderId,
    } as any);
    expect(invalidStatus.error).not.toBeNull();

    await advanceOrderToDropoff(clients.rider, matchedOrder.id, seeded.riderProfileId);

    const wrongRider = await clients.riderTwo.rpc('complete_delivery', {
      p_order_id: matchedOrder.id,
      p_rider_id: seeded.riderTwoId,
    } as any);
    expect(wrongRider.error).not.toBeNull();

    const noCode = await clients.rider.rpc('complete_delivery', {
      p_order_id: matchedOrder.id,
      p_rider_id: seeded.riderId,
    } as any);
    expect(noCode.error).not.toBeNull();
  });

  it('complete_delivery succeeds when code is verified and writes delivered status history', async () => {
    const order = await createAcceptedOrder('cash');
    await advanceOrderToDropoff(clients.rider, order.id, seeded.riderProfileId);

    const verify = await clients.rider.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_code: order.delivery_code,
    } as any);
    expect(verify.error).toBeNull();
    expect(verify.data).toBe(true);

    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_pod_photo_url: 'https://example.test/pod.jpg',
    } as any);
    expect(completion.error).toBeNull();

    const { data: refreshedOrder } = await clients.service
      .from('orders')
      .select('status, pod_photo_url')
      .eq('id', order.id)
      .single();

    expect(refreshedOrder?.status).toBe('delivered');
    expect(refreshedOrder?.pod_photo_url).toBe('https://example.test/pod.jpg');

    const { data: historyRows } = await clients.service
      .from('order_status_history')
      .select('old_status, new_status')
      .eq('order_id', order.id)
      .eq('new_status', 'delivered');

    expect(historyRows).toHaveLength(1);
    expect(historyRows?.[0].old_status).toBe('arrived_dropoff');
  });

  it('wallet-paid complete_delivery credits rider and platform exactly once via rider profile wallet', async () => {
    const order = await createAcceptedOrder('wallet');
    await advanceOrderToDropoff(clients.rider, order.id, seeded.riderProfileId);

    const riderWalletBefore = await clients.service
      .from('wallets')
      .select('*')
      .eq('id', seeded.riderWalletId)
      .single();
    const platformWalletBefore = await clients.service
      .from('wallets')
      .select('*')
      .eq('id', seeded.platformWalletId)
      .single();

    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_code: order.delivery_code,
    } as any);

    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_pod_photo_url: 'https://example.test/pod-wallet-complete.jpg',
    } as any);

    expect(completion.error).toBeNull();

    const riderWalletAfter = await clients.service
      .from('wallets')
      .select('*')
      .eq('id', seeded.riderWalletId)
      .single();
    const platformWalletAfter = await clients.service
      .from('wallets')
      .select('*')
      .eq('id', seeded.platformWalletId)
      .single();

    expect(riderWalletAfter.data?.owner_id).toBe(seeded.riderProfileId);
    expect(Number(riderWalletAfter.data?.balance ?? 0)).toBeGreaterThan(Number(riderWalletBefore.data?.balance ?? 0));
    expect(Number(platformWalletAfter.data?.balance ?? 0)).toBeGreaterThan(Number(platformWalletBefore.data?.balance ?? 0));

    const { data: payoutTransactions } = await clients.service
      .from('transactions')
      .select('wallet_id, type, reference')
      .eq('order_id', order.id);

    const riderCredits = payoutTransactions?.filter(
      (transaction) => transaction.wallet_id === seeded.riderWalletId && transaction.type === 'credit',
    );
    const platformCredits = payoutTransactions?.filter(
      (transaction) => transaction.wallet_id === seeded.platformWalletId && transaction.type === 'commission_credit',
    );

    expect(riderCredits).toHaveLength(1);
    expect(platformCredits).toHaveLength(1);
  });

  it('cash-paid complete_delivery creates outstanding_balances row', async () => {
    const order = await createAcceptedOrder('cash');
    await advanceOrderToDropoff(clients.rider, order.id, seeded.riderProfileId);

    const verify = await clients.rider.rpc('verify_delivery_code', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_code: order.delivery_code,
    } as any);
    expect(verify.error).toBeNull();

    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: order.id,
      p_rider_id: seeded.riderId,
      p_pod_photo_url: 'https://example.test/pod-cash-complete.jpg',
    } as any);
    expect(completion.error).toBeNull();

    const { data: outstandingRow, error } = await clients.service
      .from('outstanding_balances')
      .select('*')
      .eq('order_id', order.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(outstandingRow?.order_id).toBe(order.id);
    expect(outstandingRow?.customer_id).toBe(seeded.customerId);
    expect(outstandingRow?.rider_id).toBe(seeded.riderId);
  });
});
