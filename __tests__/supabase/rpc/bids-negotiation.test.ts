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
  createOrderAsCustomer,
  extractBidId,
} from '../_helpers/factories';
import {
  seedSupabaseBaseState,
  type SeededSupabaseUsers,
} from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RPC - Bids and Negotiation', () => {
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
    scenario = createSupabaseScenarioState('bids');
    await cleanupSupabaseScenarioData(clients.service, undefined, seeded);
  });

  afterEach(async () => {
    await cleanupSupabaseScenarioData(clients.service, scenario, seeded);
  });

  it('rider can place bid on pending order and both participants can read it', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId);
    trackSupabaseOrder(scenario, orderId);

    const { data: bidResult, error: bidError } = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2100,
    } as any);

    expect(bidError).toBeNull();
    const bidId = extractBidId(bidResult);

    const customerRead = await clients.customer
      .from('bids')
      .select('id, order_id, rider_id, amount, status')
      .eq('id', bidId)
      .maybeSingle();

    expect(customerRead.error).toBeNull();
    expect(customerRead.data?.id).toBe(bidId);
    expect(customerRead.data?.order_id).toBe(orderId);

    const riderRead = await clients.rider
      .from('bids')
      .select('id, order_id, rider_id, amount, status')
      .eq('id', bidId)
      .maybeSingle();

    expect(riderRead.error).toBeNull();
    expect(riderRead.data?.id).toBe(bidId);
    expect(riderRead.data?.rider_id).toBe(seeded.riderId);
  });

  it('rider cannot place bid on expired order', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId);
    trackSupabaseOrder(scenario, orderId);

    await clients.service
      .from('orders')
      .update({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      } as any)
      .eq('id', orderId);

    const { error } = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2000,
    } as any);

    expect(error).not.toBeNull();
  });

  it('rider cannot place bid when commission-locked', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId);
    trackSupabaseOrder(scenario, orderId);

    await clients.service
      .from('riders')
      .update({
        is_commission_locked: true,
      } as any)
      .eq('id', seeded.riderId);

    const { error } = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2000,
    } as any);

    expect(error).not.toBeNull();
  });

  it('counter-offer chain preserves parent linkage and blocks round 4', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId);
    trackSupabaseOrder(scenario, orderId);

    const initialBid = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2400,
    } as any);
    expect(initialBid.error).toBeNull();

    const bidOneId = extractBidId(initialBid.data);

    const roundTwo = await clients.customer.rpc('send_counter_offer', {
      p_bid_id: bidOneId,
      p_customer_id: seeded.customerId,
      p_amount: 2300,
    } as any);
    expect(roundTwo.error).toBeNull();
    const bidTwoId = extractBidId(roundTwo.data);

    const roundThree = await clients.customer.rpc('send_counter_offer', {
      p_bid_id: bidTwoId,
      p_customer_id: seeded.customerId,
      p_amount: 2200,
    } as any);
    expect(roundThree.error).toBeNull();
    const bidThreeId = extractBidId(roundThree.data);

    const { data: bidThreeRow } = await clients.service
      .from('bids')
      .select('*')
      .eq('id', bidThreeId)
      .single();

    expect((bidThreeRow as any).parent_bid_id).toBe(bidTwoId);
    expect((bidThreeRow as any).negotiation_round).toBe(3);

    const roundFour = await clients.customer.rpc('send_counter_offer', {
      p_bid_id: bidThreeId,
      p_customer_id: seeded.customerId,
      p_amount: 2100,
    } as any);

    expect(roundFour.error).not.toBeNull();
  });

  it('rider can respond to a customer counter-offer with a linked pending bid', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId);
    trackSupabaseOrder(scenario, orderId);

    const initialBid = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2400,
    } as any);
    expect(initialBid.error).toBeNull();
    const bidOneId = extractBidId(initialBid.data);

    const roundTwo = await clients.customer.rpc('send_counter_offer', {
      p_bid_id: bidOneId,
      p_customer_id: seeded.customerId,
      p_amount: 2100,
    } as any);
    expect(roundTwo.error).toBeNull();
    const bidTwoId = extractBidId(roundTwo.data);

    const riderReply = await clients.rider.rpc('send_rider_counter_offer', {
      p_bid_id: bidTwoId,
      p_rider_id: seeded.riderId,
      p_amount: 2250,
    } as any);
    expect(riderReply.error).toBeNull();

    const bidThreeId = extractBidId(riderReply.data);
    const { data: bidThreeRow, error: bidThreeError } = await clients.service
      .from('bids')
      .select('*')
      .eq('id', bidThreeId)
      .single();

    expect(bidThreeError).toBeNull();
    expect((bidThreeRow as any).parent_bid_id).toBe(bidTwoId);
    expect((bidThreeRow as any).negotiation_round).toBe(3);
    expect((bidThreeRow as any).status).toBe('pending');
    expect((bidThreeRow as any).amount).toBe(2250);
  });

  it('accepting one bid expires competing bids and matched order cannot continue bidding', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId);
    trackSupabaseOrder(scenario, orderId);

    const riderOneBid = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2100,
    } as any);
    expect(riderOneBid.error).toBeNull();

    const riderTwoBid = await clients.riderTwo.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderTwoId,
      p_amount: 2150,
    } as any);
    expect(riderTwoBid.error).toBeNull();

    const bidOneId = extractBidId(riderOneBid.data);
    const bidTwoId = extractBidId(riderTwoBid.data);

    const { error: acceptError } = await clients.customer.rpc('accept_bid', {
      p_bid_id: bidOneId,
      p_customer_id: seeded.customerId,
    } as any);

    expect(acceptError).toBeNull();

    const { data: bids } = await clients.service
      .from('bids')
      .select('id, status')
      .in('id', [bidOneId, bidTwoId]);

    expect(bids?.find((bid) => bid.id === bidOneId)?.status).toBe('accepted');
    expect(bids?.find((bid) => bid.id === bidTwoId)?.status).toBe('expired');

    const { data: order } = await clients.service
      .from('orders')
      .select('id, status, rider_id')
      .eq('id', orderId)
      .single();

    expect(order?.status).toBe('matched');
    expect(order?.rider_id).toBe(seeded.riderId);

    const lateBid = await clients.riderTwo.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderTwoId,
      p_amount: 2050,
    } as any);

    expect(lateBid.error).not.toBeNull();
  });
});
