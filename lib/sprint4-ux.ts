export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.15;

export type WalletGuard = {
  hasEnoughBalance: boolean;
  shortfall: number;
};

export type RiderEarningsBreakdown = {
  gross: number;
  commission: number;
  net: number;
  commissionRate: number | null;
};

export function adjustCurrencyAmount(currentAmount: number, delta: number, floor = 0): number {
  return Math.max(floor, currentAmount + delta);
}

export function buildWalletGuard(balance: number | null | undefined, total: number): WalletGuard {
  const safeBalance = Math.max(0, balance ?? 0);
  const safeTotal = Math.max(0, total);

  return {
    hasEnoughBalance: safeBalance >= safeTotal,
    shortfall: Math.max(0, safeTotal - safeBalance),
  };
}

export function buildRiderEarningsBreakdown(params: {
  gross: number | null | undefined;
  commissionAmount?: number | null;
  commissionRatePercentage?: number | null;
}): RiderEarningsBreakdown {
  const gross = Math.max(0, Math.round(params.gross ?? 0));
  const normalizedRate = params.commissionRatePercentage == null
    ? null
    : Math.max(0, params.commissionRatePercentage) / 100;

  const commission = params.commissionAmount != null
    ? Math.max(0, Math.round(params.commissionAmount))
    : Math.round(gross * (normalizedRate ?? DEFAULT_PLATFORM_COMMISSION_RATE));

  return {
    gross,
    commission,
    net: Math.max(0, gross - commission),
    commissionRate: normalizedRate,
  };
}
