// payment-webhook — receives Paystack webhook events
// Handles: charge.success, transfer.success, transfer.failed
// This is the ONLY place wallet credits happen for payments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

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

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Handle charge.success (wallet funding) ───────────────────────────────
  if (event.event === 'charge.success') {
    const { reference, amount, metadata } = event.data as {
      reference: string;
      amount: number; // kobo
      metadata: { wallet_id?: string; user_id?: string };
    };

    const nairaAmount = amount / 100;
    const walletId = metadata?.wallet_id;

    if (!walletId) {
      console.error('No wallet_id in metadata for reference:', reference);
      return new Response('OK', { status: 200 }); // still return 200 to avoid Paystack retry
    }

    // Call credit_wallet RPC (idempotent — uses reference to prevent double-credit)
    const { error } = await supabase.rpc('credit_wallet', {
      p_wallet_id: walletId,
      p_amount: nairaAmount,
      p_reference: reference,
      p_description: 'Wallet top-up via Paystack',
    });

    if (error) {
      // If it's a unique constraint violation, the transaction already processed — that's fine
      if (error.code === '23505') {
        console.log('Duplicate webhook for reference:', reference, '— skipping');
      } else {
        console.error('credit_wallet error:', error);
        // Return 500 so Paystack retries (only for genuine errors)
        return new Response('Internal error', { status: 500 });
      }
    } else {
      console.log(`Credited ₦${nairaAmount} to wallet ${walletId} (ref: ${reference})`);
    }
  }

  // ── Handle transfer.success (withdrawal paid out) ────────────────────────
  if (event.event === 'transfer.success') {
    const { transfer_code } = event.data as { transfer_code: string };

    await supabase
      .from('withdrawals')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('paystack_transfer_code', transfer_code);

    console.log('Transfer completed:', transfer_code);
  }

  // ── Handle transfer.failed / transfer.reversed ───────────────────────────
  if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const { transfer_code } = event.data as { transfer_code: string };

    // Mark withdrawal failed — admin will need to retry or refund
    await supabase
      .from('withdrawals')
      .update({ status: 'failed' })
      .eq('paystack_transfer_code', transfer_code);

    console.warn(`Transfer ${event.event}:`, transfer_code);
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
