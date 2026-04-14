import { STATUS_MAP, verifyDzpatchSignature, verifyPaystackSignature } from '../../_external_/foodhunt-mobile/supabase/functions/_shared/webhook-helpers';
import { signPartnerWebhookPayload } from '../../supabase/functions/_shared/partner-webhooks';

describe('Foodhunt webhook idempotency and status contract', () => {
  it('maps dzpatch status to foodhunt status correctly', () => {
    expect(STATUS_MAP['rider_assigned']).toBe('ready_for_pickup'); // Dispatch progress, not out_for_delivery
    expect(STATUS_MAP['picked_up']).toBe('out_for_delivery');
    expect(STATUS_MAP['in_transit']).toBe('out_for_delivery');
    expect(STATUS_MAP['delivered']).toBe('delivered');
    expect(STATUS_MAP['failed_no_rider']).toBe('ready_for_pickup'); // Remains ready_for_pickup
  });
});

describe('Foodhunt webhook signature verification', () => {
  it('accepts valid dzpatch signature', async () => {
    const secret = 'test-secret';
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify({ test: true });
    
    // Use dzpatch's signing function to generate signature
    const signature = await signPartnerWebhookPayload({ secret, timestamp, rawBody });
    
    const isValid = await verifyDzpatchSignature(rawBody, timestamp, signature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects forged dzpatch signature', async () => {
    const secret = 'test-secret';
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify({ test: true });
    
    const isValid = await verifyDzpatchSignature(rawBody, timestamp, 'invalid-signature', secret);
    expect(isValid).toBe(false);
  });
});

describe('Paystack webhook signature verification', () => {
  it('accepts valid HMAC over raw body', async () => {
    const secret = 'paystack-secret';
    const rawBody = JSON.stringify({ event: 'charge.success' });
    
    // Let's generate what paystack would generate
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const signature = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const isValid = await verifyPaystackSignature(rawBody, signature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects forged HMAC', async () => {
    const secret = 'paystack-secret';
    const rawBody = JSON.stringify({ event: 'charge.success' });
    
    const isValid = await verifyPaystackSignature(rawBody, 'invalid-signature', secret);
    expect(isValid).toBe(false);
  });
});
