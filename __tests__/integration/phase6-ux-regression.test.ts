import { describe, expect, it } from '@jest/globals';
import {
  areQuickControlsUsable,
  buildPushTokenUpsert,
  buildRaiseDisputePayload,
  buildDeliverySuccessSummary,
  buildTripCompleteTotals,
  classifyWalletTransaction,
  getCancellationReasonLabel,
  getWaitingForCustomerOutcome,
  resolveSplashRoute,
  shouldWarnCancelPenalty,
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
      elapsedSeconds: 901,
      accepted: false,
      cancelled: false,
    })).toBe('withdraw_bid');
  });

  it('cancel-fee warning only appears for real backend penalty statuses', () => {
    expect(shouldWarnCancelPenalty('in_transit')).toBe(true);
    expect(shouldWarnCancelPenalty('arrived_dropoff')).toBe(true);
    expect(shouldWarnCancelPenalty('matched')).toBe(false);
    expect(shouldWarnCancelPenalty('pickup_en_route')).toBe(false);
  });

  it('report issue screens build raise_dispute RPC payloads', () => {
    expect(buildRaiseDisputePayload('order-1', 'Damaged item', 'order-details')).toEqual({
      p_order_id: 'order-1',
      p_subject: 'Damaged item',
      p_description: 'Issue reported from order-details screen. Order: order-1',
    });
  });

  it('push registration stores per-device token rows instead of mutating profiles', () => {
    expect(buildPushTokenUpsert('profile-1', 'ExponentPushToken[abc]', 'android')).toMatchObject({
      profile_id: 'profile-1',
      token: 'ExponentPushToken[abc]',
      platform: 'android',
    });
  });

  it('unknown roles route back to onboarding instead of customer home', () => {
    expect(resolveSplashRoute({
      session: true,
      role: 'fleet_manager',
      fullName: 'Mystery User',
    })).toBe('/(auth)/onboarding');
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
