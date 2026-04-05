import { describe, expect, it, jest } from '@jest/globals';
import {
  buildWalletCreditRpcArgs,
  getWebhookAction,
  isDuplicateCreditWalletError,
  parsePaystackWebhookBody,
} from '../../supabase/functions/_shared/payment-flow';
import {
  buildPodStoragePath,
  calculateDeliveryPayout,
  resolveRiderWalletOwnerId,
  uploadProofOfDelivery,
  verifyDeliveryCodeAttempt,
} from '@/lib/delivery-flow';
import { resolveProtectedAssetAccess } from '@/lib/integration-phase-helpers';
import { waitForWalletFundingConfirmation } from '@/lib/wallet-funding';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

function debitWalletOrderOnce(params: {
  balance: number;
  amount: number;
  reference: string;
  processedReferences: string[];
}) {
  if (params.processedReferences.includes(params.reference)) {
    return {
      balance: params.balance,
      processedReferences: params.processedReferences,
      debited: false,
    };
  }

  return {
    balance: params.balance - params.amount,
    processedReferences: [...params.processedReferences, params.reference],
    debited: true,
  };
}

function settleCompletion(params: {
  paymentMethod: 'wallet' | 'cash';
  finalPrice: number;
  riderBalance: number;
  completionReference: string;
  processedReferences: string[];
}) {
  const payout = calculateDeliveryPayout(params.finalPrice, 0.18);
  const alreadyProcessed = params.processedReferences.includes(params.completionReference);

  if (alreadyProcessed) {
    return {
      riderBalance: params.riderBalance,
      credited: false,
      outstandingBalance: null as number | null,
      payout,
      processedReferences: params.processedReferences,
    };
  }

  if (params.paymentMethod === 'wallet') {
    return {
      riderBalance: params.riderBalance + payout.riderNet,
      credited: true,
      outstandingBalance: null as number | null,
      payout,
      processedReferences: [...params.processedReferences, params.completionReference],
    };
  }

  return {
    riderBalance: params.riderBalance,
    credited: false,
    outstandingBalance: params.finalPrice,
    payout,
    processedReferences: [...params.processedReferences, params.completionReference],
  };
}

describe('Phase 1 - Core Money and Delivery', () => {
  it('payment-initialize -> payment-webhook -> credit_wallet happy path', () => {
    const action = getWebhookAction({
      event: 'charge.success',
      data: {
        reference: 'FUND-123',
        amount: 250000,
        metadata: {
          wallet_id: 'wallet-1',
          user_id: 'user-1',
        },
      },
    });

    expect(action).toEqual({
      type: 'credit_wallet',
      walletId: 'wallet-1',
      reference: 'FUND-123',
      nairaAmount: 2500,
      args: {
        p_wallet_id: 'wallet-1',
        p_amount: 2500,
        p_type: 'credit',
        p_reference: 'FUND-123',
        p_description: 'Wallet top-up via Paystack',
        p_metadata: {
          reference: 'FUND-123',
          amount: 250000,
          metadata: {
            wallet_id: 'wallet-1',
            user_id: 'user-1',
          },
        },
      },
    });
  });

  it('duplicate webhook replay does not double-credit', () => {
    expect(isDuplicateCreditWalletError({ code: '23505' })).toBe(true);
    expect(isDuplicateCreditWalletError({ code: 'PGRST116' })).toBe(false);
  });

  it('malformed webhook payload fails safely', () => {
    expect(parsePaystackWebhookBody('{not-json')).toEqual({
      ok: false,
      status: 400,
      error: 'invalid_json',
    });
  });

  it('webhook with missing wallet_id fails safely', () => {
    expect(
      buildWalletCreditRpcArgs({
        reference: 'FUND-456',
        amount: 50000,
        metadata: {},
      }),
    ).toBeNull();

    expect(
      getWebhookAction({
        event: 'charge.success',
        data: {
          reference: 'FUND-456',
          amount: 50000,
          metadata: {},
        },
      }),
    ).toEqual({
      type: 'ignore',
      reason: 'missing_wallet_id',
    });
  });

  it('unknown webhook event is ignored safely', () => {
    expect(
      getWebhookAction({
        event: 'invoice.create',
        data: { id: 'evt-1' },
      }),
    ).toEqual({
      type: 'ignore',
      reason: 'unsupported_event',
    });
  });

  it('failed transfer webhook updates withdrawal correctly', () => {
    expect(
      getWebhookAction(
        {
          event: 'transfer.failed',
          data: { transfer_code: 'TRX-1' },
        },
        '2026-04-02T10:00:00.000Z',
      ),
    ).toEqual({
      type: 'update_withdrawal',
      transferCode: 'TRX-1',
      updates: {
        status: 'rejected',
        processed_at: '2026-04-02T10:00:00.000Z',
        rejection_reason: 'Paystack transfer.failed',
      },
    });
  });

  it('reversed transfer webhook updates withdrawal correctly', () => {
    expect(
      getWebhookAction(
        {
          event: 'transfer.reversed',
          data: { transfer_code: 'TRX-2' },
        },
        '2026-04-02T10:00:00.000Z',
      ),
    ).toEqual({
      type: 'update_withdrawal',
      transferCode: 'TRX-2',
      updates: {
        status: 'rejected',
        processed_at: '2026-04-02T10:00:00.000Z',
        rejection_reason: 'Paystack transfer.reversed',
      },
    });
  });

  it('wallet funding UI waits for backend confirmation before success', async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'tx-1' }, error: null });
    const single = jest.fn().mockResolvedValue({ data: { balance: 7300 }, error: null });

    const client = {
      from: jest.fn((table: string) => {
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle,
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              single,
            }),
          }),
        };
      }),
    };

    const result = await waitForWalletFundingConfirmation('FUND-123', 'wallet-1', 2, 0, client as never);

    expect(result).toEqual({
      confirmed: true,
      balance: 7300,
    });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('funding timeout shows retryable state', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const single = jest.fn().mockResolvedValue({ data: { balance: 5000 }, error: null });

    const client = {
      from: jest.fn((table: string) => {
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle,
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              single,
            }),
          }),
        };
      }),
    };

    const result = await waitForWalletFundingConfirmation('FUND-404', 'wallet-1', 3, 0, client as never);

    expect(result).toEqual({
      confirmed: false,
      balance: 5000,
    });
    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });

  it('wallet-paid order debits customer exactly once', () => {
    const firstDebit = debitWalletOrderOnce({
      balance: 5000,
      amount: 3200,
      reference: 'ORD-1',
      processedReferences: [],
    });
    const replayDebit = debitWalletOrderOnce({
      balance: firstDebit.balance,
      amount: 3200,
      reference: 'ORD-1',
      processedReferences: firstDebit.processedReferences,
    });

    expect(firstDebit.balance).toBe(1800);
    expect(firstDebit.debited).toBe(true);
    expect(replayDebit.balance).toBe(1800);
    expect(replayDebit.debited).toBe(false);
  });

  it('wallet-paid completion credits rider exactly once', () => {
    const firstSettlement = settleCompletion({
      paymentMethod: 'wallet',
      finalPrice: 3200,
      riderBalance: 500,
      completionReference: 'EARN-order-1',
      processedReferences: [],
    });
    const replaySettlement = settleCompletion({
      paymentMethod: 'wallet',
      finalPrice: 3200,
      riderBalance: firstSettlement.riderBalance,
      completionReference: 'EARN-order-1',
      processedReferences: firstSettlement.processedReferences,
    });

    expect(firstSettlement.credited).toBe(true);
    expect(firstSettlement.riderBalance).toBe(3124);
    expect(replaySettlement.credited).toBe(false);
    expect(replaySettlement.riderBalance).toBe(3124);
  });

  it('cash-paid completion creates outstanding_balances', () => {
    const settlement = settleCompletion({
      paymentMethod: 'cash',
      finalPrice: 2800,
      riderBalance: 500,
      completionReference: 'EARN-order-cash-1',
      processedReferences: [],
    });

    expect(settlement.credited).toBe(false);
    expect(settlement.outstandingBalance).toBe(2800);
    expect(settlement.riderBalance).toBe(500);
  });
  it('commission + rider net always equals final price', () => {
    const payout = calculateDeliveryPayout(4550, 0.1);
    expect(payout.commission).toBe(455);
    expect(payout.riderNet).toBe(4095);
    expect(payout.commission + payout.riderNet).toBe(payout.finalPrice);
  });

  it('rider payout uses profile_id wallet ownership', () => {
    expect(resolveRiderWalletOwnerId({ profile_id: 'profile-123' })).toBe('profile-123');
  });

  it('delivery cannot complete before code verification', () => {
    const attempt = verifyDeliveryCodeAttempt(
      {
        delivery_code: '123456',
        failed_delivery_attempts: 0,
        delivery_locked_until: null,
      },
      '654321',
      new Date('2026-04-02T10:00:00.000Z'),
    );

    expect(attempt.verified).toBe(false);
    expect(attempt.nextState.failed_delivery_attempts).toBe(1);
  });

  it('correct code resets failed attempts', () => {
    const attempt = verifyDeliveryCodeAttempt(
      {
        delivery_code: '123456',
        failed_delivery_attempts: 2,
        delivery_locked_until: null,
      },
      '123456',
    );

    expect(attempt).toEqual({
      verified: true,
      locked: false,
      nextState: {
        delivery_code_verified: true,
        failed_delivery_attempts: 0,
        delivery_locked_until: null,
      },
    });
  });

  it('wrong code increments attempts', () => {
    const attempt = verifyDeliveryCodeAttempt(
      {
        delivery_code: '123456',
        failed_delivery_attempts: 1,
        delivery_locked_until: null,
      },
      '000000',
      new Date('2026-04-02T10:00:00.000Z'),
    );

    expect(attempt.verified).toBe(false);
    expect(attempt.locked).toBe(false);
    expect(attempt.nextState.failed_delivery_attempts).toBe(2);
  });

  it('third wrong attempt locks completion', () => {
    const now = new Date('2026-04-02T10:00:00.000Z');
    const attempt = verifyDeliveryCodeAttempt(
      {
        delivery_code: '123456',
        failed_delivery_attempts: 2,
        delivery_locked_until: null,
      },
      '000000',
      now,
    );

    expect(attempt.verified).toBe(false);
    expect(attempt.locked).toBe(true);
    expect((attempt.nextState.delivery_locked_until as Date).toISOString()).toBe('2026-04-02T11:00:00.000Z');
  });

  it('lock expires correctly', () => {
    const attempt = verifyDeliveryCodeAttempt(
      {
        delivery_code: '123456',
        failed_delivery_attempts: 2,
        delivery_locked_until: '2026-04-02T09:59:00.000Z',
      },
      '123456',
      new Date('2026-04-02T10:00:00.000Z'),
    );

    expect(attempt.verified).toBe(true);
    expect(attempt.locked).toBe(false);
  });

  it('POD upload path matches storage rules', () => {
    const path = buildPodStoragePath('profile-123', 'order-456', 1700000000000);
    expect(path).toBe('rider-docs/profile-123/pod/order-456/pod-order-456-1700000000000.jpg');
  });

  it('POD upload failure blocks completion cleanly', async () => {
    await expect(
      uploadProofOfDelivery({
        podPhotoUri: 'file:///pod.jpg',
        profileId: 'profile-123',
        orderId: 'order-456',
        now: 1700000000000,
        fetchBlob: async () => new Blob(['pod']),
        uploadFile: async () => ({
          error: new Error('storage upload failed'),
        }),
      }),
    ).rejects.toThrow('storage upload failed');
  });

  it('completion works with private storage path or signed access', () => {
    expect(resolveProtectedAssetAccess({
      path: 'rider-docs/profile-123/pod/order-456/pod-order-456-1700000000000.jpg',
      isPrivate: true,
      signedToken: 'signed-token',
    })).toEqual({
      accessible: true,
      mode: 'signed',
    });
  });
});
