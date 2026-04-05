import type { SupabaseTestClient } from './client';
import type { SeededSupabaseUsers } from './seed';

export type SupabaseScenarioState = {
  label: string;
  orderIds: Set<string>;
  transactionReferences: Set<string>;
};

export function createSupabaseScenarioState(label: string): SupabaseScenarioState {
  return {
    label,
    orderIds: new Set<string>(),
    transactionReferences: new Set<string>(),
  };
}

export function trackSupabaseOrder(state: SupabaseScenarioState, orderId: string) {
  state.orderIds.add(orderId);
}

export function trackSupabaseTransactionReference(state: SupabaseScenarioState, reference: string) {
  state.transactionReferences.add(reference);
}

async function deleteNotificationsForOrder(service: SupabaseTestClient, orderId: string) {
  await service.from('notifications').delete().contains('data', { order_id: orderId } as any);
}

async function resetWalletBalance(service: SupabaseTestClient, walletId: string, balance: number) {
  await service
    .from('wallets')
    .update({
      balance,
    } as any)
    .eq('id', walletId);
}

export async function cleanupSupabaseScenarioData(
  service: SupabaseTestClient,
  state?: SupabaseScenarioState,
  seeded?: SeededSupabaseUsers,
) {
  const orderIds = Array.from(state?.orderIds ?? []);
  const references = Array.from(state?.transactionReferences ?? []);

  if (orderIds.length > 0) {
    for (const orderId of orderIds) {
      await deleteNotificationsForOrder(service, orderId);
    }

    await service.from('chat_messages').delete().in('order_id', orderIds);
    await service.from('ratings').delete().in('order_id', orderIds);
    await service.from('cancellations' as any).delete().in('order_id', orderIds);
    await service.from('outstanding_balances' as any).delete().in('order_id', orderIds);
    await service.from('rider_location_logs' as any).delete().in('order_id', orderIds);
    await service.from('order_status_history').delete().in('order_id', orderIds);
    await service.from('bids').delete().in('order_id', orderIds);
    await service.from('transactions').delete().in('order_id', orderIds);
    await service.from('orders').delete().in('id', orderIds);
  }

  if (references.length > 0) {
    await service.from('transactions').delete().in('reference', references);
  }

  if (seeded) {
    await service.from('withdrawals').delete().in('wallet_id', [
      seeded.riderWalletId,
      seeded.riderTwoWalletId,
    ]);

    await service.from('notifications').delete().in('user_id', [
      seeded.customerId,
      seeded.customerTwoId,
      seeded.riderProfileId,
      seeded.riderTwoProfileId,
    ]);

    await resetWalletBalance(service, seeded.customerWalletId, 50000);
    await resetWalletBalance(service, seeded.customerTwoWalletId, 50000);
    await resetWalletBalance(service, seeded.riderWalletId, 0);
    await resetWalletBalance(service, seeded.riderTwoWalletId, 0);
    await resetWalletBalance(service, seeded.platformWalletId, 0);

    await service
      .from('riders')
      .update({
        is_online: true,
        is_commission_locked: false,
        unpaid_commission_count: 0,
      } as any)
      .in('id', [seeded.riderId, seeded.riderTwoId]);

    await service.from('rider_bank_accounts').delete().in('rider_id', [
      seeded.riderId,
      seeded.riderTwoId,
    ]);
  }
}
