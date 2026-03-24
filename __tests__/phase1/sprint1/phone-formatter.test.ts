// Tests for Nigerian phone number formatting logic
// Mirrors the formatter in app/(auth)/login.tsx

function formatNigerianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let formatted: string;

  if (digits.startsWith('234')) {
    formatted = `+${digits}`;
  } else if (digits.startsWith('0')) {
    formatted = `+234${digits.slice(1)}`;
  } else {
    formatted = `+234${digits}`;
  }

  // Valid Nigerian E.164: +234 + 10 digits = 13 chars total
  if (formatted.length < 13 || formatted.length > 14) return null;
  return formatted;
}

describe('Nigerian phone formatter', () => {
  describe('valid numbers', () => {
    it('formats 080 prefix (MTN)', () => {
      expect(formatNigerianPhone('08012345678')).toBe('+2348012345678');
    });

    it('formats 090 prefix (Airtel)', () => {
      expect(formatNigerianPhone('09012345678')).toBe('+2349012345678');
    });

    it('formats 070 prefix (Glo)', () => {
      expect(formatNigerianPhone('07012345678')).toBe('+2347012345678');
    });

    it('passes through already-formatted E.164', () => {
      expect(formatNigerianPhone('+2348012345678')).toBe('+2348012345678');
    });

    it('handles number starting with 234 (no +)', () => {
      expect(formatNigerianPhone('2348012345678')).toBe('+2348012345678');
    });

    it('strips spaces from input', () => {
      expect(formatNigerianPhone('0801 234 5678')).toBe('+2348012345678');
    });

    it('strips dashes from input', () => {
      expect(formatNigerianPhone('0801-234-5678')).toBe('+2348012345678');
    });

    it('handles bare 10-digit number (no leading 0)', () => {
      expect(formatNigerianPhone('8012345678')).toBe('+2348012345678');
    });
  });

  describe('invalid numbers', () => {
    it('rejects too-short number', () => {
      expect(formatNigerianPhone('0801234')).toBeNull();
    });

    it('rejects empty string', () => {
      expect(formatNigerianPhone('')).toBeNull();
    });

    it('rejects non-numeric only', () => {
      expect(formatNigerianPhone('abcdefghijk')).toBeNull();
    });
  });
});
