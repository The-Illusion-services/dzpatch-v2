/**
 * E2E Integration Tests — Full Delivery Loop
 *
 * Simulates the complete lifecycle of a DZpatch delivery:
 *   1.  Customer creates an order (price calc, validation)
 *   2.  Order enters bidding pool (finding rider, countdown)
 *   3.  Rider views job and places a bid
 *   4.  Customer sees live bids and accepts a bid (bid state machine)
 *   5.  Rider navigates to pickup (status: pickup_en_route → arrived_pickup)
 *   6.  Rider confirms arrival, initiates transit (in_transit)
 *   7.  Rider confirms delivery (delivered)
 *   8.  Wallet mutations: rider earnings, commission, customer payment
 *   9.  Customer and rider rate each other
 *   10. Order history + wallet history reflect the completed delivery
 *
 * Pure logic tests — no Expo imports, no network calls.
 */

// ─── Domain types ──────────────────────────────────────────────────────────────

type OrderStatus =
  | 'pending'
  | 'matched'
  | 'pickup_en_route'
  | 'arrived_pickup'
  | 'in_transit'
  | 'arrived_dropoff'
  | 'delivered'
  | 'completed'
  | 'cancelled';

type BidStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';

interface Order {
  id: string;
  status: OrderStatus;
  customer_id: string;
  rider_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  package_size: 'small' | 'medium' | 'large' | 'extra_large';
  dynamic_price: number | null;
  suggested_price: number;
  final_price: number | null;
  distance_km: number;
  created_at: string;
  expires_at: string;
}

interface Bid {
  id: string;
  order_id: string;
  rider_id: string;
  amount: number;
  status: BidStatus;
}

interface Wallet {
  id: string;
  owner_id: string;
  owner_type: 'customer' | 'rider';
  balance: number;
}

// ─── Order Creation Logic ──────────────────────────────────────────────────────

const BASE_PRICES: Record<string, number> = {
  small: 800,
  medium: 1200,
  large: 2000,
  extra_large: 3500,
};
const PRICE_PER_KM = 120;

function calculateSuggestedPrice(packageSize: string, distanceKm: number): number {
  const base = BASE_PRICES[packageSize] ?? 1000;
  return Math.round(base + distanceKm * PRICE_PER_KM);
}

function validateOrderForm(form: {
  pickupAddress: string;
  dropoffAddress: string;
  packageSize: string;
  recipientName: string;
  recipientPhone: string;
}): string[] {
  const errors: string[] = [];
  if (!form.pickupAddress) errors.push('Pickup address is required.');
  if (!form.dropoffAddress) errors.push('Drop-off address is required.');
  if (!form.packageSize) errors.push('Package size is required.');
  if (!form.recipientName) errors.push('Recipient name is required.');
  if (!form.recipientPhone || !/^\+234\d{10}$/.test(form.recipientPhone)) {
    errors.push('Valid Nigerian phone number required (+234XXXXXXXXXX).');
  }
  return errors;
}

// ─── Bid State Machine ─────────────────────────────────────────────────────────

const VALID_BID_TRANSITIONS: Record<BidStatus, BidStatus[]> = {
  pending:   ['accepted', 'rejected', 'countered', 'expired'],
  countered: ['pending', 'rejected', 'expired'],
  accepted:  [],
  rejected:  [],
  expired:   [],
};

function canTransitionBid(from: BidStatus, to: BidStatus): boolean {
  return VALID_BID_TRANSITIONS[from]?.includes(to) ?? false;
}

function sortBidsByAmount(bids: Bid[]): Bid[] {
  return [...bids].sort((a, b) => a.amount - b.amount);
}

function getBestBid(bids: Bid[]): Bid | null {
  const pending = bids.filter((b) => b.status === 'pending');
  return pending.length === 0 ? null : sortBidsByAmount(pending)[0];
}

function acceptBid(bids: Bid[], acceptedBidId: string): Bid[] {
  return bids.map((b) => ({
    ...b,
    status: b.id === acceptedBidId ? 'accepted' : 'rejected',
  })) as Bid[];
}

// ─── Order Status Machine ─────────────────────────────────────────────────────

const VALID_ORDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:         ['matched', 'cancelled'],
  matched:         ['pickup_en_route', 'cancelled'],
  pickup_en_route: ['arrived_pickup', 'cancelled'],
  arrived_pickup:  ['in_transit'],
  in_transit:      ['arrived_dropoff', 'delivered'],
  arrived_dropoff: ['delivered'],
  delivered:       ['completed'],
  completed:       [],
  cancelled:       [],
};

function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

function transitionOrder(order: Order, newStatus: OrderStatus): Order {
  if (!canTransitionOrder(order.status, newStatus)) {
    throw new Error(`Invalid transition: ${order.status} → ${newStatus}`);
  }
  return { ...order, status: newStatus };
}

// ─── Wallet Mutation Logic ─────────────────────────────────────────────────────

const COMMISSION_RATE = 0.18;

function calcCommission(price: number): number {
  return Math.round(price * COMMISSION_RATE);
}

function calcRiderEarnings(price: number): number {
  return Math.round(price * (1 - COMMISSION_RATE));
}

function debitWallet(wallet: Wallet, amount: number): Wallet {
  if (wallet.balance < amount) throw new Error('Insufficient balance');
  return { ...wallet, balance: wallet.balance - amount };
}

function creditWallet(wallet: Wallet, amount: number): Wallet {
  return { ...wallet, balance: wallet.balance + amount };
}

// ─── Rating Logic ─────────────────────────────────────────────────────────────

function validateRating(score: number): string | null {
  if (score < 1 || score > 5) return 'Rating must be 1–5.';
  return null;
}

function updateRiderRating(currentAvg: number, totalRatings: number, newScore: number): number {
  return (currentAvg * totalRatings + newScore) / (totalRatings + 1);
}

// ─── Order History Logic ──────────────────────────────────────────────────────

function filterOrdersByStatus(orders: Order[], status: OrderStatus | 'all'): Order[] {
  if (status === 'all') return orders;
  return orders.filter((o) => o.status === status);
}

function orderSummaryLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    pending:         'Looking for rider',
    matched:         'Rider assigned',
    pickup_en_route: 'Rider heading to pickup',
    arrived_pickup:  'Rider at pickup',
    in_transit:      'In transit',
    arrived_dropoff: 'Almost there',
    delivered:       'Delivered',
    completed:       'Completed',
    cancelled:       'Cancelled',
  };
  return labels[status] ?? status;
}

// ─── Notification trigger logic ───────────────────────────────────────────────

type NotificationEvent =
  | 'order_created'
  | 'bid_received'
  | 'bid_accepted'
  | 'rider_en_route'
  | 'rider_arrived_pickup'
  | 'in_transit'
  | 'delivered'
  | 'payment_received';

function getNotificationTitle(event: NotificationEvent): string {
  const titles: Record<NotificationEvent, string> = {
    order_created:        'Order placed!',
    bid_received:         'New bid on your order',
    bid_accepted:         'Your bid was accepted!',
    rider_en_route:       'Rider is on the way',
    rider_arrived_pickup: 'Rider has arrived',
    in_transit:           'Your package is moving',
    delivered:            'Delivered! 🎉',
    payment_received:     'Payment received',
  };
  return titles[event];
}

function getShouldNotifyCustomer(event: NotificationEvent): boolean {
  return [
    'order_created',
    'bid_received',
    'rider_en_route',
    'rider_arrived_pickup',
    'in_transit',
    'delivered',
    'payment_received',
  ].includes(event);
}

function getShouldNotifyRider(event: NotificationEvent): boolean {
  return ['bid_accepted', 'payment_received'].includes(event);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ── Step 1: Order Creation ─────────────────────────────────────────────────────

describe('E2E Step 1 — Order creation', () => {
  it('calculates suggested price correctly for a medium 5km order', () => {
    // 1200 + 5 * 120 = 1800
    expect(calculateSuggestedPrice('medium', 5)).toBe(1800);
  });

  it('calculates suggested price for large 10km order', () => {
    // 2000 + 10 * 120 = 3200
    expect(calculateSuggestedPrice('large', 10)).toBe(3200);
  });

  it('handles unknown package size with fallback', () => {
    expect(calculateSuggestedPrice('unknown', 3)).toBe(1360); // 1000 + 3*120
  });

  it('validates a complete valid order form', () => {
    const errors = validateOrderForm({
      pickupAddress: '5 Allen Avenue, Ikeja',
      dropoffAddress: '12 Broad Street, Lagos Island',
      packageSize: 'medium',
      recipientName: 'Amaka Obi',
      recipientPhone: '+2348012345678',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects form with missing pickup address', () => {
    const errors = validateOrderForm({
      pickupAddress: '',
      dropoffAddress: '12 Broad Street',
      packageSize: 'small',
      recipientName: 'John',
      recipientPhone: '+23480123456789',
    });
    expect(errors.some((e) => e.includes('Pickup'))).toBe(true);
  });

  it('rejects form with invalid Nigerian phone', () => {
    const errors = validateOrderForm({
      pickupAddress: '5 Allen Avenue',
      dropoffAddress: '12 Broad Street',
      packageSize: 'small',
      recipientName: 'John',
      recipientPhone: '08012345678', // missing +234 prefix
    });
    expect(errors.some((e) => e.includes('phone'))).toBe(true);
  });

  it('rejects form with multiple missing fields', () => {
    const errors = validateOrderForm({
      pickupAddress: '',
      dropoffAddress: '',
      packageSize: '',
      recipientName: '',
      recipientPhone: '',
    });
    expect(errors.length).toBeGreaterThan(2);
  });
});

// ── Step 2-3: Bidding Pool ─────────────────────────────────────────────────────

describe('E2E Step 2-3 — Bidding pool', () => {
  const bids: Bid[] = [
    { id: 'bid-1', order_id: 'order-1', rider_id: 'rider-1', amount: 1800, status: 'pending' },
    { id: 'bid-2', order_id: 'order-1', rider_id: 'rider-2', amount: 1500, status: 'pending' },
    { id: 'bid-3', order_id: 'order-1', rider_id: 'rider-3', amount: 2000, status: 'pending' },
  ];

  it('identifies the best (lowest) bid', () => {
    const best = getBestBid(bids);
    expect(best?.id).toBe('bid-2');
    expect(best?.amount).toBe(1500);
  });

  it('bid transition: pending → accepted is valid', () => {
    expect(canTransitionBid('pending', 'accepted')).toBe(true);
  });

  it('bid transition: pending → countered is valid', () => {
    expect(canTransitionBid('pending', 'countered')).toBe(true);
  });

  it('bid transition: accepted → rejected is invalid (terminal state)', () => {
    expect(canTransitionBid('accepted', 'rejected')).toBe(false);
  });

  it('bid transition: rejected → pending is invalid', () => {
    expect(canTransitionBid('rejected', 'pending')).toBe(false);
  });

  it('accepting a bid rejects all other bids', () => {
    const updated = acceptBid(bids, 'bid-2');
    const accepted = updated.find((b) => b.id === 'bid-2');
    const others = updated.filter((b) => b.id !== 'bid-2');
    expect(accepted?.status).toBe('accepted');
    expect(others.every((b) => b.status === 'rejected')).toBe(true);
  });
});

// ── Step 4: Order Status Transitions ──────────────────────────────────────────

describe('E2E Step 4-7 — Order status machine', () => {
  const baseOrder: Order = {
    id: 'order-1',
    status: 'pending',
    customer_id: 'customer-1',
    rider_id: null,
    pickup_address: '5 Allen Ave, Ikeja',
    dropoff_address: '12 Broad St, Lagos Island',
    package_size: 'medium',
    dynamic_price: null,
    suggested_price: 1800,
    final_price: null,
    distance_km: 5,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900000).toISOString(),
  };

  it('full delivery lifecycle: all transitions are valid', () => {
    const flow: OrderStatus[] = [
      'matched',
      'pickup_en_route',
      'arrived_pickup',
      'in_transit',
      'delivered',
      'completed',
    ];

    let order = { ...baseOrder };
    for (const nextStatus of flow) {
      expect(() => { order = transitionOrder(order, nextStatus); }).not.toThrow();
      expect(order.status).toBe(nextStatus);
    }
  });

  it('cannot skip directly from matched to in_transit', () => {
    const matched = { ...baseOrder, status: 'matched' as OrderStatus };
    expect(canTransitionOrder('matched', 'in_transit')).toBe(false);
    expect(() => transitionOrder(matched, 'in_transit')).toThrow();
  });

  it('cannot transition from completed', () => {
    expect(canTransitionOrder('completed', 'delivered')).toBe(false);
    expect(canTransitionOrder('completed', 'cancelled')).toBe(false);
  });

  it('can cancel from pending', () => {
    expect(canTransitionOrder('pending', 'cancelled')).toBe(true);
  });

  it('can cancel from matched', () => {
    expect(canTransitionOrder('matched', 'cancelled')).toBe(true);
  });

  it('cannot cancel once in_transit', () => {
    expect(canTransitionOrder('in_transit', 'cancelled')).toBe(false);
  });

  it('cannot cancel once delivered', () => {
    expect(canTransitionOrder('delivered', 'cancelled')).toBe(false);
  });
});

// ── Step 8: Wallet Mutations ───────────────────────────────────────────────────

describe('E2E Step 8 — Wallet mutations on delivery completion', () => {
  const customerWallet: Wallet = { id: 'w-cust', owner_id: 'customer-1', owner_type: 'customer', balance: 10000 };
  const riderWallet: Wallet = { id: 'w-rider', owner_id: 'rider-1', owner_type: 'rider', balance: 2000 };
  const finalPrice = 1800;

  it('customer is debited the final price', () => {
    const updated = debitWallet(customerWallet, finalPrice);
    expect(updated.balance).toBe(10000 - 1800);
  });

  it('rider receives earnings (final_price minus commission)', () => {
    const earnings = calcRiderEarnings(finalPrice);
    const updated = creditWallet(riderWallet, earnings);
    expect(updated.balance).toBe(2000 + earnings);
  });

  it('commission + net earnings = final price (within rounding)', () => {
    const commission = calcCommission(finalPrice);
    const earnings = calcRiderEarnings(finalPrice);
    expect(Math.abs(commission + earnings - finalPrice)).toBeLessThanOrEqual(1);
  });

  it('commission is 18% of final price', () => {
    expect(calcCommission(1000)).toBe(180);
    expect(calcCommission(5000)).toBe(900);
  });

  it('throws when customer has insufficient balance', () => {
    const poor = { ...customerWallet, balance: 500 };
    expect(() => debitWallet(poor, finalPrice)).toThrow('Insufficient balance');
  });

  it('wallet balance never goes below 0 after debit', () => {
    const exact = { ...customerWallet, balance: finalPrice };
    const updated = debitWallet(exact, finalPrice);
    expect(updated.balance).toBe(0);
  });

  it('wallet balance constraint: cannot debit below 0', () => {
    const empty = { ...customerWallet, balance: 0 };
    expect(() => debitWallet(empty, 1)).toThrow();
  });
});

// ── Step 9: Ratings ────────────────────────────────────────────────────────────

describe('E2E Step 9 — Ratings', () => {
  it('validates rating score in range 1–5', () => {
    expect(validateRating(1)).toBeNull();
    expect(validateRating(5)).toBeNull();
    expect(validateRating(3)).toBeNull();
  });

  it('rejects rating out of range', () => {
    expect(validateRating(0)).toBeTruthy();
    expect(validateRating(6)).toBeTruthy();
    expect(validateRating(-1)).toBeTruthy();
  });

  it('updates rider average rating correctly', () => {
    // 50 trips, avg 4.5, new rating 5 → new avg = (4.5*50 + 5) / 51
    const newAvg = updateRiderRating(4.5, 50, 5);
    expect(newAvg).toBeCloseTo(4.51, 1);
  });

  it('first rating becomes the average', () => {
    const newAvg = updateRiderRating(0, 0, 4);
    expect(newAvg).toBe(4);
  });

  it('average with single prior rating', () => {
    // Was 5.0, 1 rating, new score 3 → (5 + 3) / 2 = 4
    const newAvg = updateRiderRating(5.0, 1, 3);
    expect(newAvg).toBe(4);
  });
});

// ── Step 10: Order History ─────────────────────────────────────────────────────

describe('E2E Step 10 — Order history', () => {
  const orders: Order[] = [
    { id: 'o1', status: 'completed', customer_id: 'c1', rider_id: 'r1', pickup_address: 'A', dropoff_address: 'B', package_size: 'small', dynamic_price: null, suggested_price: 800, final_price: 800, distance_km: 2, created_at: '2024-06-10T10:00:00Z', expires_at: '2024-06-10T10:15:00Z' },
    { id: 'o2', status: 'cancelled', customer_id: 'c1', rider_id: null, pickup_address: 'C', dropoff_address: 'D', package_size: 'medium', dynamic_price: null, suggested_price: 1200, final_price: null, distance_km: 4, created_at: '2024-06-12T14:00:00Z', expires_at: '2024-06-12T14:15:00Z' },
    { id: 'o3', status: 'delivered', customer_id: 'c1', rider_id: 'r2', pickup_address: 'E', dropoff_address: 'F', package_size: 'large', dynamic_price: null, suggested_price: 2000, final_price: 2000, distance_km: 7, created_at: '2024-06-14T08:00:00Z', expires_at: '2024-06-14T08:15:00Z' },
    { id: 'o4', status: 'pending', customer_id: 'c1', rider_id: null, pickup_address: 'G', dropoff_address: 'H', package_size: 'small', dynamic_price: null, suggested_price: 900, final_price: null, distance_km: 3, created_at: '2024-06-15T09:00:00Z', expires_at: '2024-06-15T09:15:00Z' },
  ];

  it('filters to completed orders only', () => {
    const result = filterOrdersByStatus(orders, 'completed');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('o1');
  });

  it('filters to cancelled orders', () => {
    const result = filterOrdersByStatus(orders, 'cancelled');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('o2');
  });

  it('returns all orders for "all" filter', () => {
    expect(filterOrdersByStatus(orders, 'all')).toHaveLength(4);
  });

  it('returns correct summary labels for each status', () => {
    expect(orderSummaryLabel('pending')).toBe('Looking for rider');
    expect(orderSummaryLabel('matched')).toBe('Rider assigned');
    expect(orderSummaryLabel('pickup_en_route')).toBe('Rider heading to pickup');
    expect(orderSummaryLabel('in_transit')).toBe('In transit');
    expect(orderSummaryLabel('delivered')).toBe('Delivered');
    expect(orderSummaryLabel('completed')).toBe('Completed');
    expect(orderSummaryLabel('cancelled')).toBe('Cancelled');
  });
});

// ── Notification triggers ──────────────────────────────────────────────────────

describe('E2E — Notification triggers', () => {
  it('customer receives notification for all delivery events', () => {
    const customerEvents: NotificationEvent[] = [
      'order_created', 'bid_received', 'rider_en_route',
      'rider_arrived_pickup', 'in_transit', 'delivered', 'payment_received',
    ];
    customerEvents.forEach((event) => {
      expect(getShouldNotifyCustomer(event)).toBe(true);
    });
  });

  it('rider receives notification for bid_accepted and payment_received', () => {
    expect(getShouldNotifyRider('bid_accepted')).toBe(true);
    expect(getShouldNotifyRider('payment_received')).toBe(true);
  });

  it('rider does NOT receive notification for customer-side events', () => {
    expect(getShouldNotifyRider('order_created')).toBe(false);
    expect(getShouldNotifyRider('delivered')).toBe(false);
  });

  it('all notification events have a non-empty title', () => {
    const events: NotificationEvent[] = [
      'order_created', 'bid_received', 'bid_accepted', 'rider_en_route',
      'rider_arrived_pickup', 'in_transit', 'delivered', 'payment_received',
    ];
    events.forEach((event) => {
      expect(getNotificationTitle(event).length).toBeGreaterThan(0);
    });
  });
});

// ── Full delivery narrative ────────────────────────────────────────────────────

describe('E2E — Full delivery loop narrative', () => {
  it('completes a full delivery from order creation to payment', () => {
    // 1. Customer creates order
    const suggestedPrice = calculateSuggestedPrice('medium', 5);
    expect(suggestedPrice).toBe(1800);

    const formErrors = validateOrderForm({
      pickupAddress: '5 Allen Ave',
      dropoffAddress: '12 Broad St',
      packageSize: 'medium',
      recipientName: 'Amaka',
      recipientPhone: '+2348012345678',
    });
    expect(formErrors).toHaveLength(0);

    // 2. Two riders bid
    let bids: Bid[] = [
      { id: 'bid-A', order_id: 'order-X', rider_id: 'rider-A', amount: 1800, status: 'pending' },
      { id: 'bid-B', order_id: 'order-X', rider_id: 'rider-B', amount: 1600, status: 'pending' },
    ];

    const best = getBestBid(bids);
    expect(best?.id).toBe('bid-B');
    expect(best?.amount).toBe(1600);

    // 3. Customer accepts best bid
    bids = acceptBid(bids, 'bid-B');
    expect(bids.find((b) => b.id === 'bid-B')?.status).toBe('accepted');
    expect(bids.find((b) => b.id === 'bid-A')?.status).toBe('rejected');

    // 4. Order goes through full lifecycle
    let order: Order = {
      id: 'order-X', status: 'pending', customer_id: 'customer-1', rider_id: 'rider-B',
      pickup_address: '5 Allen Ave', dropoff_address: '12 Broad St', package_size: 'medium',
      dynamic_price: null, suggested_price: 1800, final_price: 1600, distance_km: 5,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
    };

    const lifecycle: OrderStatus[] = [
      'matched', 'pickup_en_route', 'arrived_pickup', 'in_transit', 'delivered', 'completed',
    ];
    for (const status of lifecycle) {
      order = transitionOrder(order, status);
      expect(order.status).toBe(status);
    }

    // 5. Wallet mutations
    let customerWallet: Wallet = { id: 'w-c', owner_id: 'customer-1', owner_type: 'customer', balance: 5000 };
    let riderWallet: Wallet = { id: 'w-r', owner_id: 'rider-B', owner_type: 'rider', balance: 1000 };
    const finalPrice = order.final_price!;

    customerWallet = debitWallet(customerWallet, finalPrice);
    expect(customerWallet.balance).toBe(5000 - 1600);

    const earnings = calcRiderEarnings(finalPrice);
    const commission = calcCommission(finalPrice);
    riderWallet = creditWallet(riderWallet, earnings);

    expect(riderWallet.balance).toBeGreaterThan(1000);
    expect(Math.abs(earnings + commission - finalPrice)).toBeLessThanOrEqual(1);

    // 6. Customer rates rider 5 stars
    expect(validateRating(5)).toBeNull();
    const newAvg = updateRiderRating(4.5, 99, 5);
    expect(newAvg).toBeGreaterThan(4.5);

    // 7. Order appears in history as completed
    const history = [order];
    expect(filterOrdersByStatus(history, 'completed')).toHaveLength(1);
    expect(orderSummaryLabel('completed')).toBe('Completed');
  });
});
