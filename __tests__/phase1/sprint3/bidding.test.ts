/**
 * Sprint 3 — Bidding Engine Logic Tests
 *
 * Tests bid sorting, counter-offer validation, and bid state transitions
 * without a running Supabase instance.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type BidStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';

type Bid = {
  id: string;
  rider_id: string;
  amount: number;
  status: BidStatus;
  rider_name: string;
  rider_rating: number;
  rider_trips: number;
};

// ─── Helpers (mirrors live-bidding.tsx logic) ─────────────────────────────────

function sortBidsByAmount(bids: Bid[]): Bid[] {
  return [...bids].sort((a, b) => a.amount - b.amount);
}

function getBestBid(bids: Bid[]): Bid | null {
  const pending = bids.filter((b) => b.status === 'pending');
  if (pending.length === 0) return null;
  return sortBidsByAmount(pending)[0];
}

function validateCounterOffer(
  counterAmount: number,
  originalBidAmount: number
): string | null {
  const minimum = Math.round(originalBidAmount * 0.8);
  if (counterAmount <= 0) return 'Enter a valid amount';
  if (counterAmount < minimum) {
    return `Minimum counter is ₦${minimum.toLocaleString()} (20% below rider's bid)`;
  }
  if (counterAmount >= originalBidAmount) {
    return `Counter must be lower than rider's bid (₦${originalBidAmount.toLocaleString()})`;
  }
  return null;
}

function filterPendingBids(bids: Bid[]): Bid[] {
  return bids.filter((b) => b.status === 'pending');
}

function removeBid(bids: Bid[], bidId: string): Bid[] {
  return bids.filter((b) => b.id !== bidId);
}

function addOrUpdateBid(bids: Bid[], incoming: Bid): Bid[] {
  const exists = bids.find((b) => b.id === incoming.id);
  if (exists) return bids.map((b) => (b.id === incoming.id ? incoming : b));
  return sortBidsByAmount([...bids, incoming]);
}

// ─── Timer helpers (mirrors finding-rider.tsx / live-bidding.tsx) ─────────────

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function isOrderExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const bidA: Bid = { id: 'b1', rider_id: 'r1', amount: 1200, status: 'pending', rider_name: 'John', rider_rating: 4.8, rider_trips: 120 };
const bidB: Bid = { id: 'b2', rider_id: 'r2', amount: 900, status: 'pending', rider_name: 'Emeka', rider_rating: 4.6, rider_trips: 80 };
const bidC: Bid = { id: 'b3', rider_id: 'r3', amount: 1500, status: 'countered', rider_name: 'Tunde', rider_rating: 4.9, rider_trips: 200 };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Bid sorting', () => {
  it('sorts bids by amount ascending (lowest first)', () => {
    const sorted = sortBidsByAmount([bidA, bidB]);
    expect(sorted[0].amount).toBe(900);
    expect(sorted[1].amount).toBe(1200);
  });

  it('returns same array when already sorted', () => {
    const sorted = sortBidsByAmount([bidB, bidA]);
    expect(sorted[0].id).toBe('b2');
  });

  it('does not mutate the original array', () => {
    const original = [bidA, bidB];
    sortBidsByAmount(original);
    expect(original[0].id).toBe('b1');
  });
});

describe('Best bid selection', () => {
  it('returns lowest pending bid', () => {
    const best = getBestBid([bidA, bidB, bidC]);
    expect(best?.id).toBe('b2');
  });

  it('ignores non-pending bids', () => {
    const best = getBestBid([bidC]);
    expect(best).toBeNull();
  });

  it('returns null when no bids', () => {
    expect(getBestBid([])).toBeNull();
  });

  it('returns only bid when one pending', () => {
    const best = getBestBid([bidA]);
    expect(best?.id).toBe('b1');
  });
});

describe('Counter-offer validation', () => {
  const riderBid = 1200;

  it('accepts a valid counter (between min and bid)', () => {
    expect(validateCounterOffer(1000, riderBid)).toBeNull();
  });

  it('rejects zero amount', () => {
    expect(validateCounterOffer(0, riderBid)).toBe('Enter a valid amount');
  });

  it('rejects negative amount', () => {
    expect(validateCounterOffer(-100, riderBid)).toBe('Enter a valid amount');
  });

  it('rejects counter equal to rider bid', () => {
    expect(validateCounterOffer(1200, riderBid)).toMatch("Counter must be lower");
  });

  it('rejects counter above rider bid', () => {
    expect(validateCounterOffer(1500, riderBid)).toMatch("Counter must be lower");
  });

  it('rejects counter below 80% of rider bid', () => {
    // min = round(1200 * 0.8) = 960
    expect(validateCounterOffer(900, riderBid)).toMatch("Minimum counter");
  });

  it('accepts counter at exactly the minimum (80%)', () => {
    const min = Math.round(riderBid * 0.8); // 960
    expect(validateCounterOffer(min, riderBid)).toBeNull();
  });

  it('minimum is 20% below original bid', () => {
    const min = Math.round(riderBid * 0.8);
    expect(min).toBe(960);
  });
});

describe('Bid list management', () => {
  it('filters to only pending bids', () => {
    const pending = filterPendingBids([bidA, bidB, bidC]);
    expect(pending).toHaveLength(2);
    expect(pending.every((b) => b.status === 'pending')).toBe(true);
  });

  it('removes bid by id', () => {
    const updated = removeBid([bidA, bidB], 'b1');
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('b2');
  });

  it('addOrUpdateBid: adds new bid and keeps sort order', () => {
    const newBid: Bid = { ...bidA, id: 'b4', amount: 800 };
    const result = addOrUpdateBid([bidA, bidB], newBid);
    expect(result[0].amount).toBe(800);
    expect(result).toHaveLength(3);
  });

  it('addOrUpdateBid: updates existing bid in place', () => {
    const updated: Bid = { ...bidA, amount: 1100, status: 'countered' };
    const result = addOrUpdateBid([bidA, bidB], updated);
    expect(result.find((b) => b.id === 'b1')?.amount).toBe(1100);
    expect(result).toHaveLength(2);
  });

  it('does not add duplicate bid', () => {
    const result = addOrUpdateBid([bidA], bidA);
    expect(result).toHaveLength(1);
  });
});

describe('Countdown timer formatting', () => {
  it('formats 120 seconds as 02:00', () => {
    expect(formatCountdown(120)).toBe('02:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatCountdown(90)).toBe('01:30');
  });

  it('formats 0 seconds as 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatCountdown(65)).toBe('01:05');
  });

  it('formats 30 seconds as 00:30 (urgent threshold)', () => {
    expect(formatCountdown(30)).toBe('00:30');
  });
});

describe('Order expiry check', () => {
  it('returns true for past date', () => {
    expect(isOrderExpired('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('returns false for future date', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isOrderExpired(future)).toBe(false);
  });
});
