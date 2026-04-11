import { hmacSha256Hex } from './partner-crypto.ts';

export async function signPartnerWebhookPayload(params: {
  secret: string;
  timestamp: string;
  rawBody: string;
}): Promise<string> {
  return hmacSha256Hex(params.secret, `${params.timestamp}.${params.rawBody}`);
}
