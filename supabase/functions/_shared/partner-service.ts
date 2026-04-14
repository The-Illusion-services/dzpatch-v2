import { sha256Hex, stableStringify } from './partner-crypto.ts';
import { generateSixDigitDeliveryCode, isSixDigitDeliveryCode } from './partner-delivery-code.ts';
import {
  canCancelPartnerDelivery,
  type PartnerDeliveryRequest,
  type PartnerDeliveryCodeStatus,
  type PartnerDeliveryStatus,
  type PartnerPricingSource,
} from './partner-contract.ts';

export type PartnerAccountRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  api_key_hash: string;
  webhook_secret: string;
  webhook_url: string;
  customer_profile_id: string | null;
  pricing_mode: 'partner_submitted' | 'fixed';
  fixed_price_amount: number | null;
  dispatch_ttl_minutes: number;
};

export type PartnerDeliveryRecord = {
  id: string;
  partner_account_id: string;
  external_order_id: string;
  external_reference: string | null;
  idempotency_key: string;
  request_fingerprint: string;
  partner_quote_id: string | null;
  dzpatch_order_id: string | null;
  status: PartnerDeliveryStatus;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown> | null;
  submitted_fee: number;
  applied_fee: number;
  pricing_source: PartnerPricingSource;
  delivery_code: string | null;
  delivery_code_status: PartnerDeliveryCodeStatus | null;
  delivery_code_generated_at: string | null;
  attempt_count: number;
  last_error: Record<string, unknown> | null;
  accepted_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export function buildTrackingUrl(deliveryId: string): string {
  const base = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get(
    'DZPATCH_TRACKING_BASE_URL',
  ) ?? 'https://dzpatch.app/track';
  return `${base.replace(/\/+$/, '')}/${deliveryId}`;
}

export function buildPartnerDeliveryResponse(row: PartnerDeliveryRecord): Record<string, unknown> {
  return {
    delivery_id: row.id,
    dzpatch_order_id: row.dzpatch_order_id,
    external_order_id: row.external_order_id,
    status: row.status,
    pricing: {
      currency: 'NGN',
      submitted_fee: row.submitted_fee,
      applied_fee: row.applied_fee,
      pricing_source: row.pricing_source,
    },
    delivery_code: row.delivery_code
      ? {
          code: row.delivery_code,
          status: row.delivery_code_status ?? 'active',
        }
      : null,
    tracking: {
      tracking_url: buildTrackingUrl(row.id),
    },
    timestamps: {
      accepted_at: row.accepted_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
    },
  };
}

export async function fingerprintPartnerDeliveryRequest(request: PartnerDeliveryRequest): Promise<string> {
  return sha256Hex(stableStringify(request));
}

export async function createOrReusePartnerDelivery(params: {
  supabase: any;
  account: PartnerAccountRecord;
  request: PartnerDeliveryRequest;
  idempotencyKey: string;
  appliedPricing: {
    submitted_fee: number;
    applied_fee: number;
    pricing_source: PartnerPricingSource;
  };
}): Promise<
  | { kind: 'created'; row: PartnerDeliveryRecord }
  | { kind: 'existing'; row: PartnerDeliveryRecord }
  | { kind: 'conflict'; code: 'delivery_already_exists' | 'idempotency_conflict' | 'pricing_mismatch'; message: string; details?: Record<string, unknown> }
> {
  const fingerprint = await fingerprintPartnerDeliveryRequest(params.request);

  const { data: existingByIdempotency } = await params.supabase
    .from('partner_deliveries')
    .select('*')
    .eq('partner_account_id', params.account.id)
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle();

  if (existingByIdempotency) {
    const hydrated = await ensurePartnerDeliveryCode({
      supabase: params.supabase,
      row: existingByIdempotency as PartnerDeliveryRecord,
    });

    if (!hydrated.ok) throw hydrated.error;

    if (existingByIdempotency.request_fingerprint !== fingerprint) {
      return {
        kind: 'conflict',
        code: 'idempotency_conflict',
        message: 'The provided Idempotency-Key was already used with a different request payload.',
      };
    }

    return { kind: 'existing', row: hydrated.row };
  }

  const quoteResult = await validatePartnerQuoteForDelivery({
    supabase: params.supabase,
    account: params.account,
    request: params.request,
    appliedFee: params.appliedPricing.applied_fee,
  });
  if (!quoteResult.ok) {
    return {
      kind: 'conflict',
      code: 'pricing_mismatch',
      message: quoteResult.message,
      details: quoteResult.details,
    };
  }

  const deliveryCode = generateSixDigitDeliveryCode();
  const dzpatchOrder = await createDzpatchOrderForPartnerDelivery({
    supabase: params.supabase,
    account: params.account,
    request: params.request,
    appliedFee: params.appliedPricing.applied_fee,
    deliveryCode,
  });

  const { data, error } = await params.supabase
    .from('partner_deliveries')
    .insert({
      partner_account_id: params.account.id,
      external_order_id: params.request.external_order_id,
      external_reference: params.request.external_reference ?? null,
      idempotency_key: params.idempotencyKey,
      request_fingerprint: fingerprint,
      partner_quote_id: quoteResult.quote?.id ?? null,
      dzpatch_order_id: dzpatchOrder.id,
      status: 'accepted',
      request_payload: params.request,
      response_payload: null,
      submitted_fee: params.appliedPricing.submitted_fee,
      applied_fee: params.appliedPricing.applied_fee,
      pricing_source: params.appliedPricing.pricing_source,
      delivery_code: deliveryCode,
      delivery_code_status: 'active',
      delivery_code_generated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    const { data: existingByExternal } = await params.supabase
      .from('partner_deliveries')
      .select('*')
      .eq('partner_account_id', params.account.id)
      .eq('external_order_id', params.request.external_order_id)
      .maybeSingle();

    if (existingByExternal) {
      const hydrated = await ensurePartnerDeliveryCode({
        supabase: params.supabase,
        row: existingByExternal as PartnerDeliveryRecord,
      });

      if (!hydrated.ok) throw hydrated.error;

      if ((existingByExternal as PartnerDeliveryRecord).request_fingerprint === fingerprint) {
        return { kind: 'existing', row: hydrated.row };
      }

      return {
        kind: 'conflict',
        code: 'delivery_already_exists',
        message: 'A delivery already exists for this external order.',
        details: { external_order_id: params.request.external_order_id },
      };
    }

    throw error;
  }

  const row = data as PartnerDeliveryRecord;
  const finalResponse = buildPartnerDeliveryResponse(row);

  await params.supabase
    .from('partner_deliveries')
    .update({ response_payload: finalResponse })
    .eq('id', row.id);

  if (quoteResult.quote) {
    await params.supabase
      .from('partner_quotes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', quoteResult.quote.id);
  }

  return {
    kind: 'created',
    row: {
      ...row,
      response_payload: finalResponse,
    },
  };
}

async function validatePartnerQuoteForDelivery(params: {
  supabase: any;
  account: PartnerAccountRecord;
  request: PartnerDeliveryRequest;
  appliedFee: number;
}): Promise<
  | { ok: true; quote: { id: string } | null }
  | { ok: false; message: string; details?: Record<string, unknown> }
> {
  if (!params.request.quote_id) {
    return { ok: true, quote: null };
  }

  const { data, error } = await params.supabase
    .from('partner_quotes')
    .select('*')
    .eq('id', params.request.quote_id)
    .eq('partner_account_id', params.account.id)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: 'The supplied partner quote was not found.',
      details: { quote_id: params.request.quote_id },
    };
  }

  if (data.consumed_at) {
    return {
      ok: false,
      message: 'The supplied partner quote has already been consumed.',
      details: { quote_id: params.request.quote_id },
    };
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      message: 'The supplied partner quote has expired.',
      details: { quote_id: params.request.quote_id },
    };
  }

  if (Math.round(Number(data.applied_fee) * 100) !== Math.round(params.appliedFee * 100)) {
    return {
      ok: false,
      message: 'The supplied partner quote fee does not match the delivery fee.',
      details: { quote_id: params.request.quote_id },
    };
  }

  const quotedReference = data.external_checkout_reference ?? data.request_payload?.meta?.checkout_reference ?? null;
  const requestReference =
    params.request.external_reference ??
    (typeof params.request.meta.checkout_reference === 'string' ? params.request.meta.checkout_reference : null);

  if (quotedReference && requestReference && quotedReference !== requestReference) {
    return {
      ok: false,
      message: 'The supplied partner quote does not match this checkout reference.',
      details: { quote_id: params.request.quote_id },
    };
  }

  return { ok: true, quote: { id: data.id } };
}

async function createDzpatchOrderForPartnerDelivery(params: {
  supabase: any;
  account: PartnerAccountRecord;
  request: PartnerDeliveryRequest;
  appliedFee: number;
  deliveryCode: string;
}): Promise<{ id: string }> {
  if (!params.account.customer_profile_id) {
    throw new Error('Partner account is missing customer_profile_id for real Dzpatch order creation.');
  }

  const distanceKm = calculateDistanceKm(
    params.request.pickup.lat,
    params.request.pickup.lng,
    params.request.dropoff.lat,
    params.request.dropoff.lng,
  );
  const appliedFee = roundFareUp(params.appliedFee);
  const platformCommissionRate = 15;
  const platformCommissionAmount = roundMoney(appliedFee * (platformCommissionRate / 100));

  const { data, error } = await params.supabase
    .from('orders')
    .insert({
      customer_id: params.account.customer_profile_id,
      status: 'pending',
      pickup_address: params.request.pickup.address,
      pickup_location: `POINT(${params.request.pickup.lng} ${params.request.pickup.lat})`,
      pickup_contact_name: params.request.pickup.name,
      pickup_contact_phone: params.request.pickup.phone,
      dropoff_address: params.request.dropoff.address,
      dropoff_location: `POINT(${params.request.dropoff.lng} ${params.request.dropoff.lat})`,
      dropoff_contact_name: params.request.customer?.name || params.request.dropoff.name,
      dropoff_contact_phone: params.request.customer?.phone || params.request.dropoff.phone,
      package_size: 'small',
      package_description: params.request.items_summary ?? params.request.items.map((item) => `${item.quantity}x ${item.name}`).join(', '),
      package_notes: params.request.dropoff.instructions,
      distance_km: distanceKm,
      dynamic_price: appliedFee,
      suggested_price: appliedFee,
      final_price: appliedFee,
      vat_amount: 0,
      platform_commission_rate: platformCommissionRate,
      platform_commission_amount: platformCommissionAmount,
      fleet_commission_rate: 0,
      fleet_commission_amount: 0,
      rider_net_amount: roundMoney(appliedFee - platformCommissionAmount),
      payment_method: 'cash',
      delivery_code: params.deliveryCode,
      expires_at: new Date(Date.now() + params.account.dispatch_ttl_minutes * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create Dzpatch order for partner delivery: ${error?.message ?? 'unknown error'}`);
  }

  await params.supabase.from('order_status_history').insert({
    order_id: data.id,
    old_status: null,
    new_status: 'pending',
    changed_by: params.account.customer_profile_id,
    reason: 'Created from partner delivery request',
    metadata: {
      partner_account_id: params.account.id,
      external_order_id: params.request.external_order_id,
      external_reference: params.request.external_reference ?? null,
    },
  });

  return data as { id: string };
}

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return roundMoney(earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundFareUp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 100) * 100;
}

export async function fetchPartnerDeliveryById(params: {
  supabase: any;
  partnerAccountId: string;
  deliveryId: string;
}): Promise<PartnerDeliveryRecord | null> {
  const { data } = await params.supabase
    .from('partner_deliveries')
    .select('*')
    .eq('partner_account_id', params.partnerAccountId)
    .eq('id', params.deliveryId)
    .maybeSingle();

  if (!data) return null;

  const hydrated = await ensurePartnerDeliveryCode({
    supabase: params.supabase,
    row: data as PartnerDeliveryRecord,
  });

  if (!hydrated.ok) throw hydrated.error;
  return hydrated.row;
}

export async function fetchPartnerDeliveryByExternalOrderId(params: {
  supabase: any;
  partnerAccountId: string;
  externalOrderId: string;
}): Promise<PartnerDeliveryRecord | null> {
  const { data } = await params.supabase
    .from('partner_deliveries')
    .select('*')
    .eq('partner_account_id', params.partnerAccountId)
    .eq('external_order_id', params.externalOrderId)
    .maybeSingle();

  if (!data) return null;

  const hydrated = await ensurePartnerDeliveryCode({
    supabase: params.supabase,
    row: data as PartnerDeliveryRecord,
  });

  if (!hydrated.ok) throw hydrated.error;
  return hydrated.row;
}

export async function cancelPartnerDelivery(params: {
  supabase: any;
  row: PartnerDeliveryRecord;
  reason: string | null;
}): Promise<{ ok: true; row: PartnerDeliveryRecord } | { ok: false; message: string; details: Record<string, unknown> }> {
  if (!canCancelPartnerDelivery(params.row.status)) {
    return {
      ok: false,
      message: 'Delivery can no longer be cancelled because pickup has already occurred.',
      details: { current_status: params.row.status },
    };
  }

  const { data, error } = await params.supabase
    .from('partner_deliveries')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      delivery_code_status: 'expired',
      last_error: params.reason ? { cancellation_reason: params.reason } : null,
    })
    .eq('id', params.row.id)
    .select('*')
    .single();

  if (error) throw error;

  return { ok: true, row: data as PartnerDeliveryRecord };
}

async function ensurePartnerDeliveryCode(params: {
  supabase: any;
  row: PartnerDeliveryRecord;
}): Promise<{ ok: true; row: PartnerDeliveryRecord } | { ok: false; error: unknown }> {
  if (isSixDigitDeliveryCode(params.row.delivery_code)) {
    return { ok: true, row: params.row };
  }

  try {
    const generatedCode = generateSixDigitDeliveryCode();
    const generatedAt = new Date().toISOString();
    const { data, error } = await params.supabase
      .from('partner_deliveries')
      .update({
        delivery_code: generatedCode,
        delivery_code_status: 'active',
        delivery_code_generated_at: generatedAt,
      })
      .eq('id', params.row.id)
      .select('*')
      .single();

    if (error) throw error;
    return { ok: true, row: data as PartnerDeliveryRecord };
  } catch (error) {
    return { ok: false, error };
  }
}
