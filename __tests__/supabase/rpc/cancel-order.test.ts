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
import { createOrderAsCustomer } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RPC - Cancel Order', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;
  let scenario: SupabaseScenarioState;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  beforeEach(async () => {
    scenario = createSupabaseScenarioState('cancel-order');
    await cleanupSupabaseScenarioData(clients.service, undefined, seeded);
  });

  afterEach(async () => {
    await cleanupSupabaseScenarioData(clients.service, scenario, seeded);
  });

  it('customer can cancel own eligible order and cancellation row records actor and reason', async () => {
    const created = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'cash' });
    trackSupabaseOrder(scenario, created.orderId);

    const cancel = await clients.customer.rpc('cancel_order', {
      p_order_id: created.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerId,
      p_reason: 'Changed my mind',
    } as any);

    expect(cancel.error).toBeNull();

    const order = await clients.service.from('orders').select('status').eq('id', created.orderId).single();
    const cancellation = await clients.service.from('cancellations' as any).select('*').eq('order_id', created.orderId).single();

    expect(order.data?.status).toBe('cancelled');
    expect(cancellation.error).toBeNull();
    expect(cancellation.data?.cancelled_by).toBe('customer');
    expect(cancellation.data?.reason).toBe('Changed my mind');
  });

  it('unrelated customer cannot cancel the order', async () => {
    const created = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'cash' });
    trackSupabaseOrder(scenario, created.orderId);

    const cancel = await clients.customerTwo.rpc('cancel_order', {
      p_order_id: created.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerTwoId,
      p_reason: 'Unauthorized',
    } as any);

    expect(cancel.error).not.toBeNull();
  });

  it('wallet-paid cancellation refunds once while cash cancellation does not create refund transaction', async () => {
    const walletOrder = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'wallet' });
    trackSupabaseOrder(scenario, walletOrder.orderId);

    const cancel = await clients.customer.rpc('cancel_order', {
      p_order_id: walletOrder.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerId,
      p_reason: 'Wallet cancel',
    } as any);
    expect(cancel.error).toBeNull();

    const refunds = await clients.service
      .from('transactions')
      .select('*')
      .eq('order_id', walletOrder.orderId)
      .eq('type', 'refund');

    expect((refunds.data ?? []).length).toBe(1);

    const secondCancel = await clients.customer.rpc('cancel_order', {
      p_order_id: walletOrder.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerId,
      p_reason: 'Second cancel',
    } as any);

    expect(secondCancel.error).not.toBeNull();

    const cashOrder = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'cash' });
    trackSupabaseOrder(scenario, cashOrder.orderId);

    const cashCancel = await clients.customer.rpc('cancel_order', {
      p_order_id: cashOrder.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerId,
      p_reason: 'Cash cancel',
    } as any);
    expect(cashCancel.error).toBeNull();

    const cashRefunds = await clients.service
      .from('transactions')
      .select('*')
      .eq('order_id', cashOrder.orderId)
      .eq('type', 'refund');

    expect((cashRefunds.data ?? []).length).toBe(0);
  });
});
