import { supabase } from '@/lib/supabase';
import type { WalletOwnerType } from '@/types/database';

export type WalletSummary = {
  id: string;
  balance: number;
  created_at: string;
};

export async function fetchLatestOwnedWallet(ownerId: string, ownerType: WalletOwnerType) {
  const { data, error } = await supabase
    .from('wallets')
    .select('id, balance, created_at')
    .eq('owner_id', ownerId)
    .eq('owner_type', ownerType)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    return { wallet: null as WalletSummary | null, error };
  }

  const wallets = (data ?? []) as WalletSummary[];
  if (wallets.length > 1) {
    console.warn(`Multiple ${ownerType} wallets found for owner ${ownerId}; using the most recent wallet.`);
  }

  return {
    wallet: wallets[0] ?? null,
    error: null,
  };
}
