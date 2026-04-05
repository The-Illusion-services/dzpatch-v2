import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { advanceOrderToDropoff, createMatchedOrder, extractBidId } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RPC - Ratings and Reviews', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  async function createRatedOrder() {
    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'cash',
    });

    const order = await clients.service.from('orders').select('*').eq('id', matched.orderId).single();
    await advanceOrderToDropoff(clients.rider, matched.orderId, seeded.riderProfileId);
    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
      p_code: order.data?.delivery_code,
    } as any);
    await clients.rider.rpc('complete_delivery', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
    } as any);

    return matched.orderId;
  }

  it('customer can submit rider review for completed order and rider average updates', async () => {
    const orderId = await createRatedOrder();
    const before = await clients.service.from('riders').select('average_rating, rating_count').eq('id', seeded.riderId).single();

    const rating = await clients.customer.rpc('rate_rider', {
      p_order_id: orderId,
      p_customer_id: seeded.customerId,
      p_score: 5,
      p_review: 'Excellent',
    } as any);

    expect(rating.error).toBeNull();

    const row = await clients.service.from('ratings').select('*').eq('order_id', orderId).single();
    const after = await clients.service.from('riders').select('average_rating, rating_count').eq('id', seeded.riderId).single();

    expect(row.data?.score).toBe(5);
    expect(after.data?.rating_count).toBeGreaterThanOrEqual((before.data?.rating_count ?? 0) + 1);
  });

  it('rating before completion and out-of-range scores are blocked', async () => {
    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'cash',
    });

    const beforeCompletion = await clients.customer.rpc('rate_rider', {
      p_order_id: matched.orderId,
      p_customer_id: seeded.customerId,
      p_score: 5,
      p_review: 'Too early',
    } as any);

    expect(beforeCompletion.error).not.toBeNull();

    const order = await clients.service.from('orders').select('*').eq('id', matched.orderId).single();
    await advanceOrderToDropoff(clients.rider, matched.orderId, seeded.riderProfileId);
    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
      p_code: order.data?.delivery_code,
    } as any);
    await clients.rider.rpc('complete_delivery', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
    } as any);

    const invalidScore = await clients.customer.rpc('rate_rider', {
      p_order_id: matched.orderId,
      p_customer_id: seeded.customerId,
      p_score: 6,
      p_review: 'Invalid',
    } as any);

    expect(invalidScore.error).not.toBeNull();
  });

  it('one rating per order is enforced', async () => {
    const orderId = await createRatedOrder();

    const first = await clients.customer.rpc('rate_rider', {
      p_order_id: orderId,
      p_customer_id: seeded.customerId,
      p_score: 4,
      p_review: 'First',
    } as any);
    expect(first.error).toBeNull();

    const second = await clients.customer.rpc('rate_rider', {
      p_order_id: orderId,
      p_customer_id: seeded.customerId,
      p_score: 5,
      p_review: 'Second',
    } as any);

    expect(second.error).not.toBeNull();
  });
});
