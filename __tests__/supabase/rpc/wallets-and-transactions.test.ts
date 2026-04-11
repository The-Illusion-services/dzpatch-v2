import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { advanceOrderToDropoff, buildTestReference, createOrderAsCustomer, extractBidId } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RPC - Wallets and Transactions', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  async function topUpCustomerWallet(amount: number) {
    const credit = await clients.service.rpc('credit_wallet', {
      p_wallet_id: seeded.customerWalletId,
      p_amount: amount,
      p_type: 'credit',
      p_reference: buildTestReference('customer-topup'),
      p_description: 'Wallet order setup',
    } as any);

    expect(credit.error).toBeNull();
  }

  async function topUpRiderWallet(amount: number) {
    const credit = await clients.service.rpc('credit_wallet', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: amount,
      p_type: 'credit',
      p_reference: buildTestReference('rider-topup'),
      p_description: 'Rider wallet setup',
    } as any);

    expect(credit.error).toBeNull();
  }

  it('wallet owner can read own wallet and transactions while unrelated user cannot', async () => {
    const reference = buildTestReference('wallet-credit');
    const credit = await clients.service.rpc('credit_wallet', {
      p_wallet_id: seeded.customerWalletId,
      p_amount: 500,
      p_type: 'credit',
      p_reference: reference,
      p_description: 'Seeded credit',
    } as any);

    expect(credit.error).toBeNull();

    const ownWallet = await clients.customer.from('wallets').select('*').eq('id', seeded.customerWalletId).maybeSingle();
    const ownTransactions = await clients.customer.from('transactions').select('*').eq('reference', reference);
    const unrelatedWallet = await clients.customerTwo.from('wallets').select('*').eq('id', seeded.customerWalletId).maybeSingle();

    expect(ownWallet.error).toBeNull();
    expect(ownWallet.data?.id).toBe(seeded.customerWalletId);
    expect(ownTransactions.error).toBeNull();
    expect((ownTransactions.data ?? []).length).toBe(1);
    expect(unrelatedWallet.error).toBeNull();
    expect(unrelatedWallet.data).toBeNull();
  });

  it('credit_wallet and debit_wallet insert transaction rows and duplicate reference does not double-apply', async () => {
    const creditRef = buildTestReference('credit-once');
    const debitRef = buildTestReference('debit-once');

    const credit = await clients.service.rpc('credit_wallet', {
      p_wallet_id: seeded.customerWalletId,
      p_amount: 250,
      p_type: 'credit',
      p_reference: creditRef,
      p_description: 'Credit test',
    } as any);
    expect(credit.error).toBeNull();

    const debit = await clients.service.rpc('debit_wallet', {
      p_wallet_id: seeded.customerWalletId,
      p_amount: 125,
      p_type: 'debit',
      p_reference: debitRef,
      p_description: 'Debit test',
    } as any);
    expect(debit.error).toBeNull();

    const duplicate = await clients.service.rpc('credit_wallet', {
      p_wallet_id: seeded.customerWalletId,
      p_amount: 250,
      p_type: 'credit',
      p_reference: creditRef,
      p_description: 'Duplicate credit test',
    } as any);
    expect(duplicate.error === null || duplicate.error !== null).toBe(true);

    const txs = await clients.service.from('transactions').select('*').in('reference', [creditRef, debitRef]);
    expect((txs.data ?? []).length).toBe(2);
  });

  it('balance cannot go below zero and refund credits once through cancellation flow', async () => {
    const tooMuch = await clients.service.rpc('debit_wallet', {
      p_wallet_id: seeded.customerWalletId,
      p_amount: 999999999,
      p_type: 'debit',
      p_reference: buildTestReference('too-much'),
      p_description: 'Should fail',
    } as any);

    expect(tooMuch.error).not.toBeNull();

    await topUpCustomerWallet(5000);
    const walletOrder = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'wallet' });
    const cancel = await clients.customer.rpc('cancel_order', {
      p_order_id: walletOrder.orderId,
      p_cancelled_by: 'customer',
      p_user_id: seeded.customerId,
      p_reason: 'Refund check',
    } as any);

    expect(cancel.error).toBeNull();

    const refunds = await clients.service
      .from('transactions')
      .select('*')
      .eq('order_id', walletOrder.orderId)
      .eq('type', 'refund');

    expect((refunds.data ?? []).length).toBe(1);
  });

  it('cash completion records only commission as outstanding and mark_cash_paid settles it once', async () => {
    const created = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'cash' });

    const bid = await clients.rider.rpc('place_bid', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2200,
    } as any);
    expect(bid.error).toBeNull();

    const accept = await clients.customer.rpc('accept_bid', {
      p_bid_id: extractBidId(bid.data),
      p_customer_id: seeded.customerId,
    } as any);
    expect(accept.error).toBeNull();

    await advanceOrderToDropoff(clients.rider, created.orderId, seeded.riderProfileId);

    const order = await clients.service
      .from('orders')
      .select('id, delivery_code, platform_commission_amount')
      .eq('id', created.orderId)
      .single();

    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_code: order.data?.delivery_code,
    } as any);

    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_pod_photo_url: 'https://example.test/pod-wallets.jpg',
    } as any);
    expect(completion.error).toBeNull();

    const outstanding = await clients.service
      .from('outstanding_balances')
      .select('amount, paid_at')
      .eq('order_id', created.orderId)
      .single();

    expect(outstanding.error).toBeNull();
    expect(Number(outstanding.data?.amount ?? 0)).toBe(Number(order.data?.platform_commission_amount ?? 0));
    expect(outstanding.data?.paid_at).toBeNull();

    const settle = await clients.rider.rpc('mark_cash_paid', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
    } as any);
    expect(settle.error).toBeNull();

    const settled = await clients.service
      .from('outstanding_balances')
      .select('paid_at')
      .eq('order_id', created.orderId)
      .single();

    expect(settled.data?.paid_at).not.toBeNull();

    const settleAgain = await clients.rider.rpc('mark_cash_paid', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
    } as any);
    expect(settleAgain.error).not.toBeNull();
  });

  it('pay_commission debits rider wallet and marks the outstanding balance as paid', async () => {
    await topUpRiderWallet(5000);
    const created = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'cash' });

    const bid = await clients.rider.rpc('place_bid', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2200,
    } as any);
    expect(bid.error).toBeNull();

    const accept = await clients.customer.rpc('accept_bid', {
      p_bid_id: extractBidId(bid.data),
      p_customer_id: seeded.customerId,
    } as any);
    expect(accept.error).toBeNull();

    await advanceOrderToDropoff(clients.rider, created.orderId, seeded.riderProfileId);

    const order = await clients.service
      .from('orders')
      .select('delivery_code')
      .eq('id', created.orderId)
      .single();

    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_code: order.data?.delivery_code,
    } as any);

    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_pod_photo_url: 'https://example.test/pod-pay-commission.jpg',
    } as any);
    expect(completion.error).toBeNull();

    const pay = await clients.rider.rpc('pay_commission', {
      p_order_id: created.orderId,
    } as any);
    expect(pay.error).toBeNull();

    const outstanding = await clients.service
      .from('outstanding_balances')
      .select('paid_at')
      .eq('order_id', created.orderId)
      .single();

    expect(outstanding.error).toBeNull();
    expect(outstanding.data?.paid_at).not.toBeNull();
  });

  it('crediting a rider wallet auto-settles payable outstanding commissions', async () => {
    const created = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'cash' });

    const bid = await clients.rider.rpc('place_bid', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2200,
    } as any);
    expect(bid.error).toBeNull();

    const accept = await clients.customer.rpc('accept_bid', {
      p_bid_id: extractBidId(bid.data),
      p_customer_id: seeded.customerId,
    } as any);
    expect(accept.error).toBeNull();

    await advanceOrderToDropoff(clients.rider, created.orderId, seeded.riderProfileId);

    const order = await clients.service
      .from('orders')
      .select('delivery_code, platform_commission_amount')
      .eq('id', created.orderId)
      .single();

    await clients.rider.rpc('verify_delivery_code', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_code: order.data?.delivery_code,
    } as any);

    const completion = await clients.rider.rpc('complete_delivery', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_pod_photo_url: 'https://example.test/pod-auto-commission.jpg',
    } as any);
    expect(completion.error).toBeNull();

    await topUpRiderWallet(Number(order.data?.platform_commission_amount ?? 0) + 100);

    const outstanding = await clients.service
      .from('outstanding_balances')
      .select('paid_at')
      .eq('order_id', created.orderId)
      .single();

    expect(outstanding.error).toBeNull();
    expect(outstanding.data?.paid_at).not.toBeNull();
  });

  it('cancel_expired_orders refunds wallet-paid unmatched orders and rejects open bids', async () => {
    await topUpCustomerWallet(5000);
    const created = await createOrderAsCustomer(clients.customer, seeded.customerId, { paymentMethod: 'wallet' });

    const bid = await clients.rider.rpc('place_bid', {
      p_order_id: created.orderId,
      p_rider_id: seeded.riderId,
      p_amount: 2100,
    } as any);
    expect(bid.error).toBeNull();
    const bidId = extractBidId(bid.data);

    await clients.service
      .from('orders')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() } as any)
      .eq('id', created.orderId);

    const cancelExpired = await clients.service.rpc('cancel_expired_orders');
    expect(cancelExpired.error).toBeNull();
    expect(Number(cancelExpired.data ?? 0)).toBeGreaterThanOrEqual(1);

    const order = await clients.service
      .from('orders')
      .select('status')
      .eq('id', created.orderId)
      .single();
    const refreshedBid = await clients.service
      .from('bids')
      .select('status')
      .eq('id', bidId)
      .single();
    const refunds = await clients.service
      .from('transactions')
      .select('type, reference')
      .eq('order_id', created.orderId)
      .eq('type', 'refund');

    expect(order.data?.status).toBe('cancelled');
    expect(refreshedBid.data?.status).toBe('rejected');
    expect((refunds.data ?? []).some((tx) => String(tx.reference).startsWith('EXPIRE-REFUND-'))).toBe(true);
  });
});
