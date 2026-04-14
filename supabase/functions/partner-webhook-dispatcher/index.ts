import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signPartnerWebhookPayload } from '../_shared/partner-webhooks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_ATTEMPTS = Number(Deno.env.get('PARTNER_WEBHOOK_MAX_ATTEMPTS') ?? 8);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Dispatcher is not configured' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: events, error } = await supabase
    .from('partner_webhook_events')
    .select('*')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(25);

  if (error) {
    return json({ error: error.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const event of events ?? []) {
    const { data: account, error: accountError } = await supabase
      .from('partner_accounts')
      .select('id, webhook_url, webhook_secret')
      .eq('id', event.partner_account_id)
      .maybeSingle();

    if (accountError || !account?.webhook_url || !account?.webhook_secret) {
      await markFailed(supabase, event, { message: accountError?.message ?? 'Partner webhook account config missing' });
      results.push({ event_id: event.event_id, ok: false, reason: 'missing_account_config' });
      continue;
    }

    const rawBody = JSON.stringify(event.payload);
    const timestamp = new Date().toISOString();
    const signature = await signPartnerWebhookPayload({
      secret: account.webhook_secret,
      timestamp,
      rawBody,
    });

    try {
      const response = await fetch(account.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dzpatch-Timestamp': timestamp,
          'X-Dzpatch-Signature': signature,
          'X-Dzpatch-Event-Id': event.event_id,
        },
        body: rawBody,
      });

      if (response.ok) {
        await supabase
          .from('partner_webhook_events')
          .update({
            status: 'delivered',
            delivery_attempts: Number(event.delivery_attempts ?? 0) + 1,
            last_delivery_at: new Date().toISOString(),
            last_delivery_error: null,
            next_retry_at: null,
          })
          .eq('id', event.id);
        results.push({ event_id: event.event_id, ok: true });
        continue;
      }

      const text = await response.text().catch(() => '');
      await scheduleRetry(supabase, event, {
        status: response.status,
        body: text.slice(0, 500),
      });
      results.push({ event_id: event.event_id, ok: false, status: response.status });
    } catch (error) {
      await scheduleRetry(supabase, event, {
        message: error instanceof Error ? error.message : String(error),
      });
      results.push({ event_id: event.event_id, ok: false, reason: 'fetch_error' });
    }
  }

  return json({ processed: results.length, results });
});

async function scheduleRetry(supabase: any, event: any, lastError: Record<string, unknown>) {
  const attempts = Number(event.delivery_attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await markFailed(supabase, event, lastError, attempts);
    return;
  }

  const delaySeconds = Math.min(3600, 2 ** attempts * 30);
  await supabase
    .from('partner_webhook_events')
    .update({
      delivery_attempts: attempts,
      last_delivery_at: new Date().toISOString(),
      last_delivery_error: lastError,
      next_retry_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    })
    .eq('id', event.id);
}

async function markFailed(supabase: any, event: any, lastError: Record<string, unknown>, attempts?: number) {
  await supabase
    .from('partner_webhook_events')
    .update({
      status: 'failed',
      delivery_attempts: attempts ?? Number(event.delivery_attempts ?? 0) + 1,
      last_delivery_at: new Date().toISOString(),
      last_delivery_error: lastError,
      next_retry_at: null,
    })
    .eq('id', event.id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
