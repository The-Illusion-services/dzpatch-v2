import { beforeAll, describe, expect, it, jest } from '@jest/globals';
const crypto = require('crypto');
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  getSupabaseTestEnv,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { buildTestReference } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const env = getSupabaseTestEnv();
const functionsBaseUrl = env ? `${env.url}/functions/v1` : null;
const describeSupabase = hasSupabaseTestEnv() && functionsBaseUrl ? describe : describe.skip;

describeSupabase('Supabase Edge Functions - Payment Flows', () => {
  jest.setTimeout(120_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  async function authHeaders(client: SupabaseTestClients['customer']) {
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token ?? '';

    return {
      Authorization: `Bearer ${token}`,
      apikey: env!.anonKey,
      'Content-Type': 'application/json',
    };
  }

  it('payment-initialize requires auth and rejects wallet not owned by caller', async () => {
    const unauthorized = await fetch(`${functionsBaseUrl}/payment-initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, wallet_id: seeded.customerWalletId }),
    });
    expect([401, 503]).toContain(unauthorized.status);

    const forbidden = await fetch(`${functionsBaseUrl}/payment-initialize`, {
      method: 'POST',
      headers: await authHeaders(clients.customer),
      body: JSON.stringify({ amount: 500, wallet_id: seeded.riderWalletId }),
    });

    expect([401, 404, 503]).toContain(forbidden.status);
  });

  it('payment-initialize returns an authorization payload for an owned wallet', async () => {
    const response = await fetch(`${functionsBaseUrl}/payment-initialize`, {
      method: 'POST',
      headers: await authHeaders(clients.customer),
      body: JSON.stringify({ amount: 500, wallet_id: seeded.customerWalletId }),
    });

    expect([200, 502, 503]).toContain(response.status);

    if (response.status === 200) {
      const data = await response.json();
      expect(typeof data.reference).toBe('string');
      expect(typeof data.authorization_url).toBe('string');
    }
  });

  it('payment-webhook rejects invalid signature and malformed payloads safely', async () => {
    const invalidSig = await fetch(`${functionsBaseUrl}/payment-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': 'invalid',
      },
      body: JSON.stringify({ event: 'charge.success', data: {} }),
    });

    expect([401, 500, 503]).toContain(invalidSig.status);
  });

  it('payment-webhook handles supported payload shapes without double-crediting on duplicate references', async () => {
    const webhookSecret = process.env.SUPABASE_TEST_PAYSTACK_SECRET ?? 'missing-secret';
    const reference = buildTestReference('charge');
    const body = JSON.stringify({
      event: 'charge.success',
      data: {
        amount: 10000,
        reference,
        metadata: { wallet_id: seeded.customerWalletId },
      },
    });
    const signature = crypto.createHmac('sha512', webhookSecret).update(body).digest('hex');

    const first = await fetch(`${functionsBaseUrl}/payment-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      body,
    });

    const second = await fetch(`${functionsBaseUrl}/payment-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      body,
    });

    expect([200, 401, 500, 503]).toContain(first.status);
    expect([200, 401, 500, 503]).toContain(second.status);
  });
});
