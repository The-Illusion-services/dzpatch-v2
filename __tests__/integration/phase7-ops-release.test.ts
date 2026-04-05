import { describe, expect, it } from '@jest/globals';
import {
  dedupeNotifications,
  resolveProtectedAssetAccess,
  selectExpiredPendingOrders,
  shouldRefundCancelledWalletOrder,
  shouldTriggerRating,
  validateDocumentUpload,
  verifyReleaseConfig,
} from '@/lib/integration-phase-helpers';

describe('Phase 7 - Storage, Notifications, Jobs, and Release Operations', () => {
  it('rider document upload accepts allowed file types', () => {
    expect(validateDocumentUpload({
      name: 'license.jpg',
      size: 1024,
      type: 'image/jpeg',
    })).toEqual({
      ok: true,
      error: null,
    });
  });

  it('invalid file types are rejected', () => {
    expect(validateDocumentUpload({
      name: 'license.exe',
      size: 1024,
      type: 'application/octet-stream',
    })).toEqual({
      ok: false,
      error: 'Unsupported file type',
    });
  });

  it('oversized file is rejected', () => {
    expect(validateDocumentUpload({
      name: 'license.jpg',
      size: 6 * 1024 * 1024,
      type: 'image/jpeg',
    })).toEqual({
      ok: false,
      error: 'File exceeds 5MB limit',
    });
  });

  it('signed/private retrieval works for protected assets', () => {
    expect(resolveProtectedAssetAccess({
      path: 'rider-docs/profile-1/documents/license/file.jpg',
      isPrivate: true,
      signedToken: 'token',
    })).toEqual({
      accessible: true,
      mode: 'signed',
    });
  });

  it('auto-cancel expired orders affects only expired pending orders', () => {
    expect(selectExpiredPendingOrders([
      { id: '1', status: 'pending', expires_at: '2026-04-02T09:00:00.000Z', payment_method: 'wallet' },
      { id: '2', status: 'matched', expires_at: '2026-04-02T09:00:00.000Z', payment_method: 'wallet' },
      { id: '3', status: 'pending', expires_at: '2026-04-02T11:00:00.000Z', payment_method: 'cash' },
    ], new Date('2026-04-02T10:00:00.000Z')).map((order) => order.id)).toEqual(['1']);
  });

  it('auto-cancel refund runs once only', () => {
    expect(shouldRefundCancelledWalletOrder({
      id: '1',
      status: 'pending',
      expires_at: '2026-04-02T09:00:00.000Z',
      payment_method: 'wallet',
      refunded_references: ['REF-1'],
    }, 'REF-1')).toBe(false);
  });

  it('delivery/rating notifications fire once', () => {
    expect(dedupeNotifications([
      { key: 'delivery:1', type: 'delivery' },
      { key: 'delivery:1', type: 'delivery' },
      { key: 'rating:1', type: 'rating' },
    ])).toEqual([
      { key: 'delivery:1', type: 'delivery' },
      { key: 'rating:1', type: 'rating' },
    ]);
  });

  it('rating trigger runs only for completed orders', () => {
    expect(shouldTriggerRating('completed')).toBe(true);
    expect(shouldTriggerRating('pending')).toBe(false);
  });

  it('release smoke script verifies required env/config values', () => {
    expect(verifyReleaseConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      PAYSTACK_SECRET_KEY: 'secret',
    }, ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PAYSTACK_SECRET_KEY'])).toEqual({
      ok: true,
      missing: [],
      message: 'Release config looks complete.',
    });
  });

  it('secrets/config absence fails fast with actionable output', () => {
    expect(verifyReleaseConfig({
      SUPABASE_URL: 'https://example.supabase.co',
    }, ['SUPABASE_URL', 'SUPABASE_ANON_KEY'])).toEqual({
      ok: false,
      missing: ['SUPABASE_ANON_KEY'],
      message: 'Missing required config: SUPABASE_ANON_KEY',
    });
  });
});
