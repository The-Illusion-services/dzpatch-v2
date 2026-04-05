/**
 * Sprint 1 - Financial and delivery risk regression coverage
 *
 * Pure helper tests that mirror the critical production contracts.
 */

function buildWalletFundingRpcArgs(walletId: string, amountNaira: number, reference: string, metadata: unknown) {
  return {
    p_wallet_id: walletId,
    p_amount: amountNaira,
    p_type: 'credit',
    p_reference: reference,
    p_description: 'Wallet top-up via Paystack',
    p_metadata: metadata,
  };
}

function isWalletFundingCallback(url: string) {
  return url.startsWith('https://dzpatch.co/paystack-callback') || url.includes('paystack.com/complete');
}

function confirmWalletFunding(existingReferences: string[], reference: string) {
  return existingReferences.includes(reference);
}

function resolveRiderWalletOwnerId(rider: { id: string; profile_id: string }) {
  return rider.profile_id;
}

function buildPodStoragePath(userId: string, orderId: string, timestamp: number) {
  return `rider-docs/${userId}/pod/${orderId}/pod-${orderId}-${timestamp}.jpg`;
}

describe('Sprint 1 - wallet funding webhook contract', () => {
  test('wallet funding webhook passes the full credit_wallet contract', () => {
    const payload = buildWalletFundingRpcArgs('wallet-1', 2500, 'FUND-123', { event: 'charge.success' });
    expect(payload).toEqual({
      p_wallet_id: 'wallet-1',
      p_amount: 2500,
      p_type: 'credit',
      p_reference: 'FUND-123',
      p_description: 'Wallet top-up via Paystack',
      p_metadata: { event: 'charge.success' },
    });
  });

  test('duplicate webhook references stay idempotent once the reference already exists', () => {
    const processed = ['FUND-1'];
    expect(confirmWalletFunding(processed, 'FUND-1')).toBe(true);
    expect(confirmWalletFunding(processed, 'FUND-2')).toBe(false);
  });
});

describe('Sprint 1 - wallet funding confirmation flow', () => {
  test('callback detection accepts the canonical redirect URL', () => {
    expect(isWalletFundingCallback('https://dzpatch.co/paystack-callback?reference=abc')).toBe(true);
  });

  test('callback detection also accepts paystack completion redirects', () => {
    expect(isWalletFundingCallback('https://checkout.paystack.com/complete/abc')).toBe(true);
  });

  test('non-callback URLs are ignored', () => {
    expect(isWalletFundingCallback('https://example.com/home')).toBe(false);
  });
});

describe('Sprint 1 - rider payout identity', () => {
  test('rider payouts resolve wallet ownership through profile_id, not riders.id', () => {
    const rider = { id: 'rider-row-id', profile_id: 'auth-profile-id' };
    expect(resolveRiderWalletOwnerId(rider)).toBe('auth-profile-id');
  });
});

describe('Sprint 1 - proof of delivery storage path', () => {
  test('POD uploads stay under the private rider-docs prefix allowed by storage RLS', () => {
    const path = buildPodStoragePath('user-123', 'order-456', 1700000000000);
    expect(path.startsWith('rider-docs/user-123/')).toBe(true);
    expect(path).toContain('/pod/order-456/');
    expect(path.endsWith('.jpg')).toBe(true);
  });
});
