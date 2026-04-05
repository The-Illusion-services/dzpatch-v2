import { describe, expect, it } from '@jest/globals';
import {
  applyRealtimeEntityUpdate,
  cleanupSubscription,
  extractTrackingCoordinates,
  getNavigationTarget,
  getTrackingState,
  registerSubscription,
  resolveFindingRiderState,
  shouldRunPollingFallback,
} from '@/lib/integration-phase-helpers';

describe('Phase 4 - Tracking, Maps, Realtime, and Status Accuracy', () => {
  it('tracking query includes required coordinates', () => {
    expect(extractTrackingCoordinates({
      pickup_lat: 5.1,
      pickup_lng: 8.2,
      dropoff_lat: 5.2,
      dropoff_lng: 8.3,
    })).toEqual({
      hasPickup: true,
      hasDropoff: true,
    });
  });

  it('rider home uses real pickup coordinates', () => {
    expect(getNavigationTarget({
      pickup_lat: 5.9631,
      pickup_lng: 8.3271,
      pickup_address: '123 Calabar Rd',
    })).toEqual({
      mode: 'coordinates',
      latitude: 5.9631,
      longitude: 8.3271,
    });
  });

  it('navigation screens do not fall back to hardcoded coordinates', () => {
    expect(getNavigationTarget({
      pickup_lat: null,
      pickup_lng: null,
      pickup_address: '123 Calabar Rd',
    })).toEqual({
      mode: 'address',
      address: '123 Calabar Rd',
    });
  });

  it('missing coordinates fail gracefully', () => {
    expect(getNavigationTarget({
      pickup_lat: null,
      pickup_lng: null,
      pickup_address: '',
    })).toBeNull();
  });

  it('stale location label appears after threshold', () => {
    expect(getTrackingState(
      new Date('2026-04-02T09:59:40.000Z'),
      new Date('2026-04-02T10:00:00.000Z'),
      15,
    )).toEqual({
      stale: true,
      label: 'Last updated 20s ago',
    });
  });

  it('stale location clears when updates resume', () => {
    expect(getTrackingState(
      new Date('2026-04-02T09:59:55.000Z'),
      new Date('2026-04-02T10:00:00.000Z'),
      15,
    )).toEqual({
      stale: false,
      label: 'Live',
    });
  });

  it('customer sees last-updated state when rider signal goes quiet', () => {
    expect(getTrackingState(
      new Date('2026-04-02T09:58:30.000Z'),
      new Date('2026-04-02T10:00:00.000Z'),
      15,
    ).label).toContain('Last updated');
  });

  it('realtime order status subscription updates state correctly', () => {
    expect(applyRealtimeEntityUpdate([{ id: 'order-1', status: 'pending' }], { id: 'order-1', status: 'matched' }))
      .toEqual([{ id: 'order-1', status: 'matched' }]);
  });

  it('customer receives accepted bid update in realtime', () => {
    expect(applyRealtimeEntityUpdate([{ id: 'bid-1', status: 'pending' }], { id: 'bid-1', status: 'accepted' }))
      .toEqual([{ id: 'bid-1', status: 'accepted' }]);
  });

  it('rider receives counter-offer update in realtime', () => {
    expect(applyRealtimeEntityUpdate([{ id: 'bid-1', status: 'pending', amount: 2000 }], {
      id: 'bid-1',
      status: 'countered',
      amount: 1800,
    })).toEqual([{ id: 'bid-1', status: 'countered', amount: 1800 }]);
  });

  it('duplicate subscriptions are not created on re-render', () => {
    expect(registerSubscription(registerSubscription([], 'orders:1'), 'orders:1')).toEqual([
      { key: 'orders:1', active: true },
    ]);
  });

  it('subscription cleanup occurs on unmount', () => {
    expect(cleanupSubscription([{ key: 'orders:1', active: true }], 'orders:1')).toEqual([
      { key: 'orders:1', active: false },
    ]);
  });

  it('polling fallback does not conflict with realtime', () => {
    expect(shouldRunPollingFallback({
      hasRealtimeSubscription: true,
      lastRealtimeUpdateAt: new Date('2026-04-02T09:59:58.000Z'),
      now: new Date('2026-04-02T10:00:00.000Z'),
      pollIntervalMs: 5000,
    })).toBe(false);
  });

  it('expired order state appears correctly in finding-rider flow', () => {
    expect(resolveFindingRiderState({
      status: 'pending',
      hasPendingBids: false,
      expired: true,
    })).toBe('expired');
  });
});
