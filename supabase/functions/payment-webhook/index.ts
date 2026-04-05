// payment-webhook — receives Paystack webhook events
// Handles: charge.success, transfer.success, transfer.failed
// This is the ONLY place wallet credits happen for payments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getWebhookAction,
  isDuplicateCreditWalletError,
  parsePaystackWebhookBody,
} from '../_shared/payment-flow.ts';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();

  // ── Verify Paystack signature ────────────────────────────────────────────
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const expectedSig = await hmacSha512(PAYSTACK_SECRET, rawBody);

  if (signature !== expectedSig) {
    console.error('Invalid Paystack signature');
    return new Response('Invalid signature', { status: 401 });
  }

  const parsed = parsePaystackWebhookBody(rawBody);
  if (!parsed.ok) {
    return new Response('Invalid JSON', { status: parsed.status });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const action = getWebhookAction(parsed.event);

  if (action.type === 'ignore') {
    if (action.reason === 'missing_wallet_id') {
      const reference = (parsed.event.data.reference as string | undefined) ?? 'unknown';
      console.error('No wallet_id in metadata for reference:', reference);
    } else if (action.reason !== 'unsupported_event') {
      console.warn('Ignoring webhook due to missing required data:', action.reason);
    }
  }

  if (action.type === 'credit_wallet') {
    const { error } = await supabase.rpc('credit_wallet', action.args);

    if (error) {
      if (isDuplicateCreditWalletError(error)) {
        console.log('Duplicate webhook for reference:', action.reference, '— skipping');
      } else {
        console.error('credit_wallet error:', error);
        return new Response('Internal error', { status: 500 });
      }
    } else {
      console.log(`Credited ₦${action.nairaAmount} to wallet ${action.walletId} (ref: ${action.reference})`);
    }
  }

  if (action.type === 'update_withdrawal') {
    await supabase
      .from('withdrawals')
      .update(action.updates)
      .eq('paystack_transfer_code', action.transferCode);

    if (action.updates.status === 'completed') {
      console.log('Transfer completed:', action.transferCode);
    } else {
      console.warn(`Transfer ${action.updates.rejection_reason}:`, action.transferCode);
    }
  }

  if (action.type === 'ignore' && action.reason === 'missing_wallet_id') {
      return new Response('OK', { status: 200 }); // still return 200 to avoid Paystack retry
  }

  // Always return 200 — Paystack retries on non-200
  return new Response('OK', { status: 200 });
});

// ─── HMAC-SHA512 helper (Deno std crypto) ────────────────────────────────────

async function hmacSha512(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
