import { resolveAppliedPartnerPricing } from '../../supabase/functions/_shared/partner-pricing';

describe('partner pricing enforcement', () => {
  it('accepts partner submitted pricing when no fixed override exists', () => {
    const result = resolveAppliedPartnerPricing(
      { pricing_mode: 'partner_submitted', fixed_price_amount: null },
      2501,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.applied_fee).toBe(2600);
    expect(result.value.submitted_fee).toBe(2600);
    expect(result.value.pricing_source).toBe('partner_submitted');
  });

  it('accepts exact fixed-price matches and marks them as contract pricing', () => {
    const result = resolveAppliedPartnerPricing(
      { pricing_mode: 'fixed', fixed_price_amount: 3000 },
      3000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.applied_fee).toBe(3000);
    expect(result.value.pricing_source).toBe('partner_contract');
  });

  it('rejects pricing mismatches when a fixed contract price is configured', () => {
    const result = resolveAppliedPartnerPricing(
      { pricing_mode: 'fixed', fixed_price_amount: 3000 },
      2501,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('pricing_mismatch');
    expect(result.error.details).toEqual({
      submitted_fee: 2600,
      expected_fee: 3000,
    });
  });
});
