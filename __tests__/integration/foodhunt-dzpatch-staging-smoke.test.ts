import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const integrationEnabled = process.env.FOODHUNT_DZPATCH_INTEGRATION === '1';

const dzpatchUrl = process.env.DZPATCH_SUPABASE_URL;
const dzpatchServiceKey = process.env.DZPATCH_SUPABASE_SERVICE_ROLE_KEY;
const foodhuntUrl = process.env.FOODHUNT_SUPABASE_URL;
const foodhuntServiceKey = process.env.FOODHUNT_SUPABASE_SERVICE_ROLE_KEY;
const foodhuntAnonKey = process.env.FOODHUNT_SUPABASE_ANON_KEY;

const dzpatchApiKey = process.env.DZPATCH_PARTNER_API_KEY;
const dzpatchWebhookSecret = process.env.DZPATCH_WEBHOOK_SECRET;

const foodhuntCustomerEmail = process.env.FOODHUNT_TEST_CUSTOMER_EMAIL;
const foodhuntCustomerPassword = process.env.FOODHUNT_TEST_CUSTOMER_PASSWORD;
const foodhuntTestRestaurantId = process.env.FOODHUNT_TEST_RESTAURANT_ID;
const foodhuntTestDeliveryAddressId = process.env.FOODHUNT_TEST_DELIVERY_ADDRESS_ID;

const describeStagingSmoke = integrationEnabled ? describe : describe.skip;

if (integrationEnabled) {
  const missing = [];
  if (!dzpatchUrl) missing.push('DZPATCH_SUPABASE_URL');
  if (!dzpatchServiceKey) missing.push('DZPATCH_SUPABASE_SERVICE_ROLE_KEY');
  if (!foodhuntUrl) missing.push('FOODHUNT_SUPABASE_URL');
  if (!foodhuntServiceKey) missing.push('FOODHUNT_SUPABASE_SERVICE_ROLE_KEY');
  if (!foodhuntAnonKey) missing.push('FOODHUNT_SUPABASE_ANON_KEY');
  if (!dzpatchApiKey) missing.push('DZPATCH_PARTNER_API_KEY');
  if (!dzpatchWebhookSecret) missing.push('DZPATCH_WEBHOOK_SECRET');
  if (!foodhuntCustomerEmail) missing.push('FOODHUNT_TEST_CUSTOMER_EMAIL');
  if (!foodhuntCustomerPassword) missing.push('FOODHUNT_TEST_CUSTOMER_PASSWORD');
  if (!foodhuntTestRestaurantId) missing.push('FOODHUNT_TEST_RESTAURANT_ID');
  if (!foodhuntTestDeliveryAddressId) missing.push('FOODHUNT_TEST_DELIVERY_ADDRESS_ID');

  if (missing.length > 0) {
    throw new Error(`FOODHUNT_DZPATCH_INTEGRATION=1 but missing required env vars: ${missing.join(', ')}`);
  }
}

const dzpatchFunctionsUrl = `${dzpatchUrl}/functions/v1`;
const foodhuntFunctionsUrl = `${foodhuntUrl}/functions/v1`;

function signDzpatchWebhook(body: string, secret: string, timestamp: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

describeStagingSmoke('Staging Function Smoke Tests', () => {
  jest.setTimeout(60_000);

  let foodhuntAdmin: any;
  let customerToken: string;

  let generatedQuoteId: string;
  let generatedDeliveryFee: number;
  let generatedFoodhuntOrderId: string;
  let seededAddressId: string;

  beforeAll(async () => {
    foodhuntAdmin = createClient(foodhuntUrl!, foodhuntServiceKey!);

    // Ensure the test customer exists in Foodhunt staging
    const { data: userList } = await foodhuntAdmin.auth.admin.listUsers();
    let testUser = userList.users.find((u: any) => u.email === foodhuntCustomerEmail);

    if (!testUser) {
      const { data: newUser, error: createError } = await foodhuntAdmin.auth.admin.createUser({
        email: foodhuntCustomerEmail,
        password: foodhuntCustomerPassword,
        email_confirm: true
      });
      if (createError) throw new Error(`Failed to seed staging customer: ${createError.message}`);
      testUser = newUser.user;
    } else {
      await foodhuntAdmin.auth.admin.updateUserById(testUser.id, {
        password: foodhuntCustomerPassword
      });
    }

    // Ensure they have a profile row
    await foodhuntAdmin.from('profiles').upsert({
      id: testUser.id,
      email: foodhuntCustomerEmail,
      full_name: 'Staging Smoke Tester'
    });

    // Seed a valid address for this specific user to avoid 401 ownership errors
    const { data: addressData, error: addressError } = await foodhuntAdmin.from('addresses').upsert({
      user_id: testUser.id,
      name: 'Smoke Test Home',
      street_address: '10 Staging Lane',
      city: 'Calabar',
      state: 'Cross River',
      postal_code: '540222',
      latitude: 4.95,
      longitude: 8.32
    }).select().single();

    if (addressError) throw new Error(`Failed to seed address: ${addressError.message}`);
    seededAddressId = addressData.id;

    // Authenticate Foodhunt customer
    const authClient = createClient(foodhuntUrl!, foodhuntAnonKey!);
    const { data, error } = await authClient.auth.signInWithPassword({
      email: foodhuntCustomerEmail!,
      password: foodhuntCustomerPassword!,
    });

    if (error || !data.session) {
      throw new Error(`Failed to sign in Foodhunt staging customer: ${error?.message}`);
    }
    customerToken = data.session.access_token;
  });

  describe('1. Public rejection checks', () => {
    it('POST Dzpatch partner-quotes with no bearer -> 401', async () => {
      const res = await fetch(`${dzpatchFunctionsUrl}/partner-quotes`, { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('POST Dzpatch partner-deliveries with no bearer -> 401', async () => {
      const res = await fetch(`${dzpatchFunctionsUrl}/partner-deliveries`, { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('POST Foodhunt get-dzpatch-delivery-quote with no user token -> 401', async () => {
      const res = await fetch(`${foodhuntFunctionsUrl}/get-dzpatch-delivery-quote`, { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('POST Foodhunt dzpatch-webhook with bad signature -> 401', async () => {
      const res = await fetch(`${foodhuntFunctionsUrl}/dzpatch-webhook`, {
        method: 'POST',
        headers: {
          'X-Dzpatch-Signature': 'bad-sig',
          'X-Dzpatch-Timestamp': new Date().toISOString(),
          'X-Dzpatch-Event-Id': 'evt-123',
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('POST Foodhunt paystack-webhook with bad signature -> 401', async () => {
      const res = await fetch(`${foodhuntFunctionsUrl}/paystack-webhook`, {
        method: 'POST',
        headers: {
          'x-paystack-signature': 'bad-sig',
        },
        body: JSON.stringify({}),
      });
      // Note: If this returns 500, check if PAYSTACK_SECRET_KEY is set in Supabase project secrets
      if (res.status === 500) {
        const err = await res.json();
        console.warn('Paystack webhook 500. Check project secrets:', err);
      }
      expect(res.status).toBe(401);
    });
  });

  describe('2. Authenticated quote smoke', () => {
    it('generates a quote and stores it in Foodhunt dispatch_quotes', async () => {
      const checkoutRef = `smoke-ref-${crypto.randomUUID()}`;
      
      const res = await fetch(`${foodhuntFunctionsUrl}/get-dzpatch-delivery-quote`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurant_id: foodhuntTestRestaurantId,
          delivery_address_id: seededAddressId,
          checkout_reference: checkoutRef,
        }),
      });

      if (res.status !== 200) {
        console.error('Quote Fail Body:', await res.text());
      }
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.quote_id).toBeDefined();
      expect(data.delivery_fee).toBeDefined();

      generatedQuoteId = data.quote_id;
      generatedDeliveryFee = data.delivery_fee;

      const { data: quoteRow, error } = await foodhuntAdmin
        .from('dispatch_quotes')
        .select('*')
        .eq('quote_id', generatedQuoteId)
        .single();
        
      expect(error).toBeNull();
      expect(quoteRow).toBeDefined();
    });
  });

  describe('3. Partner delivery smoke', () => {
    it('creates a direct Dzpatch partner delivery', async () => {
      const externalOrderId = crypto.randomUUID(); // Must be valid UUID
      generatedFoodhuntOrderId = externalOrderId;
      
      const payload = {
        external_order_id: externalOrderId,
        quote_id: generatedQuoteId,
        pickup: {
          name: 'Smoke Test Pickup',
          address: '10 Test St, Lagos',
          lat: 6.5,
          lng: 3.3
        },
        dropoff: {
          name: 'Smoke Test Dropoff',
          phone: '+2348000000002',
          address: '20 Test Ave, Lagos',
          lat: 6.6,
          lng: 3.4
        },
        items: [{ name: 'Smoke Burger', quantity: 2 }],
        customer: null,
        pricing: {
          currency: 'NGN',
          partner_calculated_fee: generatedDeliveryFee
        },
        meta: {}
      };

      const res = await fetch(`${dzpatchFunctionsUrl}/partner-deliveries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${dzpatchApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-${externalOrderId}`
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        console.error('Partner Delivery 401: Check DZPATCH_PARTNER_API_KEY in .env.test.local');
      }
      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.delivery_id).toBeDefined();
    });
  });

  describe('4. Webhook idempotency smoke', () => {
    it('handles idempotent delivery.status_changed securely', async () => {
      const eventId = `smoke-evt-${crypto.randomUUID()}`;
      
      const { data: customer } = await foodhuntAdmin.auth.admin.listUsers();
      const testCustomer = customer.users.find((u: any) => u.email === foodhuntCustomerEmail);
      
      // Ensure the order exists so the webhook doesn't 404.
      const { error: orderInsertError } = await foodhuntAdmin.from('orders').insert({
        id: generatedFoodhuntOrderId,
        status: 'ready_for_pickup',
        user_id: testCustomer?.id,
        restaurant_id: foodhuntTestRestaurantId,
        delivery_address_id: seededAddressId,
        delivery_fee: generatedDeliveryFee ?? 0,
        service_charge: 0,
        total_amount: 1000,
        payment_method: 'card',
        payment_status: 'completed',
        metadata: {
          smoke_test: true,
          dzpatch_quote_id: generatedQuoteId,
        },
      });
      expect(orderInsertError).toBeNull();

      const payload = {
        event_type: 'delivery.status_changed',
        delivery: {
          external_order_id: generatedFoodhuntOrderId,
          status: 'picked_up'
        }
      };

      const body = JSON.stringify(payload);
      const timestamp = new Date().toISOString();
      const signature = signDzpatchWebhook(body, dzpatchWebhookSecret!, timestamp);

      const res1 = await fetch(`${foodhuntFunctionsUrl}/dzpatch-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dzpatch-Signature': signature,
          'X-Dzpatch-Timestamp': timestamp,
          'X-Dzpatch-Event-Id': eventId,
        },
        body,
      });

      if (res1.status !== 200) {
        console.error('Webhook Fail Body:', await res1.text());
      }
      expect(res1.status).toBe(200);

      const res2 = await fetch(`${foodhuntFunctionsUrl}/dzpatch-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dzpatch-Signature': signature,
          'X-Dzpatch-Timestamp': timestamp,
          'X-Dzpatch-Event-Id': eventId,
        },
        body,
      });

      expect(res2.status).toBe(200);

      const { data: events } = await foodhuntAdmin
        .from('dispatch_events')
        .select('*')
        .eq('event_id', eventId);

      expect(events.length).toBe(1);

      // Cleanup
      await foodhuntAdmin.from('dispatch_events').delete().eq('event_id', eventId);
      await foodhuntAdmin.from('orders').delete().eq('id', generatedFoodhuntOrderId);
      await foodhuntAdmin.from('addresses').delete().eq('id', seededAddressId);
    });
  });
});
