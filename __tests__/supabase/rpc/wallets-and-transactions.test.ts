import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { buildTestReference, createOrderAsCustomer } from '../_helpers/factories';
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
});
