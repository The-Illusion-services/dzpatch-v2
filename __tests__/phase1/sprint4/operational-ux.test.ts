import {
  adjustCurrencyAmount,
  buildRiderEarningsBreakdown,
  buildWalletGuard,
} from '@/lib/sprint4-ux';

describe('Sprint 4 operational UX helpers', () => {
  test('adjustCurrencyAmount applies positive deltas', () => {
    expect(adjustCurrencyAmount(2000, 500)).toBe(2500);
  });

  test('adjustCurrencyAmount respects the floor for quick decrements', () => {
    expect(adjustCurrencyAmount(1800, -500, 1600)).toBe(1600);
  });

  test('buildWalletGuard flags shortfall for wallet orders', () => {
    expect(buildWalletGuard(1200, 2000)).toEqual({
      hasEnoughBalance: false,
      shortfall: 800,
    });
  });

  test('buildWalletGuard passes when wallet balance covers total', () => {
    expect(buildWalletGuard(3500, 2000)).toEqual({
      hasEnoughBalance: true,
      shortfall: 0,
    });
  });

  test('buildRiderEarningsBreakdown uses saved commission amount when present', () => {
    expect(buildRiderEarningsBreakdown({
      gross: 4000,
      commissionAmount: 600,
      commissionRatePercentage: 15,
    })).toEqual({
      gross: 4000,
      commission: 600,
      net: 3400,
      commissionRate: 0.15,
    });
  });

  test('buildRiderEarningsBreakdown falls back to commission rate', () => {
    expect(buildRiderEarningsBreakdown({
      gross: 5000,
      commissionRatePercentage: 10,
    })).toEqual({
      gross: 5000,
      commission: 500,
      net: 4500,
      commissionRate: 0.1,
    });
  });
});
