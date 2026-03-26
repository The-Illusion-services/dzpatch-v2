/**
 * Sprint 7 — Rider App Logic Tests
 *
 * Covers: Job Details, Navigation, Earnings, Trip Complete, Counter-Offer,
 *         Bid Flow, Delivery Completion, Account Locked, Dark Mode Tokens.
 *
 * Pure logic tests — no Expo imports to avoid module resolution errors.
 */

// ─── Job Details helpers ───────────────────────────────────────────────────────

function formatPrice(price: number | null, fallback: number | null): string {
  const p = price ?? fallback ?? 0;
  return `₦${p.toLocaleString()}`;
}

function timeSince(iso: string, nowMs: number): string {
  const diff = Math.floor((nowMs - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff === 1) return '1 min ago';
  return `${diff} mins ago`;
}

function isOrderAvailable(status: string, expiresAt: string | null, nowMs: number): boolean {
  const expired = expiresAt ? new Date(expiresAt).getTime() < nowMs : false;
  return status === 'pending' && !expired;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Earnings helpers ──────────────────────────────────────────────────────────

const COMMISSION_RATE = 0.18;

function calcCommission(grossRevenue: number): number {
  return Math.round(grossRevenue * COMMISSION_RATE);
}

function calcNetPay(grossRevenue: number): number {
  return Math.round(grossRevenue * (1 - COMMISSION_RATE));
}

function calcGrossRevenue(transactions: { amount: number; type: string }[]): number {
  return transactions
    .filter((t) => t.amount > 0 && t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
}

interface DailyEntry {
  date: string;
  trips: number;
  amount: number;
  status: 'Settled' | 'Processing';
}

function buildDailyEntries(
  transactions: { id: string; amount: number; type: string; created_at: string }[],
  nowMs: number
): DailyEntry[] {
  const incomeTransactions = transactions.filter((t) => t.amount > 0 && t.type === 'credit');
  const dailyMap = new Map<string, DailyEntry>();

  for (const tx of incomeTransactions) {
    const date = tx.created_at.slice(0, 10);
    const existing = dailyMap.get(date);
    if (existing) {
      existing.trips += 1;
      existing.amount += tx.amount;
    } else {
      dailyMap.set(date, {
        date,
        trips: 1,
        amount: tx.amount,
        status: new Date(tx.created_at).getTime() < nowMs - 86400000 ? 'Settled' : 'Processing',
      });
    }
  }
  return Array.from(dailyMap.values()).slice(0, 7);
}

// ─── Trip Complete helpers ─────────────────────────────────────────────────────

function parseEarnings(raw: string | undefined): number {
  return parseInt(raw || '0', 10);
}

function calcGross(riderEarningsRaw: string | undefined, commissionRaw: string | undefined): number {
  return parseEarnings(riderEarningsRaw) + parseEarnings(commissionRaw);
}

// ─── Counter-offer / bid helpers ──────────────────────────────────────────────

const MIN_BID = 100;
const MAX_BID = 500_000;

function validateBidAmount(amount: string): string | null {
  const n = parseFloat(amount);
  if (!amount || isNaN(n)) return 'Enter a valid amount.';
  if (n < MIN_BID) return `Minimum bid is ₦${MIN_BID.toLocaleString()}.`;
  if (n > MAX_BID) return `Maximum bid is ₦${MAX_BID.toLocaleString()}.`;
  return null;
}

function bidHigherThanSuggested(bidAmount: number, suggestedPrice: number | null): boolean {
  if (!suggestedPrice) return false;
  return bidAmount > suggestedPrice;
}

// ─── Navigation URL helpers ────────────────────────────────────────────────────

function buildNavigationUrl(address: string, platform: 'ios' | 'android'): { primary: string; fallback: string } {
  const encoded = encodeURIComponent(address);
  const primary = platform === 'ios'
    ? `maps:?daddr=${encoded}&dirflg=d`
    : `google.navigation:q=${encoded}&mode=d`;
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
  return { primary, fallback };
}

// ─── Commission lock helpers ───────────────────────────────────────────────────

const MAX_UNPAID_ORDERS = 2;

function isCommissionLocked(unpaidOrderCount: number): boolean {
  return unpaidOrderCount >= MAX_UNPAID_ORDERS;
}

function unpaidOrdersRemaining(unpaidOrderCount: number): number {
  return Math.max(0, MAX_UNPAID_ORDERS - unpaidOrderCount);
}

// ─── Dark mode token helpers ───────────────────────────────────────────────────

type Scheme = 'light' | 'dark';

const lightPalette = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  textPrimary: '#0D1B2A',
  tabActive: '#2563EB',
  tabInactive: '#9CA3AF',
  tabBackground: '#FFFFFF',
};

const darkPalette = {
  background: '#0D1117',
  surface: '#161B22',
  textPrimary: '#E6EDF3',
  tabActive: '#3B82F6',
  tabInactive: '#484F58',
  tabBackground: '#161B22',
};

function resolveColor(token: keyof typeof lightPalette, scheme: Scheme): string {
  return scheme === 'dark' ? darkPalette[token] : lightPalette[token];
}

function resolveThemeColor(
  props: { light?: string; dark?: string },
  token: keyof typeof lightPalette,
  scheme: Scheme
): string {
  const fromProps = scheme === 'dark' ? props.dark : props.light;
  return fromProps ?? resolveColor(token, scheme);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Job Details — formatPrice', () => {
  it('uses dynamic_price when available', () => {
    expect(formatPrice(3500, 2000)).toBe('₦3,500');
  });

  it('falls back to suggested_price when dynamic is null', () => {
    expect(formatPrice(null, 2000)).toBe('₦2,000');
  });

  it('returns ₦0 when both are null', () => {
    expect(formatPrice(null, null)).toBe('₦0');
  });

  it('formats with thousand separator', () => {
    expect(formatPrice(15000, null)).toBe('₦15,000');
  });
});

describe('Job Details — timeSince', () => {
  it('returns "just now" for < 1 minute', () => {
    const now = Date.now();
    const iso = new Date(now - 30000).toISOString(); // 30 seconds ago
    expect(timeSince(iso, now)).toBe('just now');
  });

  it('returns "1 min ago" for exactly 1 minute', () => {
    const now = Date.now();
    const iso = new Date(now - 60000).toISOString();
    expect(timeSince(iso, now)).toBe('1 min ago');
  });

  it('returns "N mins ago" for > 1 minute', () => {
    const now = Date.now();
    const iso = new Date(now - 300000).toISOString(); // 5 minutes ago
    expect(timeSince(iso, now)).toBe('5 mins ago');
  });
});

describe('Job Details — isOrderAvailable', () => {
  const now = Date.now();

  it('available when status=pending and no expiry', () => {
    expect(isOrderAvailable('pending', null, now)).toBe(true);
  });

  it('available when status=pending and not yet expired', () => {
    const future = new Date(now + 60000).toISOString();
    expect(isOrderAvailable('pending', future, now)).toBe(true);
  });

  it('unavailable when expired', () => {
    const past = new Date(now - 60000).toISOString();
    expect(isOrderAvailable('pending', past, now)).toBe(false);
  });

  it('unavailable when status is matched (already taken)', () => {
    expect(isOrderAvailable('matched', null, now)).toBe(false);
  });

  it('unavailable when status is cancelled', () => {
    expect(isOrderAvailable('cancelled', null, now)).toBe(false);
  });
});

describe('Job Details — capitalise', () => {
  it('capitalises first letter', () => {
    expect(capitalise('medium')).toBe('Medium');
    expect(capitalise('large')).toBe('Large');
    expect(capitalise('small')).toBe('Small');
  });
});

describe('Earnings — commission & net pay calculations', () => {
  it('calcCommission: 18% of 10000 = 1800', () => {
    expect(calcCommission(10000)).toBe(1800);
  });

  it('calcNetPay: 82% of 10000 = 8200', () => {
    expect(calcNetPay(10000)).toBe(8200);
  });

  it('commission + net = gross', () => {
    const gross = 25000;
    const comm = calcCommission(gross);
    const net = calcNetPay(gross);
    // Math.round can cause off-by-one, allow 1 difference
    expect(Math.abs(comm + net - gross)).toBeLessThanOrEqual(1);
  });

  it('commission is 0 for 0 gross', () => {
    expect(calcCommission(0)).toBe(0);
  });

  it('commission rounds correctly for fractional amounts', () => {
    // 18% of 555 = 99.9 → rounds to 100
    expect(calcCommission(555)).toBe(100);
  });
});

describe('Earnings — calcGrossRevenue', () => {
  const transactions = [
    { amount: 5000, type: 'credit' },
    { amount: 3000, type: 'credit' },
    { amount: -200, type: 'debit' },     // should be excluded
    { amount: 2000, type: 'commission' }, // should be excluded
    { amount: 1500, type: 'credit' },
  ];

  it('sums only positive credit transactions', () => {
    expect(calcGrossRevenue(transactions)).toBe(9500);
  });

  it('returns 0 for empty transactions', () => {
    expect(calcGrossRevenue([])).toBe(0);
  });

  it('excludes debits and non-credit types', () => {
    const mixed = [
      { amount: 1000, type: 'debit' },
      { amount: 500, type: 'withdrawal' },
    ];
    expect(calcGrossRevenue(mixed)).toBe(0);
  });
});

describe('Earnings — buildDailyEntries', () => {
  const nowMs = new Date('2024-06-15T12:00:00Z').getTime();

  const transactions = [
    { id: '1', amount: 3000, type: 'credit', created_at: '2024-06-15T09:00:00Z' }, // today
    { id: '2', amount: 2000, type: 'credit', created_at: '2024-06-15T11:00:00Z' }, // today
    { id: '3', amount: 4000, type: 'credit', created_at: '2024-06-14T10:00:00Z' }, // yesterday
    { id: '4', amount: -500, type: 'debit', created_at: '2024-06-14T10:00:00Z' },   // excluded
  ];

  it('groups multiple transactions on same day', () => {
    const entries = buildDailyEntries(transactions, nowMs);
    const today = entries.find((e) => e.date === '2024-06-15');
    expect(today).toBeDefined();
    expect(today!.trips).toBe(2);
    expect(today!.amount).toBe(5000);
  });

  it('marks old entries as Settled', () => {
    const entries = buildDailyEntries(transactions, nowMs);
    const yesterday = entries.find((e) => e.date === '2024-06-14');
    expect(yesterday?.status).toBe('Settled');
  });

  it('marks recent entries as Processing', () => {
    const entries = buildDailyEntries(transactions, nowMs);
    const today = entries.find((e) => e.date === '2024-06-15');
    expect(today?.status).toBe('Processing');
  });

  it('excludes debit transactions', () => {
    const entries = buildDailyEntries(transactions, nowMs);
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(9000); // 5000 + 4000
  });

  it('limits to 7 entries', () => {
    const manyTx = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      amount: 1000,
      type: 'credit',
      created_at: `2024-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }));
    const entries = buildDailyEntries(manyTx, nowMs);
    expect(entries.length).toBeLessThanOrEqual(7);
  });
});

describe('Trip Complete — earnings parsing', () => {
  it('parses earnings correctly', () => {
    expect(parseEarnings('8200')).toBe(8200);
    expect(parseEarnings('0')).toBe(0);
    expect(parseEarnings(undefined)).toBe(0);
    expect(parseEarnings('')).toBe(0);
  });

  it('calcGross = net + commission', () => {
    expect(calcGross('8200', '1800')).toBe(10000);
  });

  it('calcGross handles undefined params', () => {
    expect(calcGross(undefined, undefined)).toBe(0);
    expect(calcGross('5000', undefined)).toBe(5000);
  });
});

describe('Counter-Offer — bid validation', () => {
  it('rejects empty input', () => {
    expect(validateBidAmount('')).toBeTruthy();
  });

  it('rejects non-numeric input', () => {
    expect(validateBidAmount('abc')).toBeTruthy();
  });

  it('rejects amount below minimum', () => {
    expect(validateBidAmount('50')).toContain('100');
  });

  it('rejects amount above maximum', () => {
    expect(validateBidAmount('999999')).toContain('500,000');
  });

  it('accepts valid bid in range', () => {
    expect(validateBidAmount('5000')).toBeNull();
    expect(validateBidAmount('100')).toBeNull();
    expect(validateBidAmount('500000')).toBeNull();
  });

  it('bidHigherThanSuggested: true when bid > suggested', () => {
    expect(bidHigherThanSuggested(6000, 5000)).toBe(true);
  });

  it('bidHigherThanSuggested: false when bid <= suggested', () => {
    expect(bidHigherThanSuggested(4000, 5000)).toBe(false);
    expect(bidHigherThanSuggested(5000, 5000)).toBe(false);
  });

  it('bidHigherThanSuggested: false when no suggested price', () => {
    expect(bidHigherThanSuggested(5000, null)).toBe(false);
  });
});

describe('Navigation — URL building', () => {
  const address = '45 Bode Thomas, Surulere, Lagos';

  it('builds iOS maps URL', () => {
    const { primary } = buildNavigationUrl(address, 'ios');
    expect(primary).toMatch(/^maps:\?daddr=/);
    expect(primary).toContain('Surulere');
  });

  it('builds Android navigation URL', () => {
    const { primary } = buildNavigationUrl(address, 'android');
    expect(primary).toMatch(/^google\.navigation:q=/);
  });

  it('builds Google Maps fallback URL', () => {
    const { fallback } = buildNavigationUrl(address, 'ios');
    expect(fallback).toContain('google.com/maps/dir/');
    expect(fallback).toContain('travelmode=driving');
  });

  it('encodes special characters in address', () => {
    const addr = '45 Lagos & Ogun Road, Lagos';
    const { primary } = buildNavigationUrl(addr, 'android');
    expect(primary).toContain('%26'); // & encoded
  });
});

describe('Commission Lock — account locked logic', () => {
  it('not locked with 0 unpaid orders', () => {
    expect(isCommissionLocked(0)).toBe(false);
  });

  it('not locked with 1 unpaid order', () => {
    expect(isCommissionLocked(1)).toBe(false);
  });

  it('locked at threshold (2 unpaid orders)', () => {
    expect(isCommissionLocked(2)).toBe(true);
  });

  it('locked beyond threshold', () => {
    expect(isCommissionLocked(5)).toBe(true);
  });

  it('unpaidOrdersRemaining: correct count before lock', () => {
    expect(unpaidOrdersRemaining(0)).toBe(2);
    expect(unpaidOrdersRemaining(1)).toBe(1);
  });

  it('unpaidOrdersRemaining: 0 when locked', () => {
    expect(unpaidOrdersRemaining(2)).toBe(0);
    expect(unpaidOrdersRemaining(5)).toBe(0);
  });
});

describe('Dark Mode Token System', () => {
  it('resolveColor: returns light palette in light mode', () => {
    expect(resolveColor('background', 'light')).toBe('#F5F7FA');
    expect(resolveColor('surface', 'light')).toBe('#FFFFFF');
    expect(resolveColor('textPrimary', 'light')).toBe('#0D1B2A');
  });

  it('resolveColor: returns dark palette in dark mode', () => {
    expect(resolveColor('background', 'dark')).toBe('#0D1117');
    expect(resolveColor('surface', 'dark')).toBe('#161B22');
    expect(resolveColor('textPrimary', 'dark')).toBe('#E6EDF3');
  });

  it('resolveColor: tab colors differ between schemes', () => {
    expect(resolveColor('tabActive', 'light')).not.toBe(resolveColor('tabActive', 'dark'));
    expect(resolveColor('tabInactive', 'light')).not.toBe(resolveColor('tabInactive', 'dark'));
    expect(resolveColor('tabBackground', 'light')).not.toBe(resolveColor('tabBackground', 'dark'));
  });

  it('resolveThemeColor: prop override wins in light mode', () => {
    const result = resolveThemeColor({ light: '#FF0000', dark: '#00FF00' }, 'background', 'light');
    expect(result).toBe('#FF0000');
  });

  it('resolveThemeColor: prop override wins in dark mode', () => {
    const result = resolveThemeColor({ light: '#FF0000', dark: '#00FF00' }, 'background', 'dark');
    expect(result).toBe('#00FF00');
  });

  it('resolveThemeColor: falls back to palette when no prop', () => {
    expect(resolveThemeColor({}, 'background', 'light')).toBe('#F5F7FA');
    expect(resolveThemeColor({}, 'background', 'dark')).toBe('#0D1117');
  });

  it('resolveThemeColor: partial prop (only light) — dark falls back to palette', () => {
    const result = resolveThemeColor({ light: '#FF0000' }, 'background', 'dark');
    expect(result).toBe('#0D1117'); // palette dark value
  });
});
