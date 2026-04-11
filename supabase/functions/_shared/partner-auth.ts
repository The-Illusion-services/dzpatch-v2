import { sha256Hex } from './partner-crypto.ts';
import type { PartnerAccountRecord } from './partner-service.ts';

export async function authenticatePartnerRequest(params: {
  req: Request;
  supabase: any;
}): Promise<
  | { ok: true; account: PartnerAccountRecord; tokenHash: string }
  | { ok: false; status: number; message: string }
> {
  const authHeader = params.req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Missing partner bearer token.' };
  }

  const apiKey = authHeader.slice('Bearer '.length).trim();
  if (!apiKey) {
    return { ok: false, status: 401, message: 'Missing partner bearer token.' };
  }

  const tokenHash = await sha256Hex(apiKey);
  const { data, error } = await params.supabase
    .from('partner_accounts')
    .select('*')
    .eq('api_key_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 401, message: 'Unauthorized partner.' };
  }

  return { ok: true, account: data as PartnerAccountRecord, tokenHash };
}

export async function insertPartnerAuditLog(params: {
  supabase: any;
  partnerAccountId?: string | null;
  action: string;
  actorType: 'partner' | 'admin' | 'service' | 'system';
  payload?: Record<string, unknown>;
}): Promise<void> {
  await params.supabase.from('partner_audit_logs').insert({
    partner_account_id: params.partnerAccountId ?? null,
    action: params.action,
    actor_type: params.actorType,
    payload: params.payload ?? {},
  });
}
