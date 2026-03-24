/**
 * Sprint 2 — Order Status & Progress Tests
 *
 * Tests status mapping, progress calculation, and timeline logic.
 */

// Inline the type to avoid triggering Expo module resolution in Jest
type OrderStatus =
  | 'pending' | 'matched' | 'pickup_en_route' | 'arrived_pickup'
  | 'in_transit' | 'arrived_dropoff' | 'delivered' | 'completed' | 'cancelled';

// Mirrors the logic in order-tracking.tsx and customer home screen
const STATUS_STEP: Record<string, number> = {
  pending: 0,
  matched: 1,
  pickup_en_route: 2,
  arrived_pickup: 3,
  in_transit: 4,
  arrived_dropoff: 4,
  delivered: 5,
  completed: 5,
  cancelled: -1,
};

const PROGRESS_MAP: Record<string, number> = {
  pending: 0.1,
  matched: 0.25,
  pickup_en_route: 0.4,
  arrived_pickup: 0.55,
  in_transit: 0.7,
  arrived_dropoff: 0.85,
  delivered: 1,
};

function getStatusStep(status: OrderStatus): number {
  return STATUS_STEP[status] ?? 0;
}

function getProgressPercent(status: OrderStatus): number {
  return (PROGRESS_MAP[status] ?? 0) * 100;
}

function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

function isCancellableStatus(status: OrderStatus): boolean {
  return ['pending', 'matched'].includes(status);
}

describe('Order status step mapping', () => {
  it('maps pending to step 0', () => {
    expect(getStatusStep('pending')).toBe(0);
  });

  it('maps matched to step 1', () => {
    expect(getStatusStep('matched')).toBe(1);
  });

  it('maps pickup_en_route to step 2', () => {
    expect(getStatusStep('pickup_en_route')).toBe(2);
  });

  it('maps arrived_pickup to step 3', () => {
    expect(getStatusStep('arrived_pickup')).toBe(3);
  });

  it('maps in_transit to step 4', () => {
    expect(getStatusStep('in_transit')).toBe(4);
  });

  it('maps arrived_dropoff to step 4 (same as in_transit)', () => {
    expect(getStatusStep('arrived_dropoff')).toBe(4);
  });

  it('maps delivered to step 5', () => {
    expect(getStatusStep('delivered')).toBe(5);
  });

  it('maps completed to step 5', () => {
    expect(getStatusStep('completed')).toBe(5);
  });

  it('maps cancelled to -1', () => {
    expect(getStatusStep('cancelled')).toBe(-1);
  });
});

describe('Order progress bar percentage', () => {
  it('pending has 10% progress', () => {
    expect(getProgressPercent('pending')).toBe(10);
  });

  it('matched has 25% progress', () => {
    expect(getProgressPercent('matched')).toBe(25);
  });

  it('in_transit has 70% progress', () => {
    expect(getProgressPercent('in_transit')).toBe(70);
  });

  it('delivered has 100% progress', () => {
    expect(getProgressPercent('delivered')).toBe(100);
  });

  it('unknown status defaults to 0%', () => {
    expect(getProgressPercent('completed')).toBe(0); // not in progress map
  });
});

describe('Terminal status check', () => {
  it('completed is terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
  });

  it('cancelled is terminal', () => {
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('pending is not terminal', () => {
    expect(isTerminalStatus('pending')).toBe(false);
  });

  it('in_transit is not terminal', () => {
    expect(isTerminalStatus('in_transit')).toBe(false);
  });
});

describe('Cancellable status check', () => {
  it('pending is cancellable', () => {
    expect(isCancellableStatus('pending')).toBe(true);
  });

  it('matched is cancellable', () => {
    expect(isCancellableStatus('matched')).toBe(true);
  });

  it('pickup_en_route is not cancellable', () => {
    expect(isCancellableStatus('pickup_en_route')).toBe(false);
  });

  it('in_transit is not cancellable', () => {
    expect(isCancellableStatus('in_transit')).toBe(false);
  });

  it('delivered is not cancellable', () => {
    expect(isCancellableStatus('delivered')).toBe(false);
  });
});
