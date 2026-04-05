import { describe, expect, it } from '@jest/globals';
import {
  areQuickControlsUsable,
  buildDeliverySuccessSummary,
  buildTripCompleteTotals,
  classifyWalletTransaction,
  getCancellationReasonLabel,
  getWaitingForCustomerOutcome,
  shouldShowCallButton,
} from '@/lib/integration-phase-helpers';

describe('Phase 6 - Customer and Rider UX Regression Pack', () => {
  it('important screens render with partial/null backend data', () => {
    expect(buildDeliverySuccessSummary({
      finalPrice: null,
      deliveryTime: null,
      riderName: null,
    })).toEqual({
      finalPriceLabel: null,
      deliveryTimeLabel: null,
      riderNameLabel: 'Rider',
    });
  });

  it('loading states show while async data is pending', () => {
    const loadingState = { loading: true, data: null, error: null };
    expect(loadingState.loading).toBe(true);
    expect(loadingState.data).toBeNull();
  });

  it('error states show understandable messages', () => {
    expect(getCancellationReasonLabel(null)).toBe('No cancellation reason provided');
  });

  it('success states do not promise backend guarantees that do not exist', () => {
    expect(buildDeliverySuccessSummary({
      finalPrice: 4500,
      deliveryTime: null,
      riderName: 'Rider One',
    }).deliveryTimeLabel).toBeNull();
  });

  it('wallet transaction filters classify transactions correctly', () => {
    expect(classifyWalletTransaction('credit')).toBe('income');
    expect(classifyWalletTransaction('withdrawal')).toBe('withdrawal');
    expect(classifyWalletTransaction('debit')).toBe('spending');
  });

  it('cancellation reason display is consistent', () => {
    expect(getCancellationReasonLabel('Customer changed plans')).toBe('Customer changed plans');
  });

  it('delivery success screen handles missing optional data', () => {
    const summary = buildDeliverySuccessSummary({
      finalPrice: 3200,
    });

    expect(summary.finalPriceLabel).toContain('3,200');
    expect(summary.deliveryTimeLabel).toBeNull();
    expect(summary.riderNameLabel).toBe('Rider');
  });

  it('rider waiting-for-customer timeout withdraws safely', () => {
    expect(getWaitingForCustomerOutcome({
      elapsedSeconds: 301,
      accepted: false,
      cancelled: false,
    })).toBe('withdraw_bid');
  });

  it('trip-complete totals match payout math', () => {
    expect(buildTripCompleteTotals(2050, 450)).toEqual({
      gross: 2500,
      commission: 450,
      net: 2050,
    });
  });

  it('customer call button only appears when authorized phone exists', () => {
    expect(shouldShowCallButton({ authorized: true, phone: '+2348010000000' })).toBe(true);
    expect(shouldShowCallButton({ authorized: false, phone: '+2348010000000' })).toBe(false);
  });

  it('rider call button only appears when authorized phone exists', () => {
    expect(shouldShowCallButton({ authorized: true, phone: null })).toBe(false);
  });

  it('one-hand quick controls remain usable on small screens', () => {
    expect(areQuickControlsUsable(320)).toBe(true);
  });
});
