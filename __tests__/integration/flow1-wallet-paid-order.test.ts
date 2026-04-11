import { describe, expect, it, beforeAll } from '@jest/globals';
import {
  createSupabaseTestClients,
  hasSupabaseTestEnv,
  type SupabaseTestClients,
} from '../supabase/_helpers/client';
import { seedSupabaseBaseState, type SeededSupabaseUsers } from '../supabase/_helpers/seed';
import { createMatchedOrder, advanceOrderToDropoff, createOrderAsCustomer, extractOrderId } from '../supabase/_helpers/factories';

describe('Flow 1: Customer Wallet-Paid Order (Comprehensive Integration)', () => {
  let clients: SupabaseTestClients;
  let state: SeededSupabaseUsers;

  beforeAll(async () => {
    if (!hasSupabaseTestEnv()) {
      console.warn('Skipping Supabase tests: Missing environment variables.');
      return;
    }
    clients = await createSupabaseTestClients();
    state = await seedSupabaseBaseState(clients.service);
  });

  it('completes the entire wallet-paid flow successfully without duplicate charges', async () => {
    if (!hasSupabaseTestEnv()) return;

    const { service, customer, rider } = clients;

    // 1. Reset and Fund Wallets
    // Reset all relevant wallets to 0
    await service.from('wallets').update({ balance: 0 }).in('id', [
      state.customerWalletId,
      state.riderWalletId,
      state.platformWalletId,
    ]);

    // Fund customer wallet with 10,000 NGN
    const fundRes = await service
      .from('wallets')
      .update({ balance: 10000 })
      .eq('id', state.customerWalletId)
      .select('balance')
      .single();

    expect(fundRes.error).toBeNull();
    expect(fundRes.data?.balance).toBe(10000);

    // 2. Create Order
    const { orderId } = await createOrderAsCustomer(customer, state.customerId, {
      paymentMethod: 'wallet',
      suggestedPrice: 3000,
    });

    expect(orderId).toBeDefined();

    // Verify order initial state
    const orderCheck = await service
      .from('orders')
      .select('status, payment_method, suggested_price')
      .eq('id', orderId)
      .single();

    expect(orderCheck.data).toMatchObject({
      status: 'pending',
      payment_method: 'wallet',
      suggested_price: expect.any(Number),
    });

    // 3. Rider Places Bid
    const bidPrice = 2800;
    const bidRes = await rider.rpc('place_bid', {
      p_order_id: orderId,
      p_rider_id: state.riderId,
      p_amount: bidPrice,
    } as any);

    expect(bidRes.error).toBeNull();
    const bidId = bidRes.data?.bid_id ?? bidRes.data;
    expect(bidId).toBeDefined();

    // 4. Customer Accepts Bid
    const acceptRes = await customer.rpc('accept_bid', {
      p_bid_id: bidId,
      p_customer_id: state.customerId,
    } as any);

    expect(acceptRes.error).toBeNull();

    // Verify order is now assigned
    const assignedOrder = await service
      .from('orders')
      .select('status, rider_id, final_price, rider_net_amount, platform_commission_amount')
      .eq('id', orderId)
      .single();

    expect(assignedOrder.error).toBeNull();
    expect(assignedOrder.data).toMatchObject({
      status: 'matched',
      rider_id: state.riderId,
      final_price: expect.any(Number),
    });

    const actualFinalPrice = assignedOrder.data!.final_price!;
    const expectedRiderNet = assignedOrder.data!.rider_net_amount!;
    const expectedPlatformComm = assignedOrder.data!.platform_commission_amount!;

    // 5. Rider Moves Through Statuses
    await advanceOrderToDropoff(rider, orderId, state.riderProfileId);

    // Verify order is at dropoff
    const dropoffOrder = await service
      .from('orders')
      .select('status, delivery_code')
      .eq('id', orderId)
      .single();

    expect(dropoffOrder.data?.status).toBe('arrived_dropoff');
    const deliveryCode = dropoffOrder.data?.delivery_code;
    expect(deliveryCode).toBeTruthy();

    // 6. Verify Code & Complete Delivery
    const verifyRes = await rider.rpc('verify_delivery_code', {
      p_order_id: orderId,
      p_rider_id: state.riderId,
      p_code: deliveryCode,
    } as any);

    expect(verifyRes.error).toBeNull();

    const completeRes = await rider.rpc('complete_delivery', {
      p_order_id: orderId,
      p_rider_id: state.riderId,
      p_pod_photo_url: 'https://fake-pod.com/photo.jpg',
    } as any);

    expect(completeRes.error).toBeNull();

    // 7. Verify Final State and Wallet Balances
    const finalOrder = await service
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    expect(finalOrder.data?.status).toBe('delivered');

    const balances = await service
      .from('wallets')
      .select('id, balance')
      .in('id', [state.customerWalletId, state.riderWalletId, state.platformWalletId]);

    const customerBalance = balances.data?.find(w => w.id === state.customerWalletId)?.balance;
    const riderBalance = balances.data?.find(w => w.id === state.riderWalletId)?.balance;
    const platformBalance = balances.data?.find(w => w.id === state.platformWalletId)?.balance;

    // Customer should be deducted the exact final price
    expect(customerBalance).toBe(10000 - actualFinalPrice);
    
    // Rider + Platform = Rider net + Platform commission
    expect(riderBalance).toBe(expectedRiderNet);
    // Platform balance might include other things if it wasn't reset fully, but we reset it to 0.
    // So it should be exactly the commission.
    expect(platformBalance).toBe(expectedPlatformComm);

    // 8. Prevent Duplicate Completion
    const duplicateCompleteRes = await rider.rpc('complete_delivery', {
      p_order_id: orderId,
      p_rider_id: state.riderId,
    } as any);

    // Should return an error
    expect(duplicateCompleteRes.error).not.toBeNull();

    // Verify balances did not change
    const postDuplicateBalances = await service
      .from('wallets')
      .select('id, balance')
      .in('id', [state.customerWalletId, state.riderWalletId, state.platformWalletId]);

    const postCustomerBalance = postDuplicateBalances.data?.find(w => w.id === state.customerWalletId)?.balance;
    const postRiderBalance = postDuplicateBalances.data?.find(w => w.id === state.riderWalletId)?.balance;

    expect(postCustomerBalance).toBe(customerBalance);
    expect(postRiderBalance).toBe(riderBalance);
  });
});
