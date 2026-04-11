import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticatePartnerRequest, insertPartnerAuditLog } from '../_shared/partner-auth.ts';
import { validateCreateDeliveryRequest } from '../_shared/partner-contract.ts';
import { resolveAppliedPartnerPricing } from '../_shared/partner-pricing.ts';
import {
  buildPartnerDeliveryResponse,
  cancelPartnerDelivery,
  createOrReusePartnerDelivery,
  fetchPartnerDeliveryByExternalOrderId,
  fetchPartnerDeliveryById,
} from '../_shared/partner-service.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }));
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(
      { error: { code: 'internal_error', message: 'Partner service is not configured.' } },
      500,
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await authenticatePartnerRequest({ req, supabase });
  if (!auth.ok) {
    return json(
      { error: { code: 'unauthorized_partner', message: auth.message } },
      auth.status,
    );
  }

  try {
    const route = parseRoute(req.url);

    if (req.method === 'POST' && route.length === 0) {
      return await handleCreateDelivery(req, supabase, auth.account);
    }

    if (req.method === 'GET' && route.length === 1) {
      return await handleGetDeliveryById(supabase, auth.account.id, route[0]);
    }

    if (req.method === 'GET' && route.length === 2 && route[0] === 'by-external') {
      return await handleGetDeliveryByExternalOrderId(supabase, auth.account.id, route[1]);
    }

    if (req.method === 'POST' && route.length === 2 && route[1] === 'cancel') {
      return await handleCancelDelivery(req, supabase, auth.account.id, route[0]);
    }

    await insertPartnerAuditLog({
      supabase,
      partnerAccountId: auth.account.id,
      action: 'partner.route_not_found',
      actorType: 'partner',
      payload: { method: req.method, route },
    });

    return json(
      { error: { code: 'invalid_payload', message: 'Unsupported partner route.' } },
      404,
    );
  } catch (error) {
    console.error('partner-deliveries unhandled error:', error);
    await insertPartnerAuditLog({
      supabase,
      partnerAccountId: auth.account.id,
      action: 'partner.unhandled_error',
      actorType: 'system',
      payload: { message: error instanceof Error ? error.message : String(error) },
    });
    return json(
      { error: { code: 'internal_error', message: 'Unexpected partner service error.' } },
      500,
    );
  }
});

async function handleCreateDelivery(req: Request, supabase: any, account: any): Promise<Response> {
  const idempotencyKey = req.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey) {
    return json(
      {
        error: {
          code: 'invalid_payload',
          message: 'Idempotency-Key header is required.',
          details: { header: 'Idempotency-Key' },
        },
      },
      400,
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(
      { error: { code: 'invalid_payload', message: 'Request body must be valid JSON.' } },
      400,
    );
  }

  const validation = validateCreateDeliveryRequest(payload);
  if (!validation.ok) {
    await insertPartnerAuditLog({
      supabase,
      partnerAccountId: account.id,
      action: 'partner.delivery_validation_failed',
      actorType: 'partner',
      payload: validation.error.details ?? {},
    });
    return json({ error: validation.error }, 400);
  }

  const pricing = resolveAppliedPartnerPricing(account, validation.value.pricing.partner_calculated_fee);
  if (!pricing.ok) {
    await insertPartnerAuditLog({
      supabase,
      partnerAccountId: account.id,
      action: 'partner.delivery_pricing_rejected',
      actorType: 'service',
      payload: pricing.error.details ?? {},
    });
    return json({ error: pricing.error }, 409);
  }

  const created = await createOrReusePartnerDelivery({
    supabase,
    account,
    request: validation.value,
    idempotencyKey,
    appliedPricing: pricing.value,
  });

  if (created.kind === 'conflict') {
    await insertPartnerAuditLog({
      supabase,
      partnerAccountId: account.id,
      action: 'partner.delivery_conflict',
      actorType: 'partner',
      payload: created.details ?? {},
    });
    return json(
      { error: { code: created.code, message: created.message, details: created.details } },
      409,
    );
  }

  await insertPartnerAuditLog({
    supabase,
    partnerAccountId: account.id,
    action: created.kind === 'created' ? 'partner.delivery_created' : 'partner.delivery_reused',
    actorType: 'partner',
    payload: {
      delivery_id: created.row.id,
      external_order_id: created.row.external_order_id,
      pricing_source: created.row.pricing_source,
    },
  });

  return json(buildPartnerDeliveryResponse(created.row), created.kind === 'created' ? 201 : 200);
}

async function handleGetDeliveryById(supabase: any, partnerAccountId: string, deliveryId: string): Promise<Response> {
  const row = await fetchPartnerDeliveryById({ supabase, partnerAccountId, deliveryId });
  if (!row) {
    return json(
      { error: { code: 'delivery_not_found', message: 'Delivery not found.' } },
      404,
    );
  }

  return json(buildPartnerDeliveryResponse(row));
}

async function handleGetDeliveryByExternalOrderId(
  supabase: any,
  partnerAccountId: string,
  externalOrderId: string,
): Promise<Response> {
  const row = await fetchPartnerDeliveryByExternalOrderId({
    supabase,
    partnerAccountId,
    externalOrderId,
  });

  if (!row) {
    return json(
      { error: { code: 'delivery_not_found', message: 'Delivery not found.' } },
      404,
    );
  }

  return json(buildPartnerDeliveryResponse(row));
}

async function handleCancelDelivery(
  req: Request,
  supabase: any,
  partnerAccountId: string,
  deliveryId: string,
): Promise<Response> {
  const existing = await fetchPartnerDeliveryById({ supabase, partnerAccountId, deliveryId });
  if (!existing) {
    return json(
      { error: { code: 'delivery_not_found', message: 'Delivery not found.' } },
      404,
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  const reason = typeof body?.reason === 'string' ? body.reason.trim() || null : null;
  const cancelled = await cancelPartnerDelivery({ supabase, row: existing, reason });
  if (!cancelled.ok) {
    return json(
      {
        error: {
          code: 'delivery_cannot_be_cancelled',
          message: cancelled.message,
          details: cancelled.details,
        },
      },
      409,
    );
  }

  await insertPartnerAuditLog({
    supabase,
    partnerAccountId,
    action: 'partner.delivery_cancelled',
    actorType: 'partner',
    payload: { delivery_id: deliveryId, reason },
  });

  return json(buildPartnerDeliveryResponse(cancelled.row));
}

function parseRoute(url: string): string[] {
  const pathname = new URL(url).pathname;
  const marker = '/partner-deliveries';
  const index = pathname.indexOf(marker);
  const suffix = index >= 0 ? pathname.slice(index + marker.length) : pathname;
  return suffix
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
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
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  return response;
}
