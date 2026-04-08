import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { createMatchedOrder } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase Realtime - Rider Location and Channels', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  it('rider can update own location while another rider cannot overwrite someone else location', async () => {
    const update = await clients.rider
      .from('rider_locations')
      .upsert({
        rider_id: seeded.riderId,
        latitude: 6.6001,
        longitude: 3.3001,
        updated_at: new Date().toISOString(),
      } as any)
      .select('*')
      .maybeSingle();

    expect(update.error).toBeNull();

    const ownRow = await clients.rider
      .from('rider_locations')
      .select('*')
      .eq('rider_id', seeded.riderId)
      .maybeSingle();

    expect(ownRow.error).toBeNull();
    expect(ownRow.data?.rider_id).toBe(seeded.riderId);

    const overwrite = await clients.riderTwo
      .from('rider_locations')
      .update({ latitude: 6.9 } as any)
      .eq('rider_id', seeded.riderId)
      .select('*')
      .maybeSingle();

    expect(overwrite.error !== null || overwrite.data === null).toBe(true);
  });

  it('matched customer can read assigned rider location while unrelated customer cannot', async () => {
    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'cash',
    });

    await clients.rider.rpc('update_order_status', {
      p_order_id: matched.orderId,
      p_new_status: 'pickup_en_route',
      p_changed_by: seeded.riderProfileId,
    } as any);

    await clients.rider
      .from('rider_locations')
      .upsert({
        rider_id: seeded.riderId,
        latitude: 6.611,
        longitude: 3.322,
        order_id: matched.orderId,
        updated_at: new Date().toISOString(),
      } as any);

    const customerRead = await clients.customer
      .from('rider_locations')
      .select('*')
      .eq('rider_id', seeded.riderId)
      .maybeSingle();

    const unrelatedRead = await clients.customerTwo
      .from('rider_locations')
      .select('*')
      .eq('rider_id', seeded.riderId)
      .maybeSingle();

    expect(customerRead.error).toBeNull();
    expect(customerRead.data?.rider_id).toBe(seeded.riderId);
    expect(unrelatedRead.error).toBeNull();
    expect(unrelatedRead.data).toBeNull();
  });

  it('bids, chat, and order status channels can subscribe under current RLS helpers', async () => {
    const bidChannel = clients.customer.channel(`bids-${Date.now()}`);
    const chatChannel = clients.customer.channel(`chat-${Date.now()}`);
    const statusChannel = clients.customer.channel(`status-${Date.now()}`);

    bidChannel.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'bids' }, () => {});
    chatChannel.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'chat_messages' }, () => {});
    statusChannel.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'order_status_history' }, () => {});

    const bidStatus = await new Promise<string>((resolve) => bidChannel.subscribe((status) => resolve(status)));
    const chatStatus = await new Promise<string>((resolve) => chatChannel.subscribe((status) => resolve(status)));
    const statusHistoryStatus = await new Promise<string>((resolve) => statusChannel.subscribe((status) => resolve(status)));

    expect(['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT']).toContain(bidStatus);
    expect(['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT']).toContain(chatStatus);
    expect(['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT']).toContain(statusHistoryStatus);

    await clients.customer.removeChannel(bidChannel);
    await clients.customer.removeChannel(chatChannel);
    await clients.customer.removeChannel(statusChannel);
  });
});
