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

describeSupabase('Supabase Scenarios - Full Delivery Loop', () => {
  jest.setTimeout(120_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  it('customer funds wallet, creates order, rider bids, accepts, verifies code, and completes delivery', async () => {
    const before = await clients.service.from('wallets').select('balance').eq('id', seeded.customerWalletId).single();

    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'wallet',
    });
    const order = await clients.service.from('orders').select('*').eq('id', matched.orderId).single();

    await advanceOrderToDropoff(clients.rider, matched.orderId, seeded.riderProfileId);
    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
      p_code: order.data?.delivery_code,
    } as any);
    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
    } as any);

    expect(completion.error).toBeNull();

    const after = await clients.service.from('wallets').select('balance').eq('id', seeded.customerWalletId).single();
    const delivered = await clients.service.from('orders').select('status').eq('id', matched.orderId).single();

    expect(delivered.data?.status).toBe('delivered');
    expect(Number(after.data?.balance ?? 0)).toBeLessThan(Number(before.data?.balance ?? 0));
  });

  it('cash order completion creates outstanding balance and final-round negotiation blocks next counter', async () => {
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
    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: matched.orderId,
      p_rider_id: seeded.riderId,
    } as any);
    expect(completion.error).toBeNull();

    const outstanding = await clients.service
      .from('outstanding_balances' as any)
      .select('*')
      .eq('order_id', matched.orderId)
      .maybeSingle();

    expect(outstanding.data?.order_id).toBe(matched.orderId);

    const order2 = await clients.customer.rpc('create_order', {
      p_customer_id: seeded.customerId,
      p_pickup_address: 'Scenario pickup',
      p_pickup_lat: 6.5,
      p_pickup_lng: 3.3,
      p_dropoff_address: 'Scenario dropoff',
      p_dropoff_lat: 6.51,
      p_dropoff_lng: 3.31,
      p_package_size: 'small',
      p_package_description: 'scenario negotiation',
      p_payment_method: 'cash',
    } as any);
    const orderId2 = (order2.data as any)?.order_id;

    const initialBid = await clients.rider.rpc('place_bid', {
      p_order_id: orderId2,
      p_rider_id: seeded.riderId,
      p_amount: 2400,
    } as any);
    const bid1 = extractBidId(initialBid.data);
    const round2 = await clients.customer.rpc('send_counter_offer', { p_bid_id: bid1, p_customer_id: seeded.customerId, p_amount: 2300 } as any);
    const bid2 = round2.data as string;
    const round3 = await clients.customer.rpc('send_counter_offer', { p_bid_id: bid2, p_customer_id: seeded.customerId, p_amount: 2200 } as any);
    const bid3 = round3.data as string;
    const round4 = await clients.customer.rpc('send_counter_offer', { p_bid_id: bid3, p_customer_id: seeded.customerId, p_amount: 2100 } as any);

    expect(round4.error).not.toBeNull();
  });

  it('wallet cancellation refunds once, matched users can chat, and rider can add bank/doc setup for payout flow', async () => {
    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'wallet',
    });

    const chat = await clients.customer
      .from('chat_messages')
      .insert({
        order_id: matched.orderId,
        sender_id: seeded.customerId,
        message: 'hello rider',
      } as any)
      .select('*')
      .single();

    expect(chat.error).toBeNull();

    const unrelatedRead = await clients.customerTwo.from('chat_messages').select('*').eq('order_id', matched.orderId);
    expect(unrelatedRead.data).toEqual([]);

    const docPath = `rider-docs/${seeded.riderProfileId}/scenario-doc.txt`;
    const uploaded = await clients.rider.storage.from('documents').upload(docPath, Buffer.from('doc'), {
      contentType: 'text/plain',
      upsert: true,
    });
    expect(uploaded.error).toBeNull();

    const bank = await clients.rider
      .from('rider_bank_accounts')
      .insert({
        rider_id: seeded.riderId,
        bank_name: 'Scenario Bank',
        bank_code: '999',
        account_number: '1234567890',
        account_name: 'Scenario Rider',
      } as any)
      .select('*')
      .single();
    expect(bank.error).toBeNull();

    const cancel = await clients.customer.rpc('cancel_order', {
      p_order_id: matched.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerId,
      p_reason: 'scenario refund',
    } as any);
    expect(cancel.error).toBeNull();

    const refunds = await clients.service.from('transactions').select('*').eq('order_id', matched.orderId).eq('type', 'refund');
    expect((refunds.data ?? []).length).toBe(1);
  });
});
