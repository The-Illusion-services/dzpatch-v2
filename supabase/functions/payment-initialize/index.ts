// payment-initialize — creates a Paystack transaction server-side
// Client calls this, gets back authorization_url, opens WebView

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PAYSTACK_CALLBACK_URL = 'https://dzpatch.co/paystack-callback';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // ── Auth: verify JWT ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('payment-initialize missing Supabase env configuration');
    return json({ error: 'Payment service is not configured correctly.' }, 500);
  }

  if (!PAYSTACK_SECRET) {
    console.error('payment-initialize missing PAYSTACK_SECRET_KEY');
    return json({ error: 'Payment service is temporarily unavailable.' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Parse request ────────────────────────────────────────────────────────
  let body: {
    amount: number;
    wallet_id: string;
    method?: 'card' | 'bank_transfer' | 'ussd';
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { amount, wallet_id, method } = body;

  if (!amount || amount < 100) {
    return json({ error: 'Minimum amount is ₦100' }, 400);
  }
  if (!wallet_id) {
    return json({ error: 'wallet_id is required' }, 400);
  }

  // ── Verify wallet belongs to user ────────────────────────────────────────
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('id, owner_id')
    .eq('id', wallet_id)
    .eq('owner_id', user.id)
    .single();

  if (walletError || !wallet) {
    return json({ error: 'Wallet not found' }, 404);
  }

  // ── Get user's email ─────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single();

  const email = resolvePaymentEmail(profile?.email, user.email, user.id);

  // ── Generate unique reference ────────────────────────────────────────────
  const reference = `FUND-${user.id.slice(0, 8)}-${Date.now()}`;

  let channels: string[] | undefined = undefined;
  if (method === 'card' || method === 'bank_transfer' || method === 'ussd') {
    channels = [method];
  }

  // ── Call Paystack Initialize Transaction ─────────────────────────────────
  const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amount * 100, // kobo
      reference,
      channels,
      callback_url: PAYSTACK_CALLBACK_URL,
      metadata: {
        wallet_id,
        user_id: user.id,
        custom_fields: [
          {
            display_name: 'Customer Name',
            variable_name: 'customer_name',
            value: profile?.full_name ?? 'DZpatch Customer',
          },
          {
            display_name: 'Service',
            variable_name: 'service',
            value: 'DZpatch Wallet Funding',
          },
        ],
      },
    }),
  });

  const paystackData = await paystackRes.json().catch(() => null);

  if (!paystackRes.ok || !paystackData?.status || !paystackData?.data?.authorization_url) {
    console.error('Paystack initialize failed:', {
      status: paystackRes.status,
      body: paystackData,
      email,
      reference,
      method,
    });
    return json({
      error: paystackData?.message ?? `Payment initialization failed (${paystackRes.status}).`,
    }, 502);
  }

  // ── Record pending transaction ───────────────────────────────────────────
  return json({
    authorization_url: paystackData.data.authorization_url,
    reference,
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function resolvePaymentEmail(
  profileEmail: string | null | undefined,
  authEmail: string | null | undefined,
  userId: string,
) {
  const email = profileEmail?.trim() || authEmail?.trim();
  if (email) {
    return email;
  }

  return `${userId}@wallet.dzpatch.local`;
}
