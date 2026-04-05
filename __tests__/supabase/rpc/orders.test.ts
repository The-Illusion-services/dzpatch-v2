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

async function getOrder(service: SupabaseTestClients['service'], orderId: string) {
  const { data, error } = await service
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch order ${orderId}: ${error.message}`);
  }

  return data as any;
}

async function getWallet(service: SupabaseTestClients['service'], ownerId: string) {
  const { data, error } = await service
    .from('wallets')
    .select('*')
    .eq('owner_type', 'customer')
    .eq('owner_id', ownerId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch customer wallet for ${ownerId}: ${error.message}`);
  }

  return data;
}

describeSupabase('Supabase RPC - Orders', () => {
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
    scenario = createSupabaseScenarioState('orders');
    await cleanupSupabaseScenarioData(clients.service, undefined, seeded);
  });

  afterEach(async () => {
    await cleanupSupabaseScenarioData(clients.service, scenario, seeded);
  });

  it('customer can create wallet-paid order for self only', async () => {
    const walletBefore = await getWallet(clients.service, seeded.customerId);
    const beforeTransactions = await clients.service
      .from('transactions')
      .select('id, description, amount')
      .eq('wallet_id', walletBefore.id)
      .eq('type', 'debit');

    expect(beforeTransactions.error).toBeNull();

    const { orderId, result } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'wallet',
    });
    trackSupabaseOrder(scenario, orderId);

    const order = await getOrder(clients.service, orderId);
    const walletAfter = await getWallet(clients.service, seeded.customerId);
    const finalPrice = Number(order.final_price ?? (result as any)?.final_price ?? 0);

    expect(order.customer_id).toBe(seeded.customerId);
    expect(order.status).toBe('pending');
    expect(order.payment_method).toBe('wallet');
    expect(walletAfter.balance).toBeCloseTo(walletBefore.balance - finalPrice, 2);

    const { data: debitTransactions, error: debitError } = await clients.service
      .from('transactions')
      .select('*')
      .eq('wallet_id', walletBefore.id)
      .eq('type', 'debit');

    const existingIds = new Set((beforeTransactions.data ?? []).map((transaction: any) => transaction.id));
    const matchingDebitTransactions = (debitTransactions ?? []).filter(
      (transaction: any) =>
        !existingIds.has(transaction.id) &&
        transaction.description === 'Payment for delivery order'
    );

    expect(debitError).toBeNull();
    expect(matchingDebitTransactions).toHaveLength(1);
    expect(Number(matchingDebitTransactions[0]?.amount ?? 0)).toBeCloseTo(finalPrice, 2);
  });

  it('customer can create cash-paid order for self only', async () => {
    const walletBefore = await getWallet(clients.service, seeded.customerId);
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, orderId);

    const order = await getOrder(clients.service, orderId);
    const walletAfter = await getWallet(clients.service, seeded.customerId);

    expect(order.customer_id).toBe(seeded.customerId);
    expect(order.status).toBe('pending');
    expect(order.payment_method).toBe('cash');
    expect(walletAfter.balance).toBe(walletBefore.balance);

    const { data: debitTransactions, error: debitError } = await clients.service
      .from('transactions')
      .select('*')
      .eq('order_id', orderId)
      .eq('type', 'debit');

    expect(debitError).toBeNull();
    expect(debitTransactions).toHaveLength(0);
  });

  it('customer can read own orders and unrelated customer cannot read another customer order', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, orderId);

    const ownRead = await clients.customer
      .from('orders')
      .select('id, customer_id, status')
      .eq('id', orderId)
      .maybeSingle();

    expect(ownRead.error).toBeNull();
    expect(ownRead.data?.id).toBe(orderId);
    expect(ownRead.data?.customer_id).toBe(seeded.customerId);

    const unrelatedRead = await clients.customerTwo
      .from('orders')
      .select('id, customer_id, status')
      .eq('id', orderId)
      .maybeSingle();

    expect(unrelatedRead.error).toBeNull();
    expect(unrelatedRead.data).toBeNull();
  });

  it('assigned rider can read assigned order after bid acceptance', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, orderId);

    const { data: bidResult, error: placeBidError } = await clients.rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2200,
    } as any);

    expect(placeBidError).toBeNull();
    const bidId = extractBidId(bidResult);

    const { error: acceptError } = await clients.customer.rpc('accept_bid', {
      p_bid_id: bidId,
      p_customer_id: seeded.customerId,
    } as any);

    expect(acceptError).toBeNull();

    const riderRead = await clients.rider
      .from('orders')
      .select('id, rider_id, status, final_price')
      .eq('id', orderId)
      .maybeSingle();

    expect(riderRead.error).toBeNull();
    expect(riderRead.data?.id).toBe(orderId);
    expect(riderRead.data?.rider_id).toBe(seeded.riderId);
    expect(riderRead.data?.status).toBe('matched');
  });

  it('order creation inserts status history, notification, delivery code, and expiry time', async () => {
    const { orderId } = await createOrderAsCustomer(clients.customer, seeded.customerId, {
      paymentMethod: 'cash',
    });
    trackSupabaseOrder(scenario, orderId);

    const order = await getOrder(clients.service, orderId);

    expect(order.delivery_code).toMatch(/^\d{6}$/);
    expect(new Date(order.expires_at).getTime()).toBeGreaterThan(Date.now());

    const { data: historyRows, error: historyError } = await clients.service
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .eq('new_status', 'pending');

    expect(historyError).toBeNull();
    expect(historyRows).toHaveLength(1);

    const { data: notifications, error: notificationsError } = await clients.service
      .from('notifications')
      .select('*')
      .eq('user_id', seeded.customerId)
      .contains('data', { order_id: orderId } as any);

    expect(notificationsError).toBeNull();
    expect(notifications?.some((notification: any) => notification.data?.code === order.delivery_code)).toBe(true);
  });

  it('customer cannot create order for another customer id', async () => {
    const { error } = await clients.customer.rpc('create_order', {
      p_customer_id: seeded.customerTwoId,
      p_pickup_address: 'Unauthorized Pickup',
      p_pickup_lat: 6.5244,
      p_pickup_lng: 3.3792,
      p_dropoff_address: 'Unauthorized Dropoff',
      p_dropoff_lat: 6.5315,
      p_dropoff_lng: 3.3958,
      p_package_size: 'small',
      p_package_description: 'sb-test unauthorized order owner',
      p_payment_method: 'cash',
    } as any);

    expect(error).not.toBeNull();
  });
});
