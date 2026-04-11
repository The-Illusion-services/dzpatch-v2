export type PartnerAccountStatus = 'active' | 'inactive' | 'suspended';
export type PartnerPricingMode = 'partner_submitted' | 'fixed';
export type PartnerPricingSource = 'partner_submitted' | 'partner_contract';
export type PartnerDeliveryStatus =
  | 'accepted'
  | 'rider_assigned'
  | 'arrived_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'arrived_dropoff'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'failed_no_rider';
export type PartnerWebhookEventStatus = 'pending' | 'delivered' | 'failed';
export type PartnerAuditActorType = 'partner' | 'admin' | 'service' | 'system';
export type PartnerDeliveryCodeStatus = 'active' | 'used' | 'expired';
export type PartnerErrorCode =
  | 'unauthorized_partner'
  | 'invalid_payload'
  | 'delivery_already_exists'
  | 'idempotency_conflict'
  | 'delivery_not_found'
  | 'delivery_cannot_be_cancelled'
  | 'partner_pricing_rejected'
  | 'pricing_mismatch'
  | 'no_rider_available'
  | 'internal_error';

export type PartnerDeliveryItem = {
  name: string;
  quantity: number;
};

export type PartnerParty = {
  name: string;
  phone: string | null;
  address: string;
  lat: number;
  lng: number;
  instructions: string | null;
};

export type PartnerCustomer = {
  name: string;
  phone: string | null;
};

export type PartnerDeliveryRequest = {
  external_order_id: string;
  external_reference?: string | null;
  pickup: PartnerParty;
  dropoff: PartnerParty;
  items: PartnerDeliveryItem[];
  items_summary: string | null;
  customer: PartnerCustomer | null;
  pricing: {
    currency: string;
    partner_calculated_fee: number;
  };
  meta: Record<string, unknown>;
};

export type PartnerValidationError = {
  code: PartnerErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type PartnerValidationFailure = {
  ok: false;
  error: PartnerValidationError;
};

export type PartnerValidationSuccess<T> = {
  ok: true;
  value: T;
};

export type PartnerValidationResult<T> = PartnerValidationSuccess<T> | PartnerValidationFailure;

const MAX_ADDRESS_LENGTH = 500;
const MAX_REFERENCE_LENGTH = 191;
const MAX_ITEMS = 100;
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function validateCreateDeliveryRequest(payload: unknown): PartnerValidationResult<PartnerDeliveryRequest> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return invalid('Payload must be a JSON object.');
  }

  const input = payload as Record<string, unknown>;
  const externalOrderId = requiredString(input.external_order_id, 'external_order_id');
  if (!externalOrderId.ok) return externalOrderId;

  const externalReference = optionalString(input.external_reference, 'external_reference');
  if (!externalReference.ok) return externalReference;
  if (externalReference.value && externalReference.value.length > MAX_REFERENCE_LENGTH) {
    return invalid('external_reference is too long.', { field: 'external_reference' });
  }

  const pickup = validateParty(input.pickup, 'pickup', { requirePhone: false });
  if (!pickup.ok) return pickup;

  const dropoff = validateParty(input.dropoff, 'dropoff', { requirePhone: true });
  if (!dropoff.ok) return dropoff;

  const items = validateItems(input.items);
  if (!items.ok) return items;

  const itemsSummary = optionalString(input.items_summary, 'items_summary');
  if (!itemsSummary.ok) return itemsSummary;

  const customer = validateCustomer(input.customer);
  if (!customer.ok) return customer;

  const pricing = validatePricing(input.pricing);
  if (!pricing.ok) return pricing;

  const meta = normalizeMeta(input.meta);
  if (!meta.ok) return meta;

  return {
    ok: true,
    value: {
      external_order_id: externalOrderId.value,
      external_reference: externalReference.value,
      pickup: pickup.value,
      dropoff: dropoff.value,
      items: items.value,
      items_summary: itemsSummary.value,
      customer: customer.value,
      pricing: pricing.value,
      meta: meta.value,
    },
  };
}

export function normalizePhoneNumber(input: string | null | undefined): string | null {
  if (!input) return null;

  const raw = input.trim();
  if (!raw) return null;

  if (E164_REGEX.test(raw)) return raw;

  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function isTerminalPartnerDeliveryStatus(status: string): status is PartnerDeliveryStatus {
  return status === 'delivered' || status === 'cancelled' || status === 'failed' || status === 'failed_no_rider';
}

export function canCancelPartnerDelivery(status: string): boolean {
  return status === 'accepted' || status === 'rider_assigned' || status === 'arrived_pickup';
}

function validateParty(
  value: unknown,
  fieldPrefix: string,
  options: { requirePhone: boolean },
): PartnerValidationResult<PartnerParty> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(`${fieldPrefix} must be an object.`, { field: fieldPrefix });
  }

  const input = value as Record<string, unknown>;
  const name = requiredString(input.name, `${fieldPrefix}.name`);
  if (!name.ok) return name;
  const address = requiredString(input.address, `${fieldPrefix}.address`);
  if (!address.ok) return address;
  if (address.value.length > MAX_ADDRESS_LENGTH) {
    return invalid(`${fieldPrefix}.address is too long.`, { field: `${fieldPrefix}.address` });
  }

  const lat = requiredCoordinate(input.lat, `${fieldPrefix}.lat`);
  if (!lat.ok) return lat;
  const lng = requiredCoordinate(input.lng, `${fieldPrefix}.lng`);
  if (!lng.ok) return lng;

  const phone = optionalString(input.phone, `${fieldPrefix}.phone`);
  if (!phone.ok) return phone;
  const normalizedPhone = normalizePhoneNumber(phone.value);
  if (options.requirePhone && !normalizedPhone) {
    return invalid(`${fieldPrefix}.phone must be a valid phone number.`, { field: `${fieldPrefix}.phone` });
  }
  if (phone.value && !normalizedPhone) {
    return invalid(`${fieldPrefix}.phone must be a valid phone number.`, { field: `${fieldPrefix}.phone` });
  }

  const instructions = optionalString(input.instructions, `${fieldPrefix}.instructions`);
  if (!instructions.ok) return instructions;

  return {
    ok: true,
    value: {
      name: name.value,
      phone: normalizedPhone,
      address: address.value,
      lat: lat.value,
      lng: lng.value,
      instructions: instructions.value,
    },
  };
}

function validateItems(value: unknown): PartnerValidationResult<PartnerDeliveryItem[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return invalid('items must be a non-empty array.', { field: 'items' });
  }
  if (value.length > MAX_ITEMS) {
    return invalid('items contains too many entries.', { field: 'items' });
  }

  const normalized: PartnerDeliveryItem[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return invalid('Each item must be an object.', { field: `items[${i}]` });
    }

    const input = item as Record<string, unknown>;
    const name = requiredString(input.name, `items[${i}].name`);
    if (!name.ok) return name;
    const quantity = requiredPositiveInteger(input.quantity, `items[${i}].quantity`);
    if (!quantity.ok) return quantity;

    normalized.push({ name: name.value, quantity: quantity.value });
  }

  return { ok: true, value: normalized };
}

function validateCustomer(value: unknown): PartnerValidationResult<PartnerCustomer | null> {
  if (value == null) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return invalid('customer must be an object.', { field: 'customer' });
  }

  const input = value as Record<string, unknown>;
  const name = optionalString(input.name, 'customer.name');
  if (!name.ok) return name;
  const phone = optionalString(input.phone, 'customer.phone');
  if (!phone.ok) return phone;

  return {
    ok: true,
    value: {
      name: name.value ?? '',
      phone: normalizePhoneNumber(phone.value),
    },
  };
}

function validatePricing(
  value: unknown,
): PartnerValidationResult<{ currency: string; partner_calculated_fee: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('pricing must be an object.', { field: 'pricing' });
  }

  const input = value as Record<string, unknown>;
  const currency = requiredString(input.currency, 'pricing.currency');
  if (!currency.ok) return currency;
  if (currency.value !== 'NGN') {
    return invalid('pricing.currency must be NGN for the current integration contract.', {
      field: 'pricing.currency',
    });
  }

  const fee = requiredMoney(input.partner_calculated_fee, 'pricing.partner_calculated_fee');
  if (!fee.ok) return fee;

  return {
    ok: true,
    value: {
      currency: currency.value,
      partner_calculated_fee: fee.value,
    },
  };
}

function normalizeMeta(value: unknown): PartnerValidationResult<Record<string, unknown>> {
  if (value == null) {
    return { ok: true, value: {} };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return invalid('meta must be an object.', { field: 'meta' });
  }

  return { ok: true, value: value as Record<string, unknown> };
}

function requiredString(value: unknown, field: string): PartnerValidationResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return invalid(`${field} is required.`, { field });
  }

  return { ok: true, value: value.trim() };
}

function optionalString(value: unknown, field: string): PartnerValidationResult<string | null> {
  if (value == null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') {
    return invalid(`${field} must be a string.`, { field });
  }

  return { ok: true, value: value.trim() || null };
}

function requiredCoordinate(value: unknown, field: string): PartnerValidationResult<number> {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return invalid(`${field} must be a valid number.`, { field });
  }

  return { ok: true, value: roundCoordinate(value) };
}

function requiredPositiveInteger(value: unknown, field: string): PartnerValidationResult<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return invalid(`${field} must be a positive integer.`, { field });
  }

  return { ok: true, value };
}

function requiredMoney(value: unknown, field: string): PartnerValidationResult<number> {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
    return invalid(`${field} must be a non-negative number.`, { field });
  }

  return { ok: true, value: roundMoney(value) };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function invalid(message: string, details?: Record<string, unknown>): PartnerValidationFailure {
  return {
    ok: false,
    error: {
      code: 'invalid_payload',
      message,
      details,
    },
  };
}
