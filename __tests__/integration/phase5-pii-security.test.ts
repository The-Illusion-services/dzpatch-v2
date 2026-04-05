import { describe, expect, it } from '@jest/globals';
import {
  canCancelOrder,
  canCreateDispute,
  canDebitWallet,
  canPlaceBid,
  canUpdateOrderStatus,
  getAuthorizedContactView,
  getOrderDetailsContactExposure,
  isDirectProfileReadAllowed,
  isSecureRiderStoragePath,
  sanitizeChatContactPayload,
  verifyDeliveryLockCannotBeBypassed,
} from '@/lib/integration-phase-helpers';

describe('Phase 5 - PII, Authorization, and Security Hardening', () => {
  const matchedOrder = {
    customer_id: 'customer-1',
    rider_id: 'rider-1',
    status: 'matched',
  };

  it('matched rider can fetch matched customer contact details', () => {
    expect(getAuthorizedContactView({
      viewerRole: 'rider',
      viewerId: 'rider-1',
      order: matchedOrder,
      contact: { full_name: 'Customer One', phone: '+2348010000000' },
    })).toEqual({
      full_name: 'Customer One',
      phone: '+2348010000000',
    });
  });

  it('unmatched rider cannot fetch customer contact details', () => {
    expect(getAuthorizedContactView({
      viewerRole: 'rider',
      viewerId: 'rider-2',
      order: matchedOrder,
      contact: { full_name: 'Customer One', phone: '+2348010000000' },
    })).toBeNull();
  });

  it('matched customer can fetch assigned rider contact details', () => {
    expect(getAuthorizedContactView({
      viewerRole: 'customer',
      viewerId: 'customer-1',
      order: matchedOrder,
      contact: { full_name: 'Rider One', phone: '+2348020000000' },
    })).toEqual({
      full_name: 'Rider One',
      phone: '+2348020000000',
    });
  });

  it('unrelated customer cannot fetch another rider contact details', () => {
    expect(getAuthorizedContactView({
      viewerRole: 'customer',
      viewerId: 'customer-2',
      order: matchedOrder,
      contact: { full_name: 'Rider One', phone: '+2348020000000' },
    })).toBeNull();
  });

  it('chat/contact flows expose only minimum authorized fields', () => {
    expect(sanitizeChatContactPayload({
      full_name: 'Rider One',
      phone: '+2348020000000',
      email: 'hidden@example.com',
      address: 'Hidden',
      avatar_url: null,
    })).toEqual({
      full_name: 'Rider One',
      phone: '+2348020000000',
      avatar_url: null,
    });
  });

  it('order details do not leak phone numbers before match', () => {
    expect(getOrderDetailsContactExposure({ matched: false, phone: '+2348020000000' })).toBeNull();
  });

  it('direct profile reads are blocked where they should be', () => {
    expect(isDirectProfileReadAllowed({
      requesterId: 'user-1',
      targetId: 'user-2',
    })).toBe(false);
  });

  it('authorized RPC/view returns minimum required fields only', () => {
    expect(Object.keys(sanitizeChatContactPayload({
      full_name: 'Customer',
      phone: '+2348010000000',
      email: 'hidden@example.com',
      address: 'Secret',
    }))).toEqual(['full_name', 'phone', 'avatar_url']);
  });

  it('customer cannot cancel another customer order', () => {
    expect(canCancelOrder('customer-2', 'customer-1')).toBe(false);
  });

  it('rider cannot update another rider order status', () => {
    expect(canUpdateOrderStatus('rider-2', 'rider-1')).toBe(false);
  });

  it('unauthorized dispute creation is blocked', () => {
    expect(canCreateDispute('random-user', matchedOrder)).toBe(false);
  });

  it('delivery code brute-force lock cannot be bypassed', () => {
    const result = verifyDeliveryLockCannotBeBypassed();
    expect(result.thirdAttempt.locked).toBe(true);
    expect(result.bypassAttempt.locked).toBe(true);
    expect(result.bypassAttempt.verified).toBe(false);
  });

  it('wallet debit cannot push balance below zero', () => {
    expect(canDebitWallet(1000, 1200)).toBe(false);
  });

  it('commission-locked rider cannot place bids', () => {
    expect(canPlaceBid({ commissionLocked: true })).toBe(false);
  });

  it('storage paths cannot escape allowed rider prefix', () => {
    expect(isSecureRiderStoragePath('profile-1', 'rider-docs/profile-1/documents/license/file.jpg')).toBe(true);
    expect(isSecureRiderStoragePath('profile-1', 'rider-docs/profile-2/../secrets.txt')).toBe(false);
  });
});
