import {
  canCancelPartnerDelivery,
  normalizePhoneNumber,
  validateCreateDeliveryRequest,
} from '../../supabase/functions/_shared/partner-contract';
import { generateSixDigitDeliveryCode, isSixDigitDeliveryCode } from '../../supabase/functions/_shared/partner-delivery-code';
import { sha256Hex, stableStringify } from '../../supabase/functions/_shared/partner-crypto';

describe('partner delivery contract validation', () => {
  const validPayload = {
    external_order_id: 'foodhunt_order_12345',
    external_reference: 'fh_paystack_ref_abc123',
    pickup: {
      name: 'Chicken Republic Marian',
      phone: '+2348000000001',
      address: '12 Marian Road, Calabar',
      lat: 4.9757123,
      lng: 8.3417988,
      instructions: 'Ask for the kitchen desk',
    },
    dropoff: {
      name: 'Aniekan Bassey',
      phone: '08000000002',
      address: '7 State Housing, Calabar',
      lat: 4.9541234,
      lng: 8.3226456,
      instructions: 'Call on arrival',
    },
    items: [
      { name: 'Jollof Rice', quantity: 2 },
      { name: 'Chicken', quantity: 1 },
    ],
    items_summary: '2x Jollof Rice, 1x Chicken',
    customer: {
      name: 'Aniekan Bassey',
      phone: '2348000000002',
    },
    pricing: {
      currency: 'NGN',
      partner_calculated_fee: 2500.129,
    },
    meta: {
      source_app: 'foodhunt',
      total_amount: 9000,
    },
  };

  it('normalizes phones and coordinates for a valid request', () => {
    const result = validateCreateDeliveryRequest(validPayload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.dropoff.phone).toBe('+2348000000002');
    expect(result.value.customer?.phone).toBe('+2348000000002');
    expect(result.value.pickup.lat).toBe(4.975712);
    expect(result.value.dropoff.lng).toBe(8.322646);
    expect(result.value.pricing.partner_calculated_fee).toBe(2500.13);
  });

  it('rejects missing structured items and malformed pricing', () => {
    const result = validateCreateDeliveryRequest({
      ...validPayload,
      items: [],
      pricing: { currency: 'USD', partner_calculated_fee: -5 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('invalid_payload');
  });

  it('supports deterministic request fingerprints through stable stringify', async () => {
    const a = { b: 2, a: 1, nested: { z: 1, y: 2 } };
    const b = { nested: { y: 2, z: 1 }, a: 1, b: 2 };

    expect(stableStringify(a)).toBe(stableStringify(b));
    await expect(sha256Hex(stableStringify(a))).resolves.toBe(
      await sha256Hex(stableStringify(b)),
    );
  });

  it('enforces cancel-before-pickup semantics', () => {
    expect(canCancelPartnerDelivery('accepted')).toBe(true);
    expect(canCancelPartnerDelivery('arrived_pickup')).toBe(true);
    expect(canCancelPartnerDelivery('picked_up')).toBe(false);
    expect(canCancelPartnerDelivery('delivered')).toBe(false);
  });

  it('normalizes Nigeria phones when possible', () => {
    expect(normalizePhoneNumber('08031234567')).toBe('+2348031234567');
    expect(normalizePhoneNumber('2348031234567')).toBe('+2348031234567');
    expect(normalizePhoneNumber('+2348031234567')).toBe('+2348031234567');
  });

  it('generates six digit delivery codes for Dzpatch-owned verification', () => {
    const code = generateSixDigitDeliveryCode();
    expect(isSixDigitDeliveryCode(code)).toBe(true);
    expect(code).toHaveLength(6);
  });
});
