import { describe, expect, it } from '@jest/globals';
import {
  applyBidQuickAdjustment,
  calculateOrderPreview,
  getCounterRoundLabel,
  getMarketAverageBid,
  sendCounterOffer,
} from '@/lib/integration-phase-helpers';
import { buildRiderEarningsBreakdown } from '@/lib/sprint4-ux';

const rule = {
  base_rate: 500,
  per_km_rate: 100,
  min_price: 500,
  vat_percentage: 7.5,
  surge_multiplier: 1,
} as const;

describe('Phase 3 - Orders, Negotiation, and Pricing UX', () => {
  it('create order with wallet payment blocks on insufficient balance', () => {
    const preview = calculateOrderPreview({
      rule,
      distanceKm: 5,
      size: 'small',
      walletBalance: 100,
      paymentMethod: 'wallet',
      promo: null,
    });

    expect(preview.canSubmit).toBe(false);
    expect(preview.error).toContain('Insufficient wallet balance');
  });

  it('create order with cash payment bypasses wallet guardrail', () => {
    const preview = calculateOrderPreview({
      rule,
      distanceKm: 5,
      size: 'small',
      walletBalance: 0,
      paymentMethod: 'cash',
      promo: null,
    });

    expect(preview.canSubmit).toBe(true);
    expect(preview.error).toBeNull();
  });

  it('promo code recalculates total correctly', () => {
    const preview = calculateOrderPreview({
      rule,
      distanceKm: 5,
      size: 'small',
      walletBalance: 5000,
      paymentMethod: 'wallet',
      promo: {
        code: 'SAVE10',
        discount_type: 'percentage',
        discount_value: 10,
      },
    });

    expect(preview.discount).toBe(100);
    expect(preview.total).toBe(975);
    expect(preview.promoApplied).toBe(true);
  });

  it('invalid promo code does not corrupt pricing state', () => {
    const preview = calculateOrderPreview({
      rule,
      distanceKm: 2,
      size: 'small',
      walletBalance: 5000,
      paymentMethod: 'wallet',
      promo: {
        code: 'BIGSAVE',
        discount_type: 'flat',
        discount_value: 300,
        min_order_amount: 1000,
      },
    });

    expect(preview.discount).toBe(0);
    expect(preview.promoApplied).toBe(false);
    expect(preview.promoError).toContain('Min order');
  });

  it('quick counter controls respect customer minimum floor', () => {
    expect(applyBidQuickAdjustment(1000, -200, 900)).toBe(900);
  });

  it('rider quick bid chips apply increments/decrements correctly', () => {
    expect(applyBidQuickAdjustment(1500, 200)).toBe(1700);
    expect(applyBidQuickAdjustment(1500, -100)).toBe(1400);
  });

  it('rider market average control sets expected value', () => {
    expect(getMarketAverageBid(1825.6)).toBe(1826);
  });

  it('round 1 to 2 counter-offer works', () => {
    const result = sendCounterOffer([
      {
        id: 'bid-1',
        order_id: 'order-1',
        rider_id: 'rider-1',
        amount: 2000,
        status: 'pending',
        negotiation_round: 1,
        parent_bid_id: null,
      },
    ], 'bid-1', 1900);

    expect(result.error).toBeNull();
    expect(result.newBid?.negotiation_round).toBe(2);
  });

  it('round 2 to 3 counter-offer works', () => {
    const result = sendCounterOffer([
      {
        id: 'bid-1',
        order_id: 'order-1',
        rider_id: 'rider-1',
        amount: 2000,
        status: 'countered',
        negotiation_round: 1,
        parent_bid_id: null,
      },
      {
        id: 'bid-2',
        order_id: 'order-1',
        rider_id: 'rider-1',
        amount: 1900,
        status: 'pending',
        negotiation_round: 2,
        parent_bid_id: 'bid-1',
      },
    ], 'bid-2', 1800);

    expect(result.error).toBeNull();
    expect(result.newBid?.negotiation_round).toBe(3);
  });

  it('round 3 further counter-offers are blocked', () => {
    const result = sendCounterOffer([
      {
        id: 'bid-1',
        order_id: 'order-1',
        rider_id: 'rider-1',
        amount: 2000,
        status: 'countered',
        negotiation_round: 1,
        parent_bid_id: null,
      },
      {
        id: 'bid-2',
        order_id: 'order-1',
        rider_id: 'rider-1',
        amount: 1900,
        status: 'countered',
        negotiation_round: 2,
        parent_bid_id: 'bid-1',
      },
      {
        id: 'bid-3',
        order_id: 'order-1',
        rider_id: 'rider-1',
        amount: 1800,
        status: 'pending',
        negotiation_round: 3,
        parent_bid_id: 'bid-2',
      },
    ], 'bid-3', 1700);

    expect(result.newBid).toBeNull();
    expect(result.error).toContain('Maximum 3 negotiation rounds');
  });

  it('final-round messaging is correct', () => {
    expect(getCounterRoundLabel(3)).toBe('Final round - no more counters after this');
  });

  it('rider take-home breakdown shows correct gross, commission, net', () => {
    const breakdown = buildRiderEarningsBreakdown({
      gross: 2500,
      commissionRatePercentage: 18,
    });

    expect(breakdown).toEqual({
      gross: 2500,
      commission: 450,
      net: 2050,
      commissionRate: 0.18,
    });
  });

  it('customer low-balance warning appears before submission', () => {
    const preview = calculateOrderPreview({
      rule,
      distanceKm: 10,
      size: 'large',
      walletBalance: 500,
      paymentMethod: 'wallet',
      promo: null,
    });

    expect(preview.walletGuard.shortfall).toBeGreaterThan(0);
    expect(preview.error).toContain('Top up');
  });
});
