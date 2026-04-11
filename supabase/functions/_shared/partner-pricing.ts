import type {
  PartnerPricingMode,
  PartnerPricingSource,
  PartnerValidationError,
} from './partner-contract.ts';

export type PartnerPricingConfig = {
  pricing_mode: PartnerPricingMode;
  fixed_price_amount: number | null;
};

export type AppliedPartnerPricing = {
  currency: 'NGN';
  submitted_fee: number;
  applied_fee: number;
  pricing_source: PartnerPricingSource;
};

export function resolveAppliedPartnerPricing(
  config: PartnerPricingConfig,
  submittedFee: number,
): { ok: true; value: AppliedPartnerPricing } | { ok: false; error: PartnerValidationError } {
  const normalizedSubmittedFee = roundMoney(submittedFee);

  if (config.pricing_mode === 'fixed' && config.fixed_price_amount != null) {
    const normalizedFixedFee = roundMoney(config.fixed_price_amount);

    if (normalizedSubmittedFee !== normalizedFixedFee) {
      return {
        ok: false,
        error: {
          code: 'pricing_mismatch',
          message: 'Submitted delivery fee does not match the configured partner pricing contract.',
          details: {
            submitted_fee: normalizedSubmittedFee,
            expected_fee: normalizedFixedFee,
          },
        },
      };
    }

    return {
      ok: true,
      value: {
        currency: 'NGN',
        submitted_fee: normalizedSubmittedFee,
        applied_fee: normalizedFixedFee,
        pricing_source: 'partner_contract',
      },
    };
  }

  return {
    ok: true,
    value: {
      currency: 'NGN',
      submitted_fee: normalizedSubmittedFee,
      applied_fee: normalizedSubmittedFee,
      pricing_source: 'partner_submitted',
    },
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
