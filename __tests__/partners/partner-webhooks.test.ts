import { signPartnerWebhookPayload } from '../../supabase/functions/_shared/partner-webhooks';

describe('partner webhooks signing', () => {
  it('creates stable signatures for same payload/timestamp', async () => {
    const secret = 'my-secret';
    const timestamp = '1712850000';
    const rawBody = JSON.stringify({ event: 'delivered' });

    const sig1 = await signPartnerWebhookPayload({ secret, timestamp, rawBody });
    const sig2 = await signPartnerWebhookPayload({ secret, timestamp, rawBody });

    expect(sig1).toBe(sig2);
  });

  it('changing payload changes signature', async () => {
    const secret = 'my-secret';
    const timestamp = '1712850000';
    
    const sig1 = await signPartnerWebhookPayload({ 
      secret, timestamp, rawBody: JSON.stringify({ event: 'delivered' }) 
    });
    const sig2 = await signPartnerWebhookPayload({ 
      secret, timestamp, rawBody: JSON.stringify({ event: 'picked_up' }) 
    });

    expect(sig1).not.toBe(sig2);
  });

  it('changing secret changes signature', async () => {
    const timestamp = '1712850000';
    const rawBody = JSON.stringify({ event: 'delivered' });

    const sig1 = await signPartnerWebhookPayload({ secret: 'secret-a', timestamp, rawBody });
    const sig2 = await signPartnerWebhookPayload({ secret: 'secret-b', timestamp, rawBody });

    expect(sig1).not.toBe(sig2);
  });
});
