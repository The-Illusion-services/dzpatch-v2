import { describe, expect, it } from '@jest/globals';
import { resolveAuthRoute } from '@/lib/auth-routing';

describe('resolveAuthRoute', () => {
  it('routes signed-out users to onboarding', () => {
    expect(resolveAuthRoute({
      hasSession: false,
      role: null,
    })).toBe('/(auth)/onboarding');
  });

  it('waits when a session exists but role is not ready yet', () => {
    expect(resolveAuthRoute({
      hasSession: true,
      role: null,
    })).toBeNull();
  });

  it('does not route customers with missing profile names into customer home', () => {
    expect(resolveAuthRoute({
      hasSession: true,
      role: 'customer',
      fullName: null,
    })).toBe('/(auth)/onboarding');
  });

  it('routes completed customers into customer home', () => {
    expect(resolveAuthRoute({
      hasSession: true,
      role: 'customer',
      fullName: 'Test Customer',
    })).toBe('/(customer)');
  });

  it('routes riders by kyc state', () => {
    expect(resolveAuthRoute({
      hasSession: true,
      role: 'rider',
      fullName: 'Rider One',
      kycStatus: 'approved',
    })).toBe('/(rider)');

    expect(resolveAuthRoute({
      hasSession: true,
      role: 'rider',
      fullName: 'Rider One',
      kycStatus: 'pending',
    })).toBe('/(rider-auth)/pending-approval');
  });
});
