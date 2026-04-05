export interface PaystackWebhookEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface CreditWalletRpcArgs {
  p_wallet_id: string;
  p_amount: number;
  p_type: 'credit';
  p_reference: string;
  p_description: string;
  p_metadata: Record<string, unknown>;
}

type ChargeSuccessData = {
  reference: string;
  amount: number;
  metadata?: {
    wallet_id?: string;
    user_id?: string;
  } | null;
} & Record<string, unknown>;

export type WebhookAction =
  | {
      type: 'credit_wallet';
      walletId: string;
      reference: string;
      nairaAmount: number;
      args: CreditWalletRpcArgs;
    }
  | {
      type: 'update_withdrawal';
      transferCode: string;
      updates: {
        status: 'completed' | 'rejected';
        processed_at: string;
        rejection_reason?: string;
      };
    }
  | {
      type: 'ignore';
      reason: 'missing_wallet_id' | 'missing_transfer_code' | 'unsupported_event';
    };

export function parsePaystackWebhookBody(rawBody: string):
  | { ok: true; event: PaystackWebhookEvent }
  | { ok: false; status: 400; error: 'invalid_json' } {
  try {
    return {
      ok: true,
      event: JSON.parse(rawBody) as PaystackWebhookEvent,
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'invalid_json',
    };
  }
}

export function buildWalletCreditRpcArgs(data: ChargeSuccessData): CreditWalletRpcArgs | null {
  const walletId = data.metadata?.wallet_id;
  if (!walletId) {
    return null;
  }

  return {
    p_wallet_id: walletId,
    p_amount: data.amount / 100,
    p_type: 'credit',
    p_reference: data.reference,
    p_description: 'Wallet top-up via Paystack',
    p_metadata: data,
  };
}

export function isDuplicateCreditWalletError(error: { code?: string } | null | undefined) {
  return error?.code === '23505';
}

export function getWebhookAction(
  event: PaystackWebhookEvent,
  processedAt = new Date().toISOString(),
): WebhookAction {
  if (event.event === 'charge.success') {
    const data = event.data as ChargeSuccessData;
    const args = buildWalletCreditRpcArgs(data);

    if (!args) {
      return { type: 'ignore', reason: 'missing_wallet_id' };
    }

    return {
      type: 'credit_wallet',
      walletId: args.p_wallet_id,
      reference: args.p_reference,
      nairaAmount: args.p_amount,
      args,
    };
  }

  const transferCode = typeof event.data.transfer_code === 'string' ? event.data.transfer_code : null;
  if (!transferCode && event.event.startsWith('transfer.')) {
    return { type: 'ignore', reason: 'missing_transfer_code' };
  }

  if (event.event === 'transfer.success' && transferCode) {
    return {
      type: 'update_withdrawal',
      transferCode,
      updates: {
        status: 'completed',
        processed_at: processedAt,
      },
    };
  }

  if ((event.event === 'transfer.failed' || event.event === 'transfer.reversed') && transferCode) {
    return {
      type: 'update_withdrawal',
      transferCode,
      updates: {
        status: 'rejected',
        processed_at: processedAt,
        rejection_reason: `Paystack ${event.event}`,
      },
    };
  }

  return { type: 'ignore', reason: 'unsupported_event' };
}
