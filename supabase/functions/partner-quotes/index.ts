import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticatePartnerRequest, insertPartnerAuditLog } from '../_shared/partner-auth.ts';
import { type AppliedPartnerPricing, resolveAppliedPartnerPricing } from '../_shared/partner-pricing.ts';
import {
  type PartnerPricingMode,
  type PartnerValidationError,
  validateCreateQuoteRequest,
} from '../_shared/partner-contract.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }));
  }

  if (req.method !== 'POST') {
    return json({ error: { code: 'invalid_payload', message: 'Method not allowed.' } }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: { code: 'internal_error', message: 'Quote service is not configured.' } }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await authenticatePartnerRequest({ req, supabase });
  if (!auth.ok) {
    return json({ error: { code: 'unauthorized_partner', message: auth.message } }, auth.status);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return json({ error: { code: 'invalid_payload', message: 'Request body must be valid JSON.' } }, 400);
  }

  const validation = validateCreateQuoteRequest(rawPayload);
  if (!validation.ok) {
    return json({ error: validation.error }, 400);
  }
  const payload = validation.value;

  const externalCheckoutReference =
    payload.external_checkout_reference ||
    (typeof payload.meta?.checkout_reference === 'string' ? payload.meta.checkout_reference.trim() : crypto.randomUUID());

  const pricing = await resolveDzpatchQuotePricing({ supabase, account: auth.account, payload });
  if (!pricing.ok) {
    await insertPartnerAuditLog({
      supabase,
      partnerAccountId: auth.account.id,
      action: 'partner.quote_pricing_rejected',
      actorType: 'service',
      payload: pricing.error.details ?? {},
    });
    return json({ error: pricing.error }, 409);
  }

  const expiresAt = new Date(Date.now() + auth.account.dispatch_ttl_minutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('partner_quotes')
    .upsert(
      {
        partner_account_id: auth.account.id,
        external_checkout_reference: externalCheckoutReference,
        request_payload: payload,
        submitted_fee: pricing.value.submitted_fee,
        applied_fee: pricing.value.applied_fee,
        pricing_source: pricing.value.pricing_source,
        currency: 'NGN',
        expires_at: expiresAt,
        consumed_at: null,
      },
      { onConflict: 'partner_account_id,external_checkout_reference' },
    )
    .select('*')
    .single();

  if (error || !data) {
    console.error('partner quote persist failed:', error);
    return json({ error: { code: 'internal_error', message: 'Failed to persist quote.' } }, 500);
  }

  await insertPartnerAuditLog({
    supabase,
    partnerAccountId: auth.account.id,
    action: 'partner.quote_created',
    actorType: 'partner',
    payload: {
      quote_id: data.id,
      external_checkout_reference: externalCheckoutReference,
      pricing_source: pricing.value.pricing_source,
    },
  });

  return json({
    quote_id: data.id,
    currency: 'NGN',
    delivery_fee: pricing.value.applied_fee,
    expires_at: data.expires_at,
    pricing_mode: auth.account.pricing_mode,
    pricing_source: pricing.value.pricing_source,
    pricing_snapshot: {
      submitted_fee: pricing.value.submitted_fee,
      applied_fee: pricing.value.applied_fee,
      calculation_source: pricing.value.calculation_source,
      distance_km: pricing.value.distance_km,
      vat_amount: pricing.value.vat_amount,
      total_price: pricing.value.total_price,
    },
  });
});

async function resolveDzpatchQuotePricing(params: {
  supabase: any;
  account: { pricing_mode: PartnerPricingMode; fixed_price_amount: number | null };
  payload: {
    pickup?: { lat: number; lng: number } | null;
    dropoff?: { lat: number; lng: number } | null;
    pricing?: { partner_calculated_fee: number } | null;
  };
}): Promise<
  | { ok: true; value: AppliedPartnerPricing & { calculation_source: string; distance_km: number | null; vat_amount: number | null; total_price: number | null } }
  | { ok: false; error: PartnerValidationError }
> {
  const submittedFee = Number(params.payload.pricing?.partner_calculated_fee ?? params.account.fixed_price_amount ?? 0);

  if (params.account.pricing_mode === 'fixed' && params.account.fixed_price_amount != null) {
    const fixed = resolveAppliedPartnerPricing(params.account, submittedFee);
    if (!fixed.ok) {
      return { ok: false, error: fixed.error };
    }
    return {
      ok: true,
      value: {
        ...fixed.value,
        calculation_source: 'dzpatch_fixed_contract',
        distance_km: null,
        vat_amount: null,
        total_price: fixed.value.applied_fee,
      },
    };
  }

  if (!params.payload.pickup || !params.payload.dropoff) {
    return {
      ok: false,
      error: {
        code: 'invalid_payload',
        message: 'Pickup and dropoff coordinates are required for Dzpatch-calculated partner quotes.',
      },
    };
  }

  const quote = await params.supabase.rpc('get_price_quote', {
    p_pickup_lat: params.payload.pickup.lat,
    p_pickup_lng: params.payload.pickup.lng,
    p_dropoff_lat: params.payload.dropoff.lat,
    p_dropoff_lng: params.payload.dropoff.lng,
    p_package_size: 'small',
    p_promo_code: null,
    p_service_area_id: null,
  });

  if (!quote.error && Array.isArray(quote.data) && quote.data.length > 0) {
    const row = quote.data[0] as Record<string, unknown>;
    const deliveryFee = roundFareUp(Number(row.delivery_fee));
    if (Number.isFinite(deliveryFee) && deliveryFee > 0) {
      return {
        ok: true,
        value: {
          currency: 'NGN',
          submitted_fee: roundFareUp(Number.isFinite(submittedFee) && submittedFee > 0 ? submittedFee : deliveryFee),
          applied_fee: deliveryFee,
          pricing_source: 'partner_contract',
          calculation_source: 'dzpatch_get_price_quote_rpc',
          distance_km: finiteNumber(row.distance_km),
          vat_amount: finiteNumber(row.vat_amount),
          total_price: finiteNumber(row.total_price),
        },
      };
    }
  }

  if (quote.error) {
    console.warn('get_price_quote failed; falling back to Dzpatch edge distance pricing:', quote.error);
  }

  const distanceKm = calculateDistanceKm(
    params.payload.pickup.lat,
    params.payload.pickup.lng,
    params.payload.dropoff.lat,
    params.payload.dropoff.lng,
  );
  const fallbackFee = roundFareUp(500 + distanceKm * 100);

  return {
    ok: true,
    value: {
      currency: 'NGN',
      submitted_fee: roundFareUp(Number.isFinite(submittedFee) && submittedFee > 0 ? submittedFee : fallbackFee),
      applied_fee: fallbackFee,
      pricing_source: 'partner_contract',
      calculation_source: 'dzpatch_edge_distance_fallback',
      distance_km: distanceKm,
      vat_amount: roundMoney(fallbackFee * 0.075),
      total_price: roundMoney(fallbackFee * 1.075),
    },
  };
}

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundFareUp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 100) * 100;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return roundMoney(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function json(body: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function withCors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Headers', 'authorization, content-type, idempotency-key');
  response.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  return response;
}
