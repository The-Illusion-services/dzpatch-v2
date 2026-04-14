import { beforeAll, describe, expect, it, jest } from '@jest/globals';
const crypto = require('crypto');
import {
  createSupabaseServiceClient,
  getSupabaseTestEnv,
  hasSupabaseTestEnv,
  createAuthenticatedSupabaseTestClient,
} from '../supabase/_helpers/client';

const env = getSupabaseTestEnv();
const mobileFunctionsUrl = env ? `${env.url}/functions/v1` : null;
const adminApiUrl = process.env.ADMIN_API_URL || 'http://localhost:1925/api/admin';
const integrationEnabled = process.env.FOODHUNT_DZPATCH_INTEGRATION === '1';
const missingIntegrationEnv = !hasSupabaseTestEnv() || !mobileFunctionsUrl;
const describeSupabase = !missingIntegrationEnv ? describe : describe.skip;

if (integrationEnabled && missingIntegrationEnv) {
  throw new Error(
    'FOODHUNT_DZPATCH_INTEGRATION=1 requires Supabase test env so Foodhunt x Dzpatch tests do not silently skip.',
  );
}

type FoodhuntTestClients = {
  customer: any;
  customerTwo: any;
  admin: any;
};

type FoodhuntSeededUsers = {
  customerId: string;
  customerTwoId: string;
  adminId: string;
};

/**
 * Foodhunt x Dzpatch Integration Tests
 */
describeSupabase('Foodhunt x Dzpatch Integration', () => {
  jest.setTimeout(120_000);

  let clients: FoodhuntTestClients;
  let seeded: FoodhuntSeededUsers;
  let ownerClient: any;
  let ownerId: string;
  let supabaseAdmin = createSupabaseServiceClient();

  async function createFoodhuntAuthUser(email: string, password: string, firstName: string, lastName: string, isAdmin = false) {
    const existingList = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (existingList.error) {
      throw new Error(`Failed to inspect auth users for ${email}: ${existingList.error.message}`);
    }

    const existing = existingList.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    let userId = existing?.id;

    if (!userId) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

      if (created.error || !created.data.user) {
        throw new Error(`Failed to create auth user ${email}: ${created.error?.message ?? 'unknown error'}`);
      }

      userId = created.data.user.id;
    }

    await ensurePublicUser(userId, email, firstName, lastName, isAdmin);

    return userId;
  }

  async function ensurePublicUser(userId: string, email: string, firstName = 'Test', lastName = 'User', isAdmin = false) {
    const { error } = await supabaseAdmin.from('users').upsert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      phone_number: '+2340000009999',
      onboarding_complete: true,
      is_admin: isAdmin,
    });

    if (error) {
      throw new Error(`Failed to upsert public.users row for ${email}: ${error.message}`);
    }
  }

  async function ensureCustomerAddress(userId: string) {
    const existing = await supabaseAdmin
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      throw new Error(`Failed to resolve address for ${userId}: ${existing.error.message}`);
    }

    if (existing.data) {
      return existing.data;
    }

    const inserted = await supabaseAdmin
      .from('addresses')
      .insert({
        user_id: userId,
        name: 'Home',
        street_address: '12 Integration Close',
        city: 'Lagos',
        state: 'Lagos',
        postal_code: '100001',
        is_default: true,
        latitude: 6.5244,
        longitude: 3.3792,
      })
      .select()
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error(`Failed to create address for ${userId}: ${inserted.error?.message ?? 'unknown error'}`);
    }

    return inserted.data;
  }

  async function createRestaurantFixture(specificOwnerId?: string) {
    const owner = specificOwnerId || ownerId;
    const restaurantInsert = await supabaseAdmin
      .from('restaurants')
      .insert({
        name: `Integration Test Restaurant ${crypto.randomUUID().slice(0, 8)}`,
        is_active: true,
        owner_id: owner,
        owner_email: `owner-${crypto.randomUUID()}@test.local`,
        latitude: 6.5244,
        longitude: 3.3792,
        street: '123 Test St',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      })
      .select()
      .single();

    if (restaurantInsert.error || !restaurantInsert.data) {
      throw new Error(`Failed to create restaurant fixture: ${restaurantInsert.error?.message ?? 'unknown error'}`);
    }

    const restaurant = restaurantInsert.data;

    const menuInsert = await supabaseAdmin
      .from('menus')
      .insert({
        restaurant_id: restaurant.id,
        name: 'Main Menu',
        is_active: true,
      })
      .select()
      .single();

    if (menuInsert.error || !menuInsert.data) {
      throw new Error(`Failed to create menu fixture: ${menuInsert.error?.message ?? 'unknown error'}`);
    }

    const menuItemInsert = await supabaseAdmin
      .from('menu_items')
      .insert({
        restaurant_id: restaurant.id,
        menu_id: menuInsert.data.id,
        name: 'Integration Jollof',
        category: 'Main',
        price: 2500,
        is_available: true,
      })
      .select()
      .single();

    if (menuItemInsert.error || !menuItemInsert.data) {
      throw new Error(`Failed to create menu item fixture: ${menuItemInsert.error?.message ?? 'unknown error'}`);
    }

    return {
      restaurant,
      menu: menuInsert.data,
      menuItem: menuItemInsert.data,
    };
  }

  beforeAll(async () => {
    const customerId = await createFoodhuntAuthUser('customer@test.com', '123456', 'Test', 'Customer');
    const customerTwoId = await createFoodhuntAuthUser('customer2@test.com', '123456', 'Test', 'CustomerTwo');
    const adminId = await createFoodhuntAuthUser('admin@test.com', '123456', 'Platform', 'Admin', true);

    const ownerEmail = `owner-${crypto.randomUUID()}@test.com`;
    ownerId = await createFoodhuntAuthUser(ownerEmail, 'password123', 'Merchant', 'Owner');

    seeded = { customerId, customerTwoId, adminId };
    clients = {
      customer: await createAuthenticatedSupabaseTestClient('customer@test.com', '123456'),
      customerTwo: await createAuthenticatedSupabaseTestClient('customer2@test.com', '123456'),
      admin: await createAuthenticatedSupabaseTestClient('admin@test.com', '123456'),
    };

    await ensureCustomerAddress(customerId);
    ownerClient = await createAuthenticatedSupabaseTestClient(ownerEmail, 'password123');
  });

  async function authHeaders(client: any) {
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token ?? '';

    return {
      Authorization: `Bearer ${token}`,
      apikey: env!.anonKey,
      'Content-Type': 'application/json',
    };
  }

  function signDzpatchWebhook(body: string, secret: string, timestamp: string) {
    return crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }

  async function createTestOrder(status: string = 'preparing', specificOwnerId?: string) {
    const { restaurant, menuItem } = await createRestaurantFixture(specificOwnerId);
    const address = await ensureCustomerAddress(seeded.customerId);
    
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: seeded.customerId,
        restaurant_id: restaurant.id,
        delivery_address_id: address.id,
        status: status,
        total_amount: 5000,
        delivery_fee: 1200,
        service_charge: 200,
        payment_status: 'completed',
        payment_method: 'wallet'
      })
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from('order_items').insert({
      order_id: order.id,
      menu_item_id: menuItem.id,
      quantity: 1,
      price_at_time_of_order: menuItem.price
    });

    return order;
  }

  describe('1. Quote Flow (get-dzpatch-delivery-quote)', () => {
    it('strict: verify quote creation and response contract', async () => {
      const { restaurant } = await createRestaurantFixture();
      const address = await ensureCustomerAddress(seeded.customerId);

      const res = await fetch(`${mobileFunctionsUrl}/get-dzpatch-delivery-quote`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          delivery_address_id: address.id
        }),
      });

      // Strict check: non-200 is a hard failure for this integration test
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.quote_id).toBeDefined();
      expect(data.delivery_fee).toBeGreaterThan(0);
      expect(data.quote_expiry).toBeDefined();
      expect(data.checkout_reference).toBeDefined();

      // Verify persistence in DB
      const { data: quote } = await supabaseAdmin.from('dispatch_quotes').select('*').eq('quote_id', data.quote_id).single();
      expect(quote).toBeDefined();
      expect(quote.provider).toBe('dzpatch');
    });
  });

  describe('2. Payment Flow (init-payment) with Quote', () => {
    const setupValidQuote = async () => {
      const order = await createTestOrder('pending');
      const quoteId = `quote-${crypto.randomUUID()}`;
      const checkoutRef = `ref-${crypto.randomUUID()}`;
      
      const { data: quote } = await supabaseAdmin.from('dispatch_quotes').insert({
        quote_id: quoteId,
        checkout_reference: checkoutRef,
        delivery_fee: 1500,
        provider: 'dzpatch',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        request_payload: { 
          meta: { 
            customer_user_id: seeded.customerId,
            restaurant_id: order.restaurant_id,
            delivery_address_id: order.delivery_address_id,
            checkout_reference: checkoutRef
          } 
        }
      }).select().single();
      
      return { order, quote, quoteId, checkoutRef };
    };

    it('rejects expired quotes', async () => {
      const { order } = await setupValidQuote();
      const quoteId = `expired-${crypto.randomUUID()}`;
      await supabaseAdmin.from('dispatch_quotes').insert({
        quote_id: quoteId,
        delivery_fee: 1000,
        provider: 'dzpatch',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        request_payload: { meta: { customer_user_id: seeded.customerId } }
      });

      const res = await fetch(`${mobileFunctionsUrl}/init-payment`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({
          email: 'customer@test.com',
          cart: [{ id: 'any', quantity: 1 }],
          restaurant_id: order.restaurant_id,
          quote_id: quoteId
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects quote for wrong restaurant', async () => {
      const { quoteId } = await setupValidQuote();
      const res = await fetch(`${mobileFunctionsUrl}/init-payment`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({
          email: 'customer@test.com',
          cart: [{ id: 'any', quantity: 1 }],
          restaurant_id: crypto.randomUUID(), // Wrong
          quote_id: quoteId
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects quote for wrong delivery address', async () => {
      const { order, quoteId, checkoutRef } = await setupValidQuote();
      const res = await fetch(`${mobileFunctionsUrl}/init-payment`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({
          email: 'customer@test.com',
          cart: [{ id: 'any', quantity: 1 }],
          restaurant_id: order.restaurant_id,
          delivery_address_id: crypto.randomUUID(), // Wrong address
          quote_id: quoteId,
          checkout_reference: checkoutRef
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects quote for wrong checkout reference', async () => {
      const { order, quoteId } = await setupValidQuote();
      const res = await fetch(`${mobileFunctionsUrl}/init-payment`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({
          email: 'customer@test.com',
          cart: [{ id: 'any', quantity: 1 }],
          restaurant_id: order.restaurant_id,
          delivery_address_id: order.delivery_address_id,
          quote_id: quoteId,
          checkout_reference: 'wrong-ref' // Wrong ref
        }),
      });
      expect(res.status).toBe(400);
    });

    it('success path: accepts valid quoted checkout', async () => {
      const { order, quoteId, checkoutRef } = await setupValidQuote();
      const { data: item } = await supabaseAdmin.from('order_items').select('menu_item_id').eq('order_id', order.id).limit(1).single();
      
      const res = await fetch(`${mobileFunctionsUrl}/init-payment`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({
          email: 'customer@test.com',
          cart: [{ menu_item_id: item.menu_item_id, quantity: 1 }],
          restaurant_id: order.restaurant_id,
          delivery_address_id: order.delivery_address_id,
          quote_id: quoteId,
          checkout_reference: checkoutRef
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe('3. Merchant Transition (mark-order-ready-for-pickup)', () => {
    it('verifies merchant authorization and updates state', async () => {
      const order = await createTestOrder('preparing');
      
      // Attempt with customer account
      const forbidden = await fetch(`${mobileFunctionsUrl}/mark-order-ready-for-pickup`, {
        method: 'POST',
        headers: await authHeaders(clients.customer),
        body: JSON.stringify({ order_id: order.id }),
      });
      expect(forbidden.status).toBe(403);

      // Attempt with real owner
      const res = await fetch(`${mobileFunctionsUrl}/mark-order-ready-for-pickup`, {
        method: 'POST',
        headers: await authHeaders(ownerClient),
        body: JSON.stringify({ order_id: order.id }),
      });

      // Strict check: we expect success or partial success (207 if dzpatch api fails but order marked)
      expect([200, 207]).toContain(res.status);

      const { data: updatedOrder } = await supabaseAdmin.from('orders').select('status').eq('id', order.id).single();
      expect(updatedOrder.status).toBe('ready_for_pickup');

      const { data: dispatch } = await supabaseAdmin.from('order_dispatches').select('*').eq('order_id', order.id).single();
      expect(dispatch).toBeDefined();
    });
  });

  describe('4. Webhook Receiver (dzpatch-webhook)', () => {
    let orderId: string;
    const webhookSecret = process.env.DZPATCH_WEBHOOK_SECRET || 'test-secret';

    const setupWebhookOrder = async () => {
      const order = await createTestOrder('ready_for_pickup');
      await supabaseAdmin.from('order_dispatches').insert({
        order_id: order.id,
        provider: 'dzpatch',
        dispatch_status: 'accepted',
        external_delivery_id: `ext-${order.id}`
      });
      return order.id;
    };

    async function sendWebhook(payload: object, eventId: string) {
      const body = JSON.stringify(payload);
      const timestamp = new Date().toISOString();
      const signature = signDzpatchWebhook(body, webhookSecret, timestamp);

      return fetch(`${mobileFunctionsUrl}/dzpatch-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dzpatch-Signature': signature,
          'X-Dzpatch-Timestamp': timestamp,
          'X-Dzpatch-Event-Id': eventId
        },
        body
      });
    }

    it('enforces event idempotency', async () => {
      const id = await setupWebhookOrder();
      const eventId = `evt-idemp-${id}`;
      const payload = {
        event_type: 'delivery.status_changed',
        delivery: { external_order_id: id, status: 'picked_up' }
      };

      const r1 = await sendWebhook(payload, eventId);
      expect(r1.status).toBe(200);

      const r2 = await sendWebhook(payload, eventId);
      expect(r2.status).toBe(200);

      const { count } = await supabaseAdmin.from('dispatch_events').select('*', { count: 'exact', head: true }).eq('event_id', eventId);
      expect(count).toBe(1);
    });

    it('handles failed_no_rider and keeps order in ready_for_pickup', async () => {
      const id = await setupWebhookOrder();
      const eventId = `evt-fail-${id}`;
      const payload = {
        event_type: 'delivery.status_changed',
        delivery: { external_order_id: id, status: 'failed_no_rider' }
      };

      await sendWebhook(payload, eventId);
      const { data: order } = await supabaseAdmin.from('orders').select('status').eq('id', id).single();
      const { data: dispatch } = await supabaseAdmin.from('order_dispatches').select('dispatch_status').eq('order_id', id).single();

      expect(order.status).toBe('ready_for_pickup');
      expect(dispatch.dispatch_status).toBe('failed_no_rider');
    });

    it('handles delivered final state and updates ledger', async () => {
      const id = await setupWebhookOrder();
      await sendWebhook({
        event_type: 'delivery.status_changed',
        delivery: { external_order_id: id, status: 'delivered' }
      }, `evt-delivered-${id}`);

      const { data: order } = await supabaseAdmin.from('orders').select('status').eq('id', id).single();
      const { data: dispatch } = await supabaseAdmin.from('order_dispatches').select('dispatch_status').eq('order_id', id).single();
      
      expect(order.status).toBe('delivered');
      expect(dispatch.dispatch_status).toBe('delivered');
    });
  });

  describe('5. Admin Ops Routes (Phase 7)', () => {
    it('GET /dispatch-exceptions returns normalized { data, total }', async () => {
      const order = await createTestOrder('ready_for_pickup');
      await supabaseAdmin.from('order_dispatches').insert({
        order_id: order.id,
        provider: 'dzpatch',
        dispatch_status: 'failed',
        failure_reason: 'Admin test exception'
      });

      const res = await fetch(`${adminApiUrl}/dispatch-exceptions`);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it('POST /retry route transitions dispatch state strictly', async () => {
      const order = await createTestOrder('ready_for_pickup');
      const { data: dispatch } = await supabaseAdmin.from('order_dispatches').insert({
        order_id: order.id,
        provider: 'dzpatch',
        dispatch_status: 'failed'
      }).select().single();

      const res = await fetch(`${adminApiUrl}/dispatch-exceptions/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch_id: dispatch.id })
      });

      // Strict check: retry route should return 200 on successful attempt
      expect(res.status).toBe(200);

      const { data: updatedDispatch } = await supabaseAdmin.from('order_dispatches').select('dispatch_status').eq('id', dispatch.id).single();
      // Should move to accepted (if mock success) or at least be updated
      expect(updatedDispatch.dispatch_status).not.toBe('failed');

      const { data: tracking } = await supabaseAdmin.from('order_tracking').select('*').eq('order_id', order.id).order('timestamp', { ascending: false }).limit(1).single();
      expect(tracking.notes).toMatch(/retr/i);
    });

    it('POST /manual-resolution route updates dispatch status', async () => {
      const order = await createTestOrder('ready_for_pickup');
      const { data: dispatch } = await supabaseAdmin.from('order_dispatches').insert({
        order_id: order.id,
        provider: 'dzpatch',
        dispatch_status: 'failed'
      }).select().single();

      const res = await fetch(`${adminApiUrl}/dispatch-exceptions/manual-resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch_id: dispatch.id, note: 'Admin resolved manually' })
      });

      expect(res.status).toBe(200);

      const { data: updatedDispatch } = await supabaseAdmin.from('order_dispatches').select('dispatch_status').eq('id', dispatch.id).single();
      expect(updatedDispatch.dispatch_status).toBe('manual_resolution');
    });
  });
});
