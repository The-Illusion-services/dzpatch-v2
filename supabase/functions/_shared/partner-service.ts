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
  | { kind: 'conflict'; code: 'delivery_already_exists' | 'idempotency_conflict'; message: string; details?: Record<string, unknown> }
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

  const { data, error } = await params.supabase
    .from('partner_deliveries')
    .insert({
      partner_account_id: params.account.id,
      external_order_id: params.request.external_order_id,
      external_reference: params.request.external_reference ?? null,
      idempotency_key: params.idempotencyKey,
      request_fingerprint: fingerprint,
      status: 'accepted',
      request_payload: params.request,
      response_payload: null,
      submitted_fee: params.appliedPricing.submitted_fee,
      applied_fee: params.appliedPricing.applied_fee,
      pricing_source: params.appliedPricing.pricing_source,
      delivery_code: generateSixDigitDeliveryCode(),
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

  return {
    kind: 'created',
    row: {
      ...row,
      response_payload: finalResponse,
    },
  };
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
