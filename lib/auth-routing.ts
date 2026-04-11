import type { KycStatus, UserRole } from '@/types/database';

type AuthRouteParams = {
  hasSession: boolean;
  role: UserRole | null;
  fullName?: string | null;
  kycStatus?: KycStatus | null;
};

export function resolveAuthRoute(params: AuthRouteParams): string | null {
  if (!params.hasSession) {
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
