import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  createSupabaseServiceClient,
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../_helpers/client';
import { buildCreateOrderArgs, createMatchedOrder } from '../_helpers/factories';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../_helpers/seed';

const describeSupabase = hasSupabaseTestEnv() ? describe : describe.skip;

describeSupabase('Supabase RLS - Chat and Contact Authorization', () => {
  jest.setTimeout(90_000);

  let clients: SupabaseTestClients;
  let seeded: SeededSupabaseUsers;

  beforeAll(async () => {
    seeded = await seedSupabaseBaseState(createSupabaseServiceClient());
    clients = await createSupabaseTestClients();
  });

  it('matched customer and rider can read/send chat while unrelated user cannot', async () => {
    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'cash',
    });

    const customerMessage = await clients.customer
      .from('chat_messages')
      .insert({
        order_id: matched.orderId,
        sender_id: seeded.customerId,
        message: 'Customer message',
      } as any)
      .select('*')
      .single();

    expect(customerMessage.error).toBeNull();

    const riderMessage = await clients.rider
      .from('chat_messages')
      .insert({
        order_id: matched.orderId,
        sender_id: seeded.riderProfileId,
        message: 'Rider message',
      } as any)
      .select('*')
      .single();

    expect(riderMessage.error).toBeNull();

    const customerRead = await clients.customer.from('chat_messages').select('*').eq('order_id', matched.orderId);
    const riderRead = await clients.rider.from('chat_messages').select('*').eq('order_id', matched.orderId);
    const unrelatedRead = await clients.customerTwo.from('chat_messages').select('*').eq('order_id', matched.orderId);

    expect(customerRead.error).toBeNull();
    expect((customerRead.data ?? []).length).toBe(2);
    expect(riderRead.error).toBeNull();
    expect((riderRead.data ?? []).length).toBe(2);
    expect(unrelatedRead.error).toBeNull();
    expect(unrelatedRead.data).toEqual([]);

    const unrelatedSend = await clients.customerTwo
      .from('chat_messages')
      .insert({
        order_id: matched.orderId,
        sender_id: seeded.customerTwoId,
        message: 'Intruder',
      } as any)
      .select('*')
      .maybeSingle();

    expect(unrelatedSend.error).not.toBeNull();
  });

  it('chat read update is allowed only for participants, and matched users can access counterpart details', async () => {
    const matched = await createMatchedOrder(clients.customer, clients.rider, seeded.customerId, seeded.riderId, {
      paymentMethod: 'cash',
    });

    const message = await clients.customer
      .from('chat_messages')
      .insert({
        order_id: matched.orderId,
        sender_id: seeded.customerId,
        message: 'Mark me read',
      } as any)
      .select('*')
      .single();

    const riderMarksRead = await clients.rider
      .from('chat_messages')
      .update({ is_read: true } as any)
      .eq('id', message.data!.id)
      .select('*')
      .single();

    expect(riderMarksRead.error).toBeNull();
    expect(riderMarksRead.data?.is_read).toBe(true);

    const unrelatedMarksRead = await clients.customerTwo
      .from('chat_messages')
      .update({ is_read: true } as any)
      .eq('id', message.data!.id)
      .select('*')
      .maybeSingle();

    expect(unrelatedMarksRead.error !== null || unrelatedMarksRead.data === null).toBe(true);

    const customerOrderView = await clients.customer
      .from('orders')
      .select('rider_id, pickup_contact_phone, dropoff_contact_phone')
      .eq('id', matched.orderId)
      .single();
    const riderOrderView = await clients.rider
      .from('orders')
      .select('customer_id, pickup_contact_phone, dropoff_contact_phone')
      .eq('id', matched.orderId)
      .single();

    expect(customerOrderView.error).toBeNull();
    expect(customerOrderView.data?.rider_id).toBe(seeded.riderId);
    expect(riderOrderView.error).toBeNull();
    expect(riderOrderView.data?.customer_id).toBe(seeded.customerId);
  });

  it('pre-match rider discovery flow does not expose customer phone numbers', async () => {
    const createArgs = buildCreateOrderArgs(seeded.customerId, { paymentMethod: 'cash' });
    const created = await clients.customer.rpc('create_order', createArgs as any);
    expect(created.error).toBeNull();
    const orderId = (created.data as any)?.order_id;

    const nearby = await clients.rider.rpc('get_nearby_orders', {
      p_rider_id: seeded.riderId,
      p_radius_meters: 50000,
    } as any);

    expect(nearby.error).toBeNull();
    const row = ((nearby.data ?? []) as any[]).find((item) => item.order_id === orderId);
    expect(row).toBeTruthy();
    expect('pickup_contact_phone' in row).toBe(false);
    expect('dropoff_contact_phone' in row).toBe(false);
  });
});
