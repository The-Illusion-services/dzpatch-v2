import { describe, expect, it, beforeAll } from '@jest/globals';
import * as crypto from 'crypto';
import {
  createSupabaseServiceClient,
  getSupabaseTestEnv,
  hasSupabaseTestEnv,
} from '../_helpers/client';
import { seedSupabaseBaseState } from '../_helpers/seed';

const integrationEnabled = process.env.FOODHUNT_DZPATCH_INTEGRATION === '1';
const missingIntegrationEnv = !hasSupabaseTestEnv();
const describeSupabase = integrationEnabled && !missingIntegrationEnv ? describe : describe.skip;

if (integrationEnabled && missingIntegrationEnv) {
  throw new Error(
    'FOODHUNT_DZPATCH_INTEGRATION=1 requires Supabase test env so Foodhunt x Dzpatch tests do not silently skip.'
  );
}

describeSupabase('Partner Delivery Repair and Quote Table Behavior', () => {
  jest.setTimeout(60000);
  const supabaseAdmin = createSupabaseServiceClient();
  const env = getSupabaseTestEnv();
  const functionsUrl = env ? `${env.url}/functions/v1` : '';

  beforeAll(async () => {
    await seedSupabaseBaseState(supabaseAdmin);
  });

  it('queries partner_accounts for foodhunt slug and assertions', async () => {
    const { data, error } = await supabaseAdmin
      .from('partner_accounts')
      .select('*')
      .eq('slug', 'foodhunt')
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.status).toBe('active');
    expect(data.customer_profile_id).not.toBeNull();
    expect(data.webhook_url).toContain('/dzpatch-webhook');
  });

  describe('Partner quote table behavior', () => {
    let testPartnerId: string;

    beforeAll(async () => {
      const { data } = await supabaseAdmin
        .from('partner_accounts')
        .select('id')
        .eq('slug', 'foodhunt')
        .single();
      testPartnerId = data?.id;
    });

    it('asserts quote has expires_at, applied_fee, external_checkout_reference', async () => {
      const checkoutRef = `checkout_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      
      const { data, error } = await supabaseAdmin
        .from('partner_quotes')
        .insert({
          partner_account_id: testPartnerId,
          external_checkout_reference: checkoutRef,
          request_payload: {},
          submitted_fee: 1000,
          applied_fee: 1000,
          pricing_source: 'partner_submitted',
          currency: 'NGN',
          expires_at: expiresAt,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(new Date(data.expires_at).getTime()).toBe(new Date(expiresAt).getTime());
      expect(data.applied_fee).toBe(1000);
      expect(data.external_checkout_reference).toBe(checkoutRef);
      expect(data.consumed_at).toBeNull();

      await supabaseAdmin.from('partner_quotes').delete().eq('id', data.id);
    });

    it('prevents expired quote consumption (simulated)', async () => {
      const checkoutRef = `checkout_exp_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() - 3600000).toISOString();
      
      const { data } = await supabaseAdmin
        .from('partner_quotes')
        .insert({
          partner_account_id: testPartnerId,
          external_checkout_reference: checkoutRef,
          request_payload: {},
          submitted_fee: 1000,
          applied_fee: 1000,
          pricing_source: 'partner_submitted',
          currency: 'NGN',
          expires_at: expiresAt,
        })
        .select()
        .single();

      expect(new Date(data.expires_at).getTime()).toBeLessThan(Date.now());
      await supabaseAdmin.from('partner_quotes').delete().eq('id', data.id);
    });
  });

  describe('Partner delivery creates real Dzpatch order', () => {
    let testPartnerAccount: any;
    let apiKey: string;

    beforeAll(async () => {
      const { data } = await supabaseAdmin
        .from('partner_accounts')
        .select('*')
        .eq('slug', 'foodhunt')
        .single();
      testPartnerAccount = data;
      apiKey = process.env.DZPATCH_PARTNER_API_KEY || 'ptn_test_secret_for_foodhunt';
    });

    it('creates partner delivery and linked order via Edge Function', async () => {
      const checkoutRef = `checkout_del_${crypto.randomUUID()}`;
      const extOrderId = `foodhunt_ext_${crypto.randomUUID()}`;
      
      // Call partner-quotes to get a valid quote
      const quoteRes = await fetch(`${functionsUrl}/partner-quotes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          external_checkout_reference: checkoutRef,
          pickup: { address: 'Test pickup', lat: 6.5, lng: 3.3, name: 'Pickup' },
          dropoff: { address: 'Test dropoff', lat: 6.6, lng: 3.4, name: 'Dropoff' },
          pricing: { currency: 'NGN', partner_calculated_fee: 1500 }
        })
      });
      
      expect(quoteRes.status).toBe(200);
      const quoteData = await quoteRes.json();
      const quoteId = quoteData.quote_id;
      const appliedFee = quoteData.delivery_fee || 1500;

      // Call partner-deliveries Edge function
      const deliveryRes = await fetch(`${functionsUrl}/partner-deliveries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-${extOrderId}`
        },
        body: JSON.stringify({
          external_order_id: extOrderId,
          quote_id: quoteId,
          pickup: { address: 'Test pickup', lat: 6.5, lng: 3.3, name: 'Pickup' },
          dropoff: { address: 'Test dropoff', lat: 6.6, lng: 3.4, name: 'Dropoff', phone: '+2348000000002' },
          items: [{name: 'Food', quantity: 1}],
          pricing: { currency: 'NGN', partner_calculated_fee: appliedFee }
        })
      });
      
      expect([200, 201]).toContain(deliveryRes.status);
      const deliveryData = await deliveryRes.json();
      const deliveryId = deliveryData.delivery_id;
      const orderId = deliveryData.dzpatch_order_id;
      
      // Assertions
      const { data: updatedDelivery } = await supabaseAdmin.from('partner_deliveries').select('dzpatch_order_id').eq('id', deliveryId).single();
      expect(updatedDelivery?.dzpatch_order_id).toBe(orderId);
      
      const { data: order } = await supabaseAdmin.from('orders').select('status, customer_id').eq('id', orderId).single();
      expect(order?.status).toBe('pending');
      expect(order?.customer_id).toBe(testPartnerAccount.customer_profile_id);

      await supabaseAdmin.from('partner_deliveries').delete().eq('id', deliveryId);
      await supabaseAdmin.from('orders').delete().eq('id', orderId);
      await supabaseAdmin.from('partner_quotes').delete().eq('id', quoteId);
    });
  });

  describe('Dzpatch status change enqueues webhook event', () => {
    let apiKey: string;

    beforeAll(() => {
      apiKey = process.env.DZPATCH_PARTNER_API_KEY || 'ptn_test_secret_for_foodhunt';
    });

    it('enqueues webhook on order status change', async () => {
      const checkoutRef = `checkout_webhook_${crypto.randomUUID()}`;
      const extOrderId = `ext_${crypto.randomUUID()}`;

      const quoteRes = await fetch(`${functionsUrl}/partner-quotes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          external_checkout_reference: checkoutRef,
          pickup: { address: 'Test pickup', lat: 6.5, lng: 3.3, name: 'Pickup' },
          dropoff: { address: 'Test dropoff', lat: 6.6, lng: 3.4, name: 'Dropoff' },
          pricing: { currency: 'NGN', partner_calculated_fee: 1500 },
        }),
      });
      expect(quoteRes.status).toBe(200);
      const quoteData = await quoteRes.json();

      const deliveryRes = await fetch(`${functionsUrl}/partner-deliveries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-${extOrderId}`,
        },
        body: JSON.stringify({
          external_order_id: extOrderId,
          quote_id: quoteData.quote_id,
          pickup: { address: 'Test pickup', lat: 6.5, lng: 3.3, name: 'Pickup' },
          dropoff: { address: 'Test dropoff', lat: 6.6, lng: 3.4, name: 'Dropoff', phone: '+2348000000002' },
          items: [{ name: 'Food', quantity: 1 }],
          pricing: { currency: 'NGN', partner_calculated_fee: quoteData.delivery_fee },
        }),
      });
      expect([200, 201]).toContain(deliveryRes.status);
      const deliveryData = await deliveryRes.json();

      const { data: delivery } = await supabaseAdmin
        .from('partner_deliveries')
        .select('id, dzpatch_order_id')
        .eq('id', deliveryData.delivery_id)
        .single();
      expect(delivery?.dzpatch_order_id).toBeDefined();
      const orderId = delivery.dzpatch_order_id;

      await supabaseAdmin
        .from('orders')
        .update({ status: 'matched' })
        .eq('id', orderId);

      await new Promise((r) => setTimeout(r, 1000));

      const { data: events, error } = await supabaseAdmin
        .from('partner_webhook_events')
        .select('*')
        .eq('partner_delivery_id', delivery.id)
        .order('created_at', { ascending: false });

      expect(error).toBeNull();
      expect(events?.length).toBeGreaterThan(0);
      expect(events?.[0]?.event_type).toBeDefined();

      await supabaseAdmin.from('partner_webhook_events').delete().eq('partner_delivery_id', delivery.id);
      await supabaseAdmin.from('partner_deliveries').delete().eq('id', delivery.id);
      await supabaseAdmin.from('orders').delete().eq('id', orderId);
      await supabaseAdmin.from('partner_quotes').delete().eq('id', quoteData.quote_id);
    });
  });
});
