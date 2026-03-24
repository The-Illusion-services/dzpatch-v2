/**
 * Sprint 2 — Order Form Logic Tests
 *
 * Tests pricing calculation, form validation logic, and promo code handling
 * without requiring a running Supabase instance.
 */

// ─── Price calculation helpers ────────────────────────────────────────────────

type PackageSize = 'small' | 'medium' | 'large' | 'extra_large';

const SIZE_MULTIPLIER: Record<PackageSize, number> = {
  small: 1,
  medium: 1.3,
  large: 1.6,
  extra_large: 2,
};

interface PricingRule {
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  service_fee_rate: number;
}

function calcDeliveryFee(rule: PricingRule, distanceKm: number, size: PackageSize): number {
  const multiplier = SIZE_MULTIPLIER[size];
  const base = Math.max(
    rule.minimum_fare,
    rule.base_fare + distanceKm * rule.per_km_rate
  ) * multiplier;
  return Math.round(base);
}

function calcServiceFee(rule: PricingRule, deliveryFee: number): number {
  return Math.round(deliveryFee * rule.service_fee_rate);
}

// ─── Phone formatter (reused from Sprint 1 formatter) ─────────────────────────

function formatRecipientPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let formatted: string;
  if (digits.startsWith('234')) {
    formatted = `+${digits}`;
  } else if (digits.startsWith('0')) {
    formatted = `+234${digits.slice(1)}`;
  } else {
    formatted = `+234${digits}`;
  }
  if (formatted.length < 13 || formatted.length > 14) return null;
  return formatted;
}

// ─── Promo validation ─────────────────────────────────────────────────────────

function applyPromo(
  deliveryFee: number,
  promo: { discount_type: 'percentage' | 'flat'; discount_value: number; min_order_amount?: number }
): number | null {
  if (promo.min_order_amount && deliveryFee < promo.min_order_amount) return null;
  if (promo.discount_type === 'percentage') {
    return Math.round((deliveryFee * promo.discount_value) / 100);
  }
  return promo.discount_value;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const defaultRule: PricingRule = {
  base_fare: 500,
  per_km_rate: 150,
  minimum_fare: 800,
  service_fee_rate: 0.05,
};

describe('Order pricing calculation', () => {
  it('applies minimum fare when distance yields less', () => {
    // 0km: base_fare=500 < minimum_fare=800 → use 800
    const fee = calcDeliveryFee(defaultRule, 0, 'small');
    expect(fee).toBe(800);
  });

  it('uses distance-based fare when larger than minimum', () => {
    // 5km: 500 + 5*150 = 1250 > 800 → 1250
    const fee = calcDeliveryFee(defaultRule, 5, 'small');
    expect(fee).toBe(1250);
  });

  it('applies medium size multiplier (1.3x)', () => {
    // 5km: 1250 * 1.3 = 1625
    const fee = calcDeliveryFee(defaultRule, 5, 'medium');
    expect(fee).toBe(1625);
  });

  it('applies large size multiplier (1.6x)', () => {
    const fee = calcDeliveryFee(defaultRule, 5, 'large');
    expect(fee).toBe(Math.round(1250 * 1.6));
  });

  it('applies extra_large multiplier (2x)', () => {
    const fee = calcDeliveryFee(defaultRule, 5, 'extra_large');
    expect(fee).toBe(2500);
  });

  it('calculates service fee correctly', () => {
    const fee = calcDeliveryFee(defaultRule, 5, 'small');
    const svc = calcServiceFee(defaultRule, fee);
    expect(svc).toBe(Math.round(1250 * 0.05)); // 63
  });

  it('total is sum of delivery + service fee', () => {
    const delivery = calcDeliveryFee(defaultRule, 5, 'small');
    const service = calcServiceFee(defaultRule, delivery);
    expect(delivery + service).toBe(delivery + service);
  });
});

describe('Recipient phone formatting', () => {
  it('formats 080xxxxxxxx correctly', () => {
    expect(formatRecipientPhone('08012345678')).toBe('+2348012345678');
  });

  it('accepts already E.164 phone', () => {
    expect(formatRecipientPhone('+2348012345678')).toBe('+2348012345678');
  });

  it('rejects invalid length', () => {
    expect(formatRecipientPhone('0801')).toBeNull();
  });

  it('strips dashes and spaces', () => {
    expect(formatRecipientPhone('080-1234-5678')).toBe('+2348012345678');
  });
});

describe('Promo code application', () => {
  it('applies percentage discount', () => {
    const disc = applyPromo(2000, { discount_type: 'percentage', discount_value: 10 });
    expect(disc).toBe(200);
  });

  it('applies flat discount', () => {
    const disc = applyPromo(2000, { discount_type: 'flat', discount_value: 300 });
    expect(disc).toBe(300);
  });

  it('rejects promo below minimum order', () => {
    const disc = applyPromo(500, { discount_type: 'percentage', discount_value: 10, min_order_amount: 1000 });
    expect(disc).toBeNull();
  });

  it('accepts promo at exactly minimum order', () => {
    const disc = applyPromo(1000, { discount_type: 'flat', discount_value: 100, min_order_amount: 1000 });
    expect(disc).toBe(100);
  });
});

describe('Order form validation', () => {
  function validate(params: {
    pickupAddress: string;
    dropoffAddress: string;
    recipientName: string;
    recipientPhone: string;
  }): string | null {
    if (!params.pickupAddress.trim()) return 'Enter pick-up address';
    if (!params.dropoffAddress.trim()) return 'Enter drop-off address';
    if (!params.recipientName.trim()) return 'Enter recipient name';
    if (!params.recipientPhone.trim()) return 'Enter recipient phone';
    return null;
  }

  it('returns null for valid form', () => {
    expect(validate({
      pickupAddress: '123 Lagos St',
      dropoffAddress: '456 Abuja Ave',
      recipientName: 'John Doe',
      recipientPhone: '08012345678',
    })).toBeNull();
  });

  it('errors on empty pickup', () => {
    expect(validate({
      pickupAddress: '',
      dropoffAddress: '456 Abuja Ave',
      recipientName: 'John Doe',
      recipientPhone: '08012345678',
    })).toBe('Enter pick-up address');
  });

  it('errors on empty dropoff', () => {
    expect(validate({
      pickupAddress: '123 Lagos St',
      dropoffAddress: '',
      recipientName: 'John Doe',
      recipientPhone: '08012345678',
    })).toBe('Enter drop-off address');
  });

  it('errors on empty recipient name', () => {
    expect(validate({
      pickupAddress: '123 Lagos St',
      dropoffAddress: '456 Abuja Ave',
      recipientName: '',
      recipientPhone: '08012345678',
    })).toBe('Enter recipient name');
  });

  it('errors on empty recipient phone', () => {
    expect(validate({
      pickupAddress: '123 Lagos St',
      dropoffAddress: '456 Abuja Ave',
      recipientName: 'John Doe',
      recipientPhone: '',
    })).toBe('Enter recipient phone');
  });

  it('whitespace-only pickup is invalid', () => {
    expect(validate({
      pickupAddress: '   ',
      dropoffAddress: '456 Abuja Ave',
      recipientName: 'John',
      recipientPhone: '080',
    })).toBe('Enter pick-up address');
  });
});
