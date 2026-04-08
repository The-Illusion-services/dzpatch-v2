import type { SupabaseTestClient } from './client';

export function buildTestReference(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildTestStoragePath(prefix: string, suffix: string) {
  return `test-run/${prefix}/${suffix}`;
}

type CreateOrderOverrides = {
  dropoffAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  packageDescription?: string;
  paymentMethod?: 'cash' | 'wallet';
  suggestedPrice?: number | null;
};

export function buildCreateOrderArgs(
  customerId: string,
  overrides: CreateOrderOverrides = {},
) {
  const reference = buildTestReference('sb-order');

  return {
    p_customer_id: customerId,
    p_pickup_address: `${reference} Pickup`,
    p_pickup_lat: 6.5244,
    p_pickup_lng: 3.3792,
    p_pickup_contact_name: 'Test Pickup',
    p_pickup_contact_phone: '+2348000000001',
    p_dropoff_address: overrides.dropoffAddress ?? `${reference} Dropoff`,
    p_dropoff_lat: overrides.dropoffLat ?? 6.5315,
    p_dropoff_lng: overrides.dropoffLng ?? 3.3958,
    p_dropoff_contact_name: 'Test Receiver',
    p_dropoff_contact_phone: '+2348000000002',
    p_package_size: 'small',
    p_package_description: overrides.packageDescription ?? `sb-test ${reference}`,
    p_package_notes: 'Supabase-backed test order',
    p_suggested_price: overrides.suggestedPrice ?? 2500,
    p_payment_method: overrides.paymentMethod ?? 'cash',
  };
}

export function extractOrderId(result: unknown) {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object' && 'order_id' in result) {
    return String((result as { order_id: string }).order_id);
  }

  throw new Error('RPC result did not include an order_id.');
}

export function extractBidId(result: unknown) {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object' && 'bid_id' in result) {
    return String((result as { bid_id: string }).bid_id);
  }

  throw new Error('RPC result did not include a bid_id.');
}

export async function createOrderAsCustomer(
  customerClient: Pick<SupabaseTestClient, 'rpc'>,
  customerId: string,
  overrides: CreateOrderOverrides = {},
) {
  const args = buildCreateOrderArgs(customerId, overrides);
  const { data, error } = await customerClient.rpc('create_order', args as any);

  if (error) {
    throw new Error(`create_order failed: ${error.message}`);
  }

  return {
    args,
    result: data,
    orderId: extractOrderId(data),
  };
}

export async function advanceOrderToDropoff(
  riderClient: Pick<SupabaseTestClient, 'rpc'>,
  orderId: string,
  riderProfileId: string,
) {
  const statuses = [
    'pickup_en_route',
    'arrived_pickup',
    'in_transit',
    'arrived_dropoff',
  ] as const;

  for (const status of statuses) {
    const { error } = await riderClient.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: status,
      p_changed_by: riderProfileId,
    } as any);

    if (error) {
      throw new Error(`update_order_status failed for ${status}: ${error.message}`);
    }
  }
}

export async function createMatchedOrder(
  customerClient: Pick<SupabaseTestClient, 'rpc'>,
  riderClient: Pick<SupabaseTestClient, 'rpc'>,
  customerId: string,
  riderId: string,
  overrides: CreateOrderOverrides = {},
) {
  const created = await createOrderAsCustomer(customerClient, customerId, overrides);
  const bid = await riderClient.rpc('place_bid', {
    p_order_id: created.orderId,
    p_rider_id: riderId,
    p_amount: 2200,
  } as any);

  if (bid.error) {
    throw new Error(`place_bid failed: ${bid.error.message}`);
  }

  const bidId = extractBidId(bid.data);
  const accepted = await customerClient.rpc('accept_bid', {
    p_bid_id: bidId,
    p_customer_id: customerId,
  } as any);

  if (accepted.error) {
    throw new Error(`accept_bid failed: ${accepted.error.message}`);
  }

  return {
    ...created,
    bidId,
  };
}

export async function createDeliveredOrder(
  customerClient: Pick<SupabaseTestClient, 'rpc'>,
  riderClient: Pick<SupabaseTestClient, 'rpc'>,
  customerId: string,
  riderId: string,
  riderProfileId: string,
  deliveryCode: string | null,
  overrides: CreateOrderOverrides = {},
) {
  const matched = await createMatchedOrder(customerClient, riderClient, customerId, riderId, overrides);
  await advanceOrderToDropoff(riderClient, matched.orderId, riderProfileId);

  const verify = await riderClient.rpc('verify_delivery_code', {
    p_order_id: matched.orderId,
    p_rider_id: riderId,
    p_code: deliveryCode,
  } as any);

  if (verify.error) {
    throw new Error(`verify_delivery_code failed: ${verify.error.message}`);
  }

  const completed = await riderClient.rpc('complete_delivery', {
    p_order_id: matched.orderId,
    p_rider_id: riderId,
  } as any);

  if (completed.error) {
    throw new Error(`complete_delivery failed: ${completed.error.message}`);
  }
  return matched;
}
