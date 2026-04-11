const DELIVERY_CODE_MIN = 0;
const DELIVERY_CODE_MAX = 1_000_000;

export function generateSixDigitDeliveryCode(): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % DELIVERY_CODE_MAX;
  return random.toString().padStart(6, '0');
}

export function isSixDigitDeliveryCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}
