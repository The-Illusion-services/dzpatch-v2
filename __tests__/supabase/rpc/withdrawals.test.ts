import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { buildTestReference } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RPC - Withdrawals', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  async function topUpRiderWallet(amount: number) {
    const credit = await clients.service.rpc('credit_wallet', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: amount,
      p_type: 'credit',
      p_reference: buildTestReference('rider-topup'),
      p_description: 'Withdrawal setup',
    } as any);

    expect(credit.error).toBeNull();
  }

  it('owner can request withdrawal from own wallet and successful request creates withdrawal row', async () => {
    await topUpRiderWallet(2000);

    const walletBefore = await clients.service
      .from('wallets')
      .select('balance')
      .eq('id', seeded.riderWalletId)
      .single();

    const request = await clients.rider.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 500,
      p_bank_name: 'Test Bank',
      p_bank_code: '999',
      p_account_number: '1234567890',
      p_account_name: 'Test Rider',
    } as any);

    expect(request.error).toBeNull();

    const readOwn = await clients.rider
      .from('withdrawals')
      .select('*')
      .eq('id', request.data as string)
      .maybeSingle();
    const walletAfter = await clients.service
      .from('wallets')
      .select('balance')
      .eq('id', seeded.riderWalletId)
      .single();

    expect(readOwn.error).toBeNull();
    expect(readOwn.data?.wallet_id).toBe(seeded.riderWalletId);
    expect(Number(readOwn.data?.withdrawal_fee ?? 0)).toBe(100);
    expect(Number(readOwn.data?.net_payout ?? 0)).toBe(400);
    expect(Number(walletBefore.data?.balance ?? 0) - Number(walletAfter.data?.balance ?? 0)).toBe(500);
  });

  it('user cannot request withdrawal from another wallet and unrelated user cannot read another withdrawal', async () => {
    await topUpRiderWallet(2000);

    const forbidden = await clients.customer.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 300,
      p_bank_name: 'Bad Bank',
      p_bank_code: '999',
      p_account_number: '1111111111',
      p_account_name: 'Intruder',
    } as any);

    expect(forbidden.error !== null || forbidden.data === null).toBe(true);

    const good = await clients.rider.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 300,
      p_bank_name: 'Good Bank',
      p_bank_code: '999',
      p_account_number: '1234567890',
      p_account_name: 'Test Rider',
    } as any);

    expect(good.error).toBeNull();

    const unrelatedRead = await clients.customer
      .from('withdrawals')
      .select('*')
      .eq('id', good.data as string)
      .maybeSingle();

    expect(unrelatedRead.error).toBeNull();
    expect(unrelatedRead.data).toBeNull();
  });

  it('insufficient balance and missing bank details are rejected', async () => {
    const tooLarge = await clients.rider.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 999999,
      p_bank_name: 'Test Bank',
      p_bank_code: '999',
      p_account_number: '1234567890',
      p_account_name: 'Test Rider',
    } as any);

    expect(tooLarge.error).not.toBeNull();

    const missingBank = await clients.rider.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 100,
      p_bank_name: 'Test Bank',
      p_bank_code: '999',
      p_account_name: 'Test Rider',
    } as any);

    expect(missingBank.error).not.toBeNull();
  });

  it('custom withdrawal fee is persisted and fee greater than amount is rejected', async () => {
    await topUpRiderWallet(2000);

    const customFee = await clients.rider.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 900,
      p_bank_name: 'Fee Bank',
      p_bank_code: '999',
      p_account_number: '1234567890',
      p_account_name: 'Test Rider',
      p_fee: 250,
    } as any);

    expect(customFee.error).toBeNull();

    const withdrawal = await clients.service
      .from('withdrawals')
      .select('withdrawal_fee, net_payout')
      .eq('id', customFee.data as string)
      .single();

    expect(Number(withdrawal.data?.withdrawal_fee ?? 0)).toBe(250);
    expect(Number(withdrawal.data?.net_payout ?? 0)).toBe(650);

    const invalidFee = await clients.rider.rpc('request_withdrawal', {
      p_wallet_id: seeded.riderWalletId,
      p_amount: 100,
      p_bank_name: 'Fee Bank',
      p_bank_code: '999',
      p_account_number: '1234567890',
      p_account_name: 'Test Rider',
      p_fee: 150,
    } as any);

    expect(invalidFee.error).not.toBeNull();
  });
});
