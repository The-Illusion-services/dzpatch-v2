export interface DeliveryCodeState {
  delivery_code: string;
  failed_delivery_attempts: number;
  delivery_locked_until: Date | string | null;
}

export interface DeliveryCodeAttemptResult {
  verified: boolean;
  locked: boolean;
  nextState: {
    delivery_code_verified?: boolean;
    failed_delivery_attempts?: number;
    delivery_locked_until?: Date | null;
  };
}

export function calculateDeliveryPayout(finalPrice: number, commissionRate: number) {
  const commission = roundCurrency(finalPrice * commissionRate);
  const riderNet = roundCurrency(finalPrice - commission);

  return {
    finalPrice,
    commissionRate,
    commission,
    riderNet,
  };
}

export function resolveRiderWalletOwnerId(rider: { profile_id: string }) {
  return rider.profile_id;
}

export function verifyDeliveryCodeAttempt(
  order: DeliveryCodeState,
  code: string,
  now = new Date(),
): DeliveryCodeAttemptResult {
  const lockedUntil = normalizeDate(order.delivery_locked_until);
  if (lockedUntil && lockedUntil > now) {
    return {
      verified: false,
      locked: true,
      nextState: {},
    };
  }

  if (order.delivery_code === code) {
    return {
      verified: true,
      locked: false,
      nextState: {
        delivery_code_verified: true,
        failed_delivery_attempts: 0,
        delivery_locked_until: null,
      },
    };
  }

  const attempts = order.failed_delivery_attempts + 1;
  const shouldLock = attempts >= 3;

  return {
    verified: false,
    locked: shouldLock,
    nextState: {
      failed_delivery_attempts: attempts,
      delivery_locked_until: shouldLock ? new Date(now.getTime() + 60 * 60 * 1000) : null,
    },
  };
}

export function buildPodStoragePath(
  profileId: string,
  orderId: string,
  timestamp = Date.now(),
  extension = 'jpg',
) {
  return `rider-docs/${profileId}/pod/${orderId}/pod-${orderId}-${timestamp}.${extension}`;
}

export async function uploadProofOfDelivery({
  podPhotoUri,
  profileId,
  orderId,
  fetchBlob,
  uploadFile,
  now = Date.now(),
}: {
  podPhotoUri: string;
  profileId: string;
  orderId: string;
  fetchBlob: (uri: string) => Promise<Blob>;
  uploadFile: (
    path: string,
    file: Blob,
    options: { contentType: string },
  ) => Promise<{ data?: { path?: string } | null; error?: Error | null }>;
  now?: number;
}) {
  const storagePath = buildPodStoragePath(profileId, orderId, now);
  const blob = await fetchBlob(podPhotoUri);
  const { data, error } = await uploadFile(storagePath, blob, { contentType: 'image/jpeg' });

  if (error) {
    throw error;
  }

  return data?.path ?? storagePath;
}

function normalizeDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
