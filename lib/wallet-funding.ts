import { supabase } from '@/lib/supabase';

export const PAYSTACK_CALLBACK_URL = 'https://dzpatch.co/paystack-callback';

const DEFAULT_CONFIRMATION_ATTEMPTS = 8;
const DEFAULT_CONFIRMATION_DELAY_MS = 2000;

type WalletFundingConfirmationResult =
  | { confirmed: true; balance: number | null }
  | { confirmed: false; balance: number | null };

type WalletFundingClient = Pick<typeof supabase, 'from'>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isWalletFundingCallback(url: string) {
  return url.startsWith(PAYSTACK_CALLBACK_URL) || url.includes('paystack.com/complete');
}

export async function fetchWalletBalance(walletId: string, client: WalletFundingClient = supabase) {
  const { data, error } = await client
    .from('wallets')
    .select('balance')
    .eq('id', walletId)
    .single();

  if (error) {
    return null;
  }

  return (data as { balance: number } | null)?.balance ?? null;
}

export async function waitForWalletFundingConfirmation(
  reference: string,
  walletId: string,
  attempts = DEFAULT_CONFIRMATION_ATTEMPTS,
  delayMs = DEFAULT_CONFIRMATION_DELAY_MS,
  client: WalletFundingClient = supabase,
): Promise<WalletFundingConfirmationResult> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await client
      .from('transactions')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('reference', reference)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return {
        confirmed: true,
        balance: await fetchWalletBalance(walletId, client),
      };
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return {
    confirmed: false,
    balance: await fetchWalletBalance(walletId, client),
  };
}
