import { adjustCurrencyAmount, buildRiderEarningsBreakdown, buildWalletGuard } from '@/lib/sprint4-ux';
import { buildPodStoragePath, verifyDeliveryCodeAttempt } from '@/lib/delivery-flow';
import { BID_RESPONSE_WINDOW_SECONDS } from '@/constants/timing';

export type DocumentRow = {
  id: string;
  rider_id: string;
  document_type: string;
  status: string;
  document_url: string | null;
  created_at: string;
};

export type BankAccountForm = {
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
};

export type PricingRule = {
  base_rate: number;
  per_km_rate: number;
  min_price: number;
  vat_percentage: number;
  surge_multiplier: number;
};

export type PackageSize = 'small' | 'medium' | 'large' | 'extra_large';
export type PaymentMethod = 'wallet' | 'cash';

export type SubscriptionRecord = {
  key: string;
  active: boolean;
};

const SIZE_MULTIPLIER: Record<PackageSize, number> = {
  small: 1,
  medium: 1.3,
  large: 1.6,
  extra_large: 2,
};

export function buildRiderDocumentsQuery(riderId: string) {
  return {
    table: 'rider_documents',
    rider_id: riderId,
  };
}

export function buildDocumentStoragePath(profileId: string, documentType: string, timestamp: number) {
  return `rider-docs/${profileId}/documents/${documentType}/${documentType}-${timestamp}.jpg`;
}

export function resolveDocumentPersistenceAction(existingDocumentId: string | null) {
  return existingDocumentId ? 'update' : 'insert';
}

export function getLatestDocumentByType(documents: DocumentRow[], documentType: string) {
  return [...documents]
    .filter((doc) => doc.document_type === documentType)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
}

export function getDocumentUploadErrorMessage(error: Error | null) {
  return error ? 'Upload failed. Please try again.' : 'Your document has been submitted for review.';
}

export function buildBankAccountMutation(riderId: string, form: BankAccountForm, existingBankAccountId: string | null) {
  return existingBankAccountId
    ? {
        action: 'update' as const,
        where: { id: existingBankAccountId },
        values: {
          bank_name: form.bank_name.trim(),
          bank_code: form.bank_code.trim(),
          account_number: form.account_number.trim(),
          account_name: form.account_name.trim(),
          is_default: true,
        },
      }
    : {
        action: 'insert' as const,
        values: {
          rider_id: riderId,
          bank_name: form.bank_name.trim(),
          bank_code: form.bank_code.trim(),
          account_number: form.account_number.trim(),
          account_name: form.account_name.trim(),
          is_default: true,
        },
      };
}

export function buildRiderWithdrawWalletQuery(profileId: string) {
  return {
    owner_id: profileId,
    owner_type: 'rider',
  };
}

export function buildDefaultBankAccountQuery(riderId: string) {
  return {
    rider_id: riderId,
    is_default: true,
  };
}

export function usesInvalidProfileIdForRiderFlow(params: {
  profileId: string;
  riderId: string;
  queryRiderId?: string;
  walletOwnerId?: string;
}) {
  return params.queryRiderId === params.profileId || params.walletOwnerId === params.riderId;
}

export function validateWithdrawalRequest(params: {
  amount: number;
  balance: number;
  hasBankAccount: boolean;
  fee?: number;
  minWithdrawal?: number;
}) {
  const fee = params.fee ?? 100;
  const minWithdrawal = params.minWithdrawal ?? 500;

  if (!params.hasBankAccount) {
    return { ok: false, error: 'Add Bank Account', payout: 0 };
  }

  if (params.amount < minWithdrawal) {
    return { ok: false, error: `Minimum withdrawal is ₦${minWithdrawal.toLocaleString()}`, payout: 0 };
  }

  if (params.amount > params.balance) {
    return { ok: false, error: 'Insufficient balance', payout: 0 };
  }

  return {
    ok: true,
    error: null,
    payout: Math.max(0, params.amount - fee),
  };
}

export function calculateOrderPreview(params: {
  rule: PricingRule;
  distanceKm: number;
  size: PackageSize;
  walletBalance: number;
  paymentMethod: PaymentMethod;
  promo?: {
    code: string;
    discount_type: 'percentage' | 'flat';
    discount_value: number;
    min_order_amount?: number;
  } | null;
}) {
  const raw = (params.rule.base_rate + params.distanceKm * params.rule.per_km_rate) * params.rule.surge_multiplier;
  const deliveryFee = Math.round(Math.max(params.rule.min_price, raw) * SIZE_MULTIPLIER[params.size]);
  const serviceFee = Math.round(deliveryFee * (params.rule.vat_percentage / 100));

  let discount = 0;
  let promoApplied = false;
  let promoError = '';

  if (params.promo) {
    if (params.promo.min_order_amount && deliveryFee < params.promo.min_order_amount) {
      promoError = `Min order ₦${params.promo.min_order_amount.toLocaleString()} required`;
    } else {
      discount = params.promo.discount_type === 'percentage'
        ? Math.round((deliveryFee * params.promo.discount_value) / 100)
        : params.promo.discount_value;
      promoApplied = true;
    }
  }

  const total = deliveryFee + serviceFee - discount;
  const walletGuard = buildWalletGuard(params.walletBalance, total);
  const canSubmit = params.paymentMethod === 'cash' || walletGuard.hasEnoughBalance;

  return {
    deliveryFee,
    serviceFee,
    discount,
    total,
    promoApplied,
    promoError,
    walletGuard,
    canSubmit,
    error: params.paymentMethod === 'wallet' && !walletGuard.hasEnoughBalance
      ? `Insufficient wallet balance. Top up ₦${walletGuard.shortfall.toLocaleString()} or switch to cash.`
      : null,
  };
}

export function applyBidQuickAdjustment(currentAmount: number, delta: number, floor = 0) {
  return adjustCurrencyAmount(currentAmount, delta, floor);
}

export function getMarketAverageBid(listedPrice: number) {
  return Math.round(listedPrice);
}

export function getCounterRoundLabel(currentRound: number) {
  return currentRound >= 3
    ? 'Final round - no more counters after this'
    : `Round ${currentRound} of 3`;
}

export type NegotiationBid = {
  id: string;
  order_id: string;
  rider_id: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';
  negotiation_round: number;
  parent_bid_id: string | null;
};

export function sendCounterOffer(bids: NegotiationBid[], bidId: string, amount: number) {
  const bid = bids.find((item) => item.id === bidId);
  if (!bid) {
    return { newBid: null, error: 'Bid not found' };
  }

  if (bid.status !== 'pending') {
    return { newBid: null, error: `Bid is no longer pending (status: ${bid.status})` };
  }

  const currentRound = bids
    .filter((item) => item.order_id === bid.order_id && item.rider_id === bid.rider_id)
    .reduce((max, item) => Math.max(max, item.negotiation_round), 0);
  const nextRound = currentRound + 1;

  if (nextRound > 3) {
    return { newBid: null, error: 'Maximum 3 negotiation rounds reached for this rider. Accept, decline, or find another rider.' };
  }

  return {
    newBid: {
      id: `counter-${nextRound}`,
      order_id: bid.order_id,
      rider_id: bid.rider_id,
      amount,
      status: 'pending' as const,
      negotiation_round: nextRound,
      parent_bid_id: bidId,
    },
    error: null,
  };
}

export function extractTrackingCoordinates(order: {
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
}) {
  return {
    hasPickup: typeof order.pickup_lat === 'number' && typeof order.pickup_lng === 'number',
    hasDropoff: typeof order.dropoff_lat === 'number' && typeof order.dropoff_lng === 'number',
  };
}

export function getNavigationTarget(order: {
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_address: string;
}) {
  if (typeof order.pickup_lat === 'number' && typeof order.pickup_lng === 'number') {
    return {
      mode: 'coordinates' as const,
      latitude: order.pickup_lat,
      longitude: order.pickup_lng,
    };
  }

  if (order.pickup_address.trim()) {
    return {
      mode: 'address' as const,
      address: order.pickup_address.trim(),
    };
  }

  return null;
}

export function isStaleLocation(lastUpdate: Date | null, now: Date, thresholdSeconds = 15) {
  if (!lastUpdate) {
    return false;
  }

  return (now.getTime() - lastUpdate.getTime()) / 1000 > thresholdSeconds;
}

export function getTrackingState(lastUpdate: Date | null, now: Date, thresholdSeconds = 15) {
  const stale = isStaleLocation(lastUpdate, now, thresholdSeconds);
  return stale
    ? {
        stale: true,
        label: `Last updated ${Math.floor((now.getTime() - (lastUpdate?.getTime() ?? now.getTime())) / 1000)}s ago`,
      }
    : {
        stale: false,
        label: 'Live',
      };
}

export function applyRealtimeEntityUpdate<T extends { id: string }>(items: T[], updated: T) {
  const existing = items.find((item) => item.id === updated.id);
  if (existing) {
    return items.map((item) => (item.id === updated.id ? updated : item));
  }

  return [...items, updated];
}

export function registerSubscription(subscriptions: SubscriptionRecord[], key: string) {
  if (subscriptions.some((subscription) => subscription.key === key && subscription.active)) {
    return subscriptions;
  }

  return [...subscriptions.filter((subscription) => subscription.key !== key), { key, active: true }];
}

export function cleanupSubscription(subscriptions: SubscriptionRecord[], key: string) {
  return subscriptions.map((subscription) =>
    subscription.key === key ? { ...subscription, active: false } : subscription,
  );
}

export function shouldRunPollingFallback(params: {
  hasRealtimeSubscription: boolean;
  lastRealtimeUpdateAt: Date | null;
  now: Date;
  pollIntervalMs: number;
}) {
  if (!params.hasRealtimeSubscription) {
    return true;
  }

  if (!params.lastRealtimeUpdateAt) {
    return false;
  }

  return params.now.getTime() - params.lastRealtimeUpdateAt.getTime() >= params.pollIntervalMs;
}

export function resolveFindingRiderState(params: {
  status: string;
  hasPendingBids: boolean;
  expired: boolean;
}) {
  if (params.status === 'matched') {
    return 'matched';
  }

  if (params.hasPendingBids) {
    return 'live_bidding';
  }

  if (params.expired || params.status === 'cancelled') {
    return 'expired';
  }

  return 'searching';
}

export function getAuthorizedContactView(params: {
  viewerRole: 'customer' | 'rider';
  viewerId: string;
  order: { customer_id: string; rider_id: string | null; status: string };
  contact: { full_name: string; phone: string; avatar_url?: string | null };
}) {
  const matched = params.order.status !== 'pending' && params.order.rider_id != null;
  const riderAuthorized = params.viewerRole === 'rider' && matched && params.order.rider_id === params.viewerId;
  const customerAuthorized = params.viewerRole === 'customer' && params.order.customer_id === params.viewerId && matched;
  const authorized = riderAuthorized || customerAuthorized;

  if (!authorized) {
    return null;
  }

  return {
    full_name: params.contact.full_name,
    phone: params.contact.phone,
  };
}

export function sanitizeChatContactPayload(payload: {
  full_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  avatar_url?: string | null;
}) {
  return {
    full_name: payload.full_name,
    phone: payload.phone,
    avatar_url: payload.avatar_url ?? null,
  };
}

export function getOrderDetailsContactExposure(params: {
  matched: boolean;
  phone: string | null;
}) {
  return params.matched ? params.phone : null;
}

export function isDirectProfileReadAllowed(params: {
  requesterId: string;
  targetId: string;
  admin?: boolean;
}) {
  return params.admin === true || params.requesterId === params.targetId;
}

export function canCancelOrder(actorId: string, orderCustomerId: string) {
  return actorId === orderCustomerId;
}

export function canUpdateOrderStatus(actorRiderId: string, orderRiderId: string | null) {
  return actorRiderId === orderRiderId;
}

export function canCreateDispute(actorId: string, order: { customer_id: string; rider_id: string | null }) {
  return actorId === order.customer_id || actorId === order.rider_id;
}

export function canDebitWallet(balance: number, amount: number) {
  return balance - amount >= 0;
}

export function canPlaceBid(params: { commissionLocked: boolean }) {
  return !params.commissionLocked;
}

export function isSecureRiderStoragePath(profileId: string, path: string) {
  return path.startsWith(`rider-docs/${profileId}/`) && !path.includes('../');
}

export function classifyWalletTransaction(type: string) {
  if (['credit', 'commission_credit', 'refund', 'adjustment'].includes(type)) {
    return 'income';
  }

  if (type === 'withdrawal') {
    return 'withdrawal';
  }

  return 'spending';
}

export function getCancellationReasonLabel(reason: string | null) {
  return reason ?? 'No cancellation reason provided';
}

export function shouldWarnCancelPenalty(status: string) {
  return ['in_transit', 'arrived_dropoff'].includes(status);
}

export function buildRaiseDisputePayload(orderId: string, subject: string, screen: string) {
  return {
    p_order_id: orderId,
    p_subject: subject,
    p_description: `Issue reported from ${screen} screen. Order: ${orderId}`,
  };
}

export function buildPushTokenUpsert(profileId: string, token: string, platform: 'ios' | 'android' | 'web') {
  return {
    profile_id: profileId,
    token,
    platform,
  };
}

export function resolveSplashRoute(params: {
  session: boolean;
  role: string | null;
  fullName?: string | null;
  kycStatus?: string | null;
}) {
  if (!params.session) {
    return '/(auth)/onboarding';
  }

  if (!params.role) {
    return null;
  }

  if (params.role === 'rider') {
    const kyc = params.kycStatus ?? 'not_submitted';
    if (kyc === 'approved') return '/(rider)';
    if (kyc === 'pending') return '/(rider-auth)/pending-approval';
    return '/(rider-auth)/signup-personal';
  }

  if (params.role === 'customer') {
    return params.fullName ? '/(customer)' : '/(auth)/onboarding';
  }

  return '/(auth)/onboarding';
}

export function buildDeliverySuccessSummary(params: {
  finalPrice?: number | null;
  deliveryTime?: string | null;
  riderName?: string | null;
}) {
  return {
    finalPriceLabel: params.finalPrice != null ? `₦${params.finalPrice.toLocaleString()}` : null,
    deliveryTimeLabel: params.deliveryTime ?? null,
    riderNameLabel: params.riderName ?? 'Rider',
  };
}

export function getWaitingForCustomerOutcome(params: {
  elapsedSeconds: number;
  accepted: boolean;
  cancelled: boolean;
  timeoutSeconds?: number;
}) {
  const timeoutSeconds = params.timeoutSeconds ?? BID_RESPONSE_WINDOW_SECONDS;

  if (params.accepted) {
    return 'navigate_to_pickup';
  }

  if (params.cancelled) {
    return 'bid_declined';
  }

  if (params.elapsedSeconds >= timeoutSeconds) {
    return 'withdraw_bid';
  }

  return 'keep_waiting';
}

export function buildTripCompleteTotals(riderEarnings: number, commission: number) {
  return {
    gross: riderEarnings + commission,
    commission,
    net: riderEarnings,
  };
}

export function shouldShowCallButton(params: {
  authorized: boolean;
  phone: string | null | undefined;
}) {
  return params.authorized && !!params.phone;
}

export function areQuickControlsUsable(screenWidth: number) {
  return screenWidth >= 320;
}

export type UploadFile = {
  name: string;
  size: number;
  type: string;
};

export function validateDocumentUpload(file: UploadFile) {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const maxBytes = 5 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    return { ok: false, error: 'Unsupported file type' };
  }

  if (file.size > maxBytes) {
    return { ok: false, error: 'File exceeds 5MB limit' };
  }

  return { ok: true, error: null };
}

export function resolveProtectedAssetAccess(params: {
  path: string;
  isPrivate: boolean;
  signedToken?: string | null;
}) {
  if (!params.isPrivate) {
    return { accessible: true, mode: 'public' as const };
  }

  if (params.signedToken) {
    return { accessible: true, mode: 'signed' as const };
  }

  return { accessible: false, mode: 'denied' as const };
}

export type AutoCancelOrder = {
  id: string;
  status: string;
  expires_at: string | null;
  payment_method: PaymentMethod;
  refunded_references?: string[];
};

export function selectExpiredPendingOrders(orders: AutoCancelOrder[], now: Date) {
  return orders.filter((order) =>
    order.status === 'pending' &&
    order.expires_at != null &&
    new Date(order.expires_at).getTime() <= now.getTime(),
  );
}

export function shouldRefundCancelledWalletOrder(order: AutoCancelOrder, reference: string) {
  if (order.payment_method !== 'wallet') {
    return false;
  }

  return !(order.refunded_references ?? []).includes(reference);
}

export function dedupeNotifications(events: Array<{ key: string; type: string }>) {
  return events.filter((event, index, all) => all.findIndex((candidate) => candidate.key === event.key) === index);
}

export function shouldTriggerRating(orderStatus: string) {
  return orderStatus === 'completed' || orderStatus === 'delivered';
}

export function verifyReleaseConfig(env: Record<string, string | undefined>, requiredKeys: string[]) {
  const missing = requiredKeys.filter((key) => !env[key]);
  return {
    ok: missing.length === 0,
    missing,
    message: missing.length === 0
      ? 'Release config looks complete.'
      : `Missing required config: ${missing.join(', ')}`,
  };
}

export function buildPhase8WalletDeliveryScenario() {
  const payment = {
    reference: 'FUND-e2e-1',
    walletId: 'wallet-customer-1',
    amount: 5000,
  };
  const order = {
    id: 'order-e2e-1',
    payment_method: 'wallet' as const,
    status: 'arrived_dropoff',
    final_price: 3200,
    customer_id: 'customer-1',
    rider_id: 'rider-1',
    delivery_code_verified: true,
  };
  const payout = buildRiderEarningsBreakdown({
    gross: order.final_price,
    commissionRatePercentage: 18,
  });

  return {
    payment,
    order,
    payout,
  };
}

export function buildPhase8CashOutstandingScenario() {
  return {
    orderId: 'order-cash-1',
    payment_method: 'cash' as const,
    final_price: 2800,
    outstanding_balance: 2800,
  };
}

export function buildPhase8IdentityWithdrawalScenario() {
  const documentPath = buildDocumentStoragePath('profile-rider-1', 'drivers_license', 1700000000000);
  const bankMutation = buildBankAccountMutation(
    'rider-1',
    {
      bank_name: 'GTBank',
      bank_code: '058',
      account_number: '0123456789',
      account_name: 'Rider One',
    },
    null,
  );
  const withdrawal = validateWithdrawalRequest({
    amount: 1500,
    balance: 2500,
    hasBankAccount: true,
  });

  return {
    documentPath,
    bankMutation,
    withdrawal,
  };
}

export function buildPhase8NegotiationScenario() {
  const bids: NegotiationBid[] = [
    { id: 'bid-1', order_id: 'order-1', rider_id: 'rider-1', amount: 2200, status: 'countered', negotiation_round: 1, parent_bid_id: null },
    { id: 'bid-2', order_id: 'order-1', rider_id: 'rider-1', amount: 2100, status: 'countered', negotiation_round: 2, parent_bid_id: 'bid-1' },
    { id: 'bid-3', order_id: 'order-1', rider_id: 'rider-1', amount: 2000, status: 'pending', negotiation_round: 3, parent_bid_id: 'bid-2' },
  ];

  return sendCounterOffer(bids, 'bid-3', 1900);
}

export function buildPhase8TrackingScenario() {
  const now = new Date('2026-04-02T10:00:00.000Z');
  const stale = getTrackingState(new Date('2026-04-02T09:59:30.000Z'), now, 15);
  const fresh = getTrackingState(new Date('2026-04-02T09:59:55.000Z'), now, 15);
  return { stale, fresh };
}

export function buildPhase8ContactScenario() {
  const order = { customer_id: 'customer-1', rider_id: 'rider-1', status: 'matched' };
  const matchedCustomerView = getAuthorizedContactView({
    viewerRole: 'customer',
    viewerId: 'customer-1',
    order,
    contact: { full_name: 'Rider One', phone: '+2348011111111' },
  });
  const unrelatedView = getAuthorizedContactView({
    viewerRole: 'customer',
    viewerId: 'customer-2',
    order,
    contact: { full_name: 'Rider One', phone: '+2348011111111' },
  });

  return {
    matchedCustomerView,
    unrelatedView,
  };
}

export function buildPhase8DuplicateWebhookScenario() {
  return {
    firstCreditAccepted: true,
    secondCreditAccepted: false,
    duplicateReference: 'FUND-e2e-1',
  };
}

export function verifyDeliveryLockCannotBeBypassed() {
  const now = new Date('2026-04-02T10:00:00.000Z');
  const thirdAttempt = verifyDeliveryCodeAttempt(
    {
      delivery_code: '123456',
      failed_delivery_attempts: 2,
      delivery_locked_until: null,
    },
    '000000',
    now,
  );

  const bypassAttempt = verifyDeliveryCodeAttempt(
    {
      delivery_code: '123456',
      failed_delivery_attempts: 3,
      delivery_locked_until: thirdAttempt.nextState.delivery_locked_until ?? null,
    },
    '123456',
    now,
  );

  return {
    thirdAttempt,
    bypassAttempt,
  };
}

export function buildSecurePodAccess(profileId: string, orderId: string) {
  const path = buildPodStoragePath(profileId, orderId, 1700000000000);
  return resolveProtectedAssetAccess({
    path,
    isPrivate: true,
    signedToken: 'signed-token',
  });
}
