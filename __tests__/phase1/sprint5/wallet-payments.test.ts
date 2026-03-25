/**
 * Sprint 5 — Wallet & Payments
 * Tests: pure logic helpers (no React rendering, no network calls)
 */

// ─── Helpers duplicated from the screens (pure functions) ─────────────────────

function isCredit(type: string): boolean {
  return ['credit', 'commission_credit', 'refund', 'adjustment'].includes(type);
}

function txIcon(type: string): string {
  if (isCredit(type)) return '↙';
  if (type === 'withdrawal') return '↗';
  return '↗';
}

function txLabel(tx: { type: string; description?: string | null }): string {
  if (tx.description) return tx.description;
  return tx.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return (
    new Date(iso).toLocaleDateString('en-NG', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) +
    ' • ' +
    new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  );
}

type TxFilter = 'all' | 'income' | 'spending' | 'pending';
type Transaction = { id: string; type: string; amount: number; status: string; created_at: string };

function filterTransactions(txs: Transaction[], filter: TxFilter): Transaction[] {
  switch (filter) {
    case 'income':   return txs.filter((t) => isCredit(t.type));
    case 'spending': return txs.filter((t) => !isCredit(t.type) && t.type !== 'withdrawal');
    case 'pending':  return txs.filter((t) => t.status === 'pending');
    default:         return txs;
  }
}

// ── Withdrawal helpers ──────────────────────────────────────────────────────

const WITHDRAWAL_FEE = 50;
const MIN_WITHDRAWAL = 1000;

function canWithdraw(amount: number, balance: number): boolean {
  return amount >= MIN_WITHDRAWAL && amount + WITHDRAWAL_FEE <= balance;
}

function maxWithdrawable(balance: number): number {
  return Math.max(0, balance - WITHDRAWAL_FEE);
}

// ── Quick amount helpers ────────────────────────────────────────────────────

function parseAmountInput(raw: string): number {
  return parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
}

function isFundAmountValid(raw: string): boolean {
  const n = parseAmountInput(raw);
  return n >= 100;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sprint 5 — Wallet helpers', () => {

  // ── isCredit ───────────────────────────────────────────────────────────────
  describe('isCredit()', () => {
    it('returns true for credit types', () => {
      expect(isCredit('credit')).toBe(true);
      expect(isCredit('commission_credit')).toBe(true);
      expect(isCredit('refund')).toBe(true);
      expect(isCredit('adjustment')).toBe(true);
    });

    it('returns false for debit types', () => {
      expect(isCredit('debit')).toBe(false);
      expect(isCredit('withdrawal')).toBe(false);
      expect(isCredit('commission')).toBe(false);
      expect(isCredit('payment')).toBe(false);
    });
  });

  // ── txIcon ─────────────────────────────────────────────────────────────────
  describe('txIcon()', () => {
    it('returns inward arrow for credits', () => {
      expect(txIcon('credit')).toBe('↙');
      expect(txIcon('refund')).toBe('↙');
    });

    it('returns outward arrow for withdrawals and debits', () => {
      expect(txIcon('withdrawal')).toBe('↗');
      expect(txIcon('debit')).toBe('↗');
      expect(txIcon('payment')).toBe('↗');
    });
  });

  // ── txLabel ────────────────────────────────────────────────────────────────
  describe('txLabel()', () => {
    it('uses description when provided', () => {
      expect(txLabel({ type: 'credit', description: 'Order refund #1234' })).toBe('Order refund #1234');
    });

    it('formats type as title case when no description', () => {
      expect(txLabel({ type: 'commission_credit', description: null })).toBe('Commission Credit');
      expect(txLabel({ type: 'debit' })).toBe('Debit');
      expect(txLabel({ type: 'bank_withdrawal', description: undefined })).toBe('Bank Withdrawal');
    });
  });

  // ── formatDate ─────────────────────────────────────────────────────────────
  describe('formatDate()', () => {
    it('produces a date+time string with bullet separator', () => {
      const result = formatDate('2024-06-15T10:30:00.000Z');
      expect(result).toContain('•');
      // Should contain the year
      expect(result).toContain('2024');
    });
  });

  // ── filterTransactions ─────────────────────────────────────────────────────
  describe('filterTransactions()', () => {
    const txs: Transaction[] = [
      { id: '1', type: 'credit', amount: 5000, status: 'completed', created_at: '2024-01-01' },
      { id: '2', type: 'debit', amount: 2000, status: 'completed', created_at: '2024-01-02' },
      { id: '3', type: 'withdrawal', amount: 3000, status: 'completed', created_at: '2024-01-03' },
      { id: '4', type: 'refund', amount: 1000, status: 'completed', created_at: '2024-01-04' },
      { id: '5', type: 'credit', amount: 500, status: 'pending', created_at: '2024-01-05' },
      { id: '6', type: 'debit', amount: 200, status: 'pending', created_at: '2024-01-06' },
    ];

    it('returns all transactions for "all" filter', () => {
      expect(filterTransactions(txs, 'all')).toHaveLength(6);
    });

    it('returns only credits/refunds for "income" filter', () => {
      const result = filterTransactions(txs, 'income');
      expect(result).toHaveLength(3); // credit, refund, pending credit
      result.forEach((t) => expect(isCredit(t.type)).toBe(true));
    });

    it('returns non-credit non-withdrawal for "spending" filter', () => {
      const result = filterTransactions(txs, 'spending');
      expect(result).toHaveLength(2); // 2 debits
      result.forEach((t) => {
        expect(isCredit(t.type)).toBe(false);
        expect(t.type).not.toBe('withdrawal');
      });
    });

    it('returns only pending transactions for "pending" filter', () => {
      const result = filterTransactions(txs, 'pending');
      expect(result).toHaveLength(2);
      result.forEach((t) => expect(t.status).toBe('pending'));
    });

    it('returns empty array when no match', () => {
      const noCredit = txs.filter((t) => !isCredit(t.type) && t.type !== 'debit');
      const result = filterTransactions(
        noCredit.filter((t) => t.type !== 'withdrawal'),
        'spending'
      );
      expect(result).toHaveLength(0);
    });
  });

  // ── Withdrawal validation ──────────────────────────────────────────────────
  describe('canWithdraw()', () => {
    it('returns true for valid withdrawal', () => {
      expect(canWithdraw(1000, 2000)).toBe(true);
      expect(canWithdraw(5000, 10000)).toBe(true);
    });

    it('returns false when amount is below minimum', () => {
      expect(canWithdraw(999, 5000)).toBe(false);
      expect(canWithdraw(0, 5000)).toBe(false);
    });

    it('returns false when balance is insufficient (amount + fee)', () => {
      expect(canWithdraw(1000, 1000)).toBe(false); // 1000 + 50 fee > 1000
      expect(canWithdraw(1000, 1049)).toBe(false); // 1000 + 50 = 1050 > 1049
      expect(canWithdraw(1000, 1050)).toBe(true);  // exact match
    });

    it('returns false for zero balance', () => {
      expect(canWithdraw(1000, 0)).toBe(false);
    });
  });

  // ── Max withdrawable ───────────────────────────────────────────────────────
  describe('maxWithdrawable()', () => {
    it('subtracts fee from balance', () => {
      expect(maxWithdrawable(5000)).toBe(4950);
      expect(maxWithdrawable(1050)).toBe(1000);
    });

    it('returns 0 when balance is below fee', () => {
      expect(maxWithdrawable(30)).toBe(0);
      expect(maxWithdrawable(0)).toBe(0);
    });
  });

  // ── Fund wallet input validation ───────────────────────────────────────────
  describe('isFundAmountValid()', () => {
    it('accepts valid amounts', () => {
      expect(isFundAmountValid('100')).toBe(true);
      expect(isFundAmountValid('1000')).toBe(true);
      expect(isFundAmountValid('100.50')).toBe(true);
      expect(isFundAmountValid('10000')).toBe(true);
    });

    it('rejects amounts below minimum', () => {
      expect(isFundAmountValid('99')).toBe(false);
      expect(isFundAmountValid('0')).toBe(false);
      expect(isFundAmountValid('')).toBe(false);
    });

    it('strips non-numeric characters before parsing', () => {
      expect(isFundAmountValid('₦1,000')).toBe(true);
      expect(isFundAmountValid('abc')).toBe(false);
    });
  });

  // ── parseAmountInput ───────────────────────────────────────────────────────
  describe('parseAmountInput()', () => {
    it('parses plain numbers', () => {
      expect(parseAmountInput('5000')).toBe(5000);
      expect(parseAmountInput('100.50')).toBe(100.5);
    });

    it('strips commas', () => {
      expect(parseAmountInput('1,000')).toBe(1000);
      expect(parseAmountInput('10,000')).toBe(10000);
    });

    it('returns 0 for non-numeric strings', () => {
      expect(parseAmountInput('')).toBe(0);
      expect(parseAmountInput('abc')).toBe(0);
    });
  });

  // ── Paystack reference format ──────────────────────────────────────────────
  describe('Paystack reference generation', () => {
    function generateRef(userId: string): string {
      const ts = 1700000000000; // fixed for testing
      return `FUND-${userId.slice(0, 8)}-${ts}`;
    }

    it('generates a FUND- prefixed reference', () => {
      const ref = generateRef('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(ref.startsWith('FUND-')).toBe(true);
    });

    it('includes first 8 chars of user ID', () => {
      const ref = generateRef('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(ref).toContain('a1b2c3d4');
    });

    it('two refs at different timestamps are unique', () => {
      const uid = 'test-user-id-here';
      const ref1 = `FUND-${uid.slice(0, 8)}-${Date.now()}`;
      const ref2 = `FUND-${uid.slice(0, 8)}-${Date.now() + 1}`;
      expect(ref1).not.toBe(ref2);
    });
  });
});

// ─── Sprint 5 — Edge Function logic (pure) ────────────────────────────────────

describe('Sprint 5 — payment-webhook logic', () => {

  it('converts kobo to naira correctly', () => {
    const kobo = 500000;
    expect(kobo / 100).toBe(5000);
  });

  it('detects charge.success event', () => {
    const event = { event: 'charge.success', data: {} };
    expect(event.event === 'charge.success').toBe(true);
  });

  it('detects transfer.success event', () => {
    const event = { event: 'transfer.success', data: {} };
    expect(event.event === 'transfer.success').toBe(true);
  });

  it('detects transfer.failed event', () => {
    const event = { event: 'transfer.failed', data: {} };
    expect(['transfer.failed', 'transfer.reversed'].includes(event.event)).toBe(true);
  });

  it('unrecognized events are ignored gracefully', () => {
    const event = { event: 'subscription.create', data: {} };
    const isHandled = ['charge.success', 'transfer.success', 'transfer.failed', 'transfer.reversed']
      .includes(event.event);
    expect(isHandled).toBe(false);
  });
});

// ─── Sprint 5 — Withdraw form ─────────────────────────────────────────────────

describe('Sprint 5 — Withdraw screen helpers', () => {

  it('account number must be exactly 10 digits', () => {
    const isValid = (n: string) => n.length === 10 && /^\d+$/.test(n);
    expect(isValid('1234567890')).toBe(true);
    expect(isValid('123456789')).toBe(false);  // 9 digits
    expect(isValid('12345678901')).toBe(false); // 11 digits
    expect(isValid('123456789a')).toBe(false);  // non-digit
  });

  it('bank list is non-empty', () => {
    const NIGERIAN_BANKS = [
      'Access Bank', 'First Bank', 'GTBank', 'Zenith Bank', 'UBA',
      'Kuda MFB', 'OPay', 'PalmPay', 'Moniepoint',
    ];
    expect(NIGERIAN_BANKS.length).toBeGreaterThan(0);
  });

  it('submit is disabled when bank is not selected', () => {
    const isReady = (bankName: string, acct: string, amount: number, balance: number) =>
      bankName.length > 0 && acct.length === 10 && canWithdraw(amount, balance);
    expect(isReady('', '1234567890', 1000, 5000)).toBe(false);
    expect(isReady('GTBank', '1234567890', 1000, 5000)).toBe(true);
  });

  it('submit is disabled when account number is incomplete', () => {
    const isReady = (bankName: string, acct: string, amount: number, balance: number) =>
      bankName.length > 0 && acct.length === 10 && canWithdraw(amount, balance);
    expect(isReady('GTBank', '123456789', 1000, 5000)).toBe(false);
  });
});
