-- Foodhunt x Dzpatch repair: partner quotes, real Dzpatch order linkage,
-- outbound webhook queueing, delivery-code secrecy, and critical RPC fixes.

alter table public.partner_accounts
  add column if not exists customer_profile_id uuid null references public.profiles(id) on delete restrict;

create table if not exists public.partner_quotes (
  id uuid primary key default gen_random_uuid(),
  partner_account_id uuid not null references public.partner_accounts(id) on delete cascade,
  external_checkout_reference text not null,
  request_payload jsonb not null,
  submitted_fee numeric(12,2) not null check (submitted_fee >= 0),
  applied_fee numeric(12,2) not null check (applied_fee >= 0),
  pricing_source text not null check (pricing_source in ('partner_submitted', 'partner_contract')),
  currency text not null default 'NGN' check (currency = 'NGN'),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_account_id, external_checkout_reference)
);

create index if not exists idx_partner_quotes_partner_expiry
  on public.partner_quotes (partner_account_id, expires_at);

alter table public.partner_quotes enable row level security;

drop policy if exists partner_quotes_admin_select on public.partner_quotes;
create policy partner_quotes_admin_select
  on public.partner_quotes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

drop policy if exists partner_quotes_admin_update on public.partner_quotes;
create policy partner_quotes_admin_update
  on public.partner_quotes
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

grant select, insert, update on public.partner_quotes to authenticated;
grant all on public.partner_quotes to service_role;

alter table public.partner_deliveries
  add column if not exists partner_quote_id uuid null references public.partner_quotes(id) on delete set null;

create index if not exists idx_partner_deliveries_partner_quote
  on public.partner_deliveries (partner_quote_id);

drop trigger if exists set_updated_at on public.partner_quotes;
create trigger set_updated_at
before update on public.partner_quotes
for each row execute function public.update_updated_at_column();

create table if not exists public.order_delivery_secrets (
  order_id uuid primary key references public.orders(id) on delete cascade,
  code_plain text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz null
);

alter table public.order_delivery_secrets
  add column if not exists code_plain text;

alter table public.order_delivery_secrets enable row level security;
revoke all on public.order_delivery_secrets from anon, authenticated;
grant all on public.order_delivery_secrets to service_role;

create or replace function public.hash_delivery_code(p_code text)
returns text
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  select encode(digest(coalesce(p_code, ''), 'sha256'), 'hex');
$$;

revoke all on function public.hash_delivery_code(text) from anon, authenticated;
grant execute on function public.hash_delivery_code(text) to service_role;

create or replace function public.capture_order_delivery_secret()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if new.delivery_code is not null and trim(new.delivery_code) <> '' then
    insert into public.order_delivery_secrets(order_id, code_plain, code_hash)
    values (new.id, new.delivery_code, public.hash_delivery_code(new.delivery_code))
    on conflict (order_id) do update
      set code_plain = excluded.code_plain,
          code_hash = excluded.code_hash,
          verified_at = null;

    update public.orders
      set delivery_code = null
      where id = new.id
        and delivery_code is not null;
  end if;

  return null;
end;
$$;

drop trigger if exists capture_order_delivery_secret_after_insert on public.orders;
create trigger capture_order_delivery_secret_after_insert
after insert or update of delivery_code on public.orders
for each row
when (new.delivery_code is not null)
execute function public.capture_order_delivery_secret();

insert into public.order_delivery_secrets(order_id, code_plain, code_hash)
select id, delivery_code, public.hash_delivery_code(delivery_code)
from public.orders
where delivery_code is not null
on conflict (order_id) do update
  set code_plain = excluded.code_plain,
      code_hash = excluded.code_hash;

update public.orders
set delivery_code = null
where delivery_code is not null;

create or replace function public.get_order_delivery_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders%rowtype;
  v_caller uuid := auth.uid();
  v_code text;
begin
  if v_caller is null then
    raise exception 'Authentication required';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.customer_id <> v_caller and not exists (
    select 1
    from public.profiles p
    where p.id = v_caller
      and p.role = 'admin'
      and p.is_active = true
  ) then
    raise exception 'Unauthorized';
  end if;

  -- Compatibility window: historical rows may still carry plaintext before this migration runs.
  v_code := v_order.delivery_code;
  if v_code is null then
    select code_plain into v_code
    from public.order_delivery_secrets
    where order_id = p_order_id;
  end if;

  return v_code;
end;
$$;

revoke all on function public.get_order_delivery_code(uuid) from anon;
grant execute on function public.get_order_delivery_code(uuid) to authenticated;
grant execute on function public.get_order_delivery_code(uuid) to service_role;

create or replace function public.verify_delivery_code(
    p_order_id uuid,
    p_rider_id uuid,
    p_code text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_order orders%rowtype;
    v_expected_hash text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not exists (select 1 from riders where id = p_rider_id and profile_id = auth.uid()) then
        raise exception 'Unauthorized: rider ID does not match session';
    end if;

    select * into v_order from orders where id = p_order_id for update;
    if not found then
        raise exception 'Order not found';
    end if;
    if v_order.rider_id != p_rider_id then
        raise exception 'This order is not assigned to you';
    end if;
    if v_order.status not in ('arrived_dropoff', 'in_transit') then
        raise exception 'Order is not at the delivery stage (status: %)', v_order.status;
    end if;

    if coalesce(v_order.delivery_code_verified, false) then
        return true;
    end if;

    if v_order.delivery_locked_until is not null and v_order.delivery_locked_until > now() then
        raise exception 'Too many incorrect attempts. Code entry locked until %',
            to_char(v_order.delivery_locked_until at time zone 'UTC', 'HH24:MI UTC');
    end if;

    select code_hash into v_expected_hash
    from public.order_delivery_secrets
    where order_id = p_order_id;

    if v_expected_hash is null and v_order.delivery_code is not null then
      v_expected_hash := public.hash_delivery_code(v_order.delivery_code);
    end if;

    if v_expected_hash is not null and v_expected_hash = public.hash_delivery_code(p_code) then
        update orders set
            delivery_code_verified   = true,
            failed_delivery_attempts = 0,
            delivery_locked_until    = null,
            updated_at               = now()
        where id = p_order_id;

        update public.order_delivery_secrets
        set verified_at = now()
        where order_id = p_order_id;

        return true;
    else
        update orders set
            failed_delivery_attempts = failed_delivery_attempts + 1,
            delivery_locked_until    = case
                when failed_delivery_attempts + 1 >= 3
                then now() + interval '15 minutes'
                else null
            end,
            updated_at = now()
        where id = p_order_id;
        return false;
    end if;
end;
$$;

revoke all on function public.verify_delivery_code(uuid, uuid, text) from anon;
grant execute on function public.verify_delivery_code(uuid, uuid, text) to authenticated;
grant execute on function public.verify_delivery_code(uuid, uuid, text) to service_role;

create or replace function public.update_order_status(
    p_order_id uuid,
    p_new_status public.order_status,
    p_changed_by uuid default null::uuid,
    p_reason text default null::text,
    p_metadata jsonb default null::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_order          orders%rowtype;
    v_caller_id      uuid;
    v_rider_profile  uuid;
    v_caller_role    user_role;
    v_is_customer    boolean := false;
    v_is_rider       boolean := false;
    v_is_admin       boolean := false;
    v_admin_delivery_override boolean := false;
begin
    v_caller_id := auth.uid();

    select * into v_order from orders where id = p_order_id for update;
    if not found then
        raise exception 'Order not found';
    end if;

    if v_caller_id is not null then
        if v_caller_id = v_order.customer_id then
            v_is_customer := true;
        end if;

        if not v_is_customer and v_order.rider_id is not null then
            select r.profile_id into v_rider_profile
            from riders r where r.id = v_order.rider_id;
            if v_rider_profile = v_caller_id then
                v_is_rider := true;
            end if;
        end if;

        if not v_is_customer and not v_is_rider then
            select role into v_caller_role from profiles where id = v_caller_id;
            if v_caller_role = 'admin' then
                v_is_admin := true;
            end if;
        end if;
    else
        v_is_admin := true;
    end if;

    if not (v_is_customer or v_is_rider or v_is_admin) then
        raise exception 'Unauthorized: you are not a participant in this order';
    end if;

    v_admin_delivery_override :=
      v_is_admin
      and p_new_status = 'delivered'
      and coalesce((p_metadata ->> 'admin_delivery_override')::boolean, false);

    if p_new_status = 'delivered' and not v_admin_delivery_override then
      raise exception 'Use complete_delivery to mark delivered so code, POD, and settlement are enforced';
    end if;

    if v_is_customer and not v_is_admin then
        if p_new_status != 'cancelled' then
            raise exception 'Customers may only cancel orders';
        end if;
        if v_order.status not in ('pending', 'matched', 'pickup_en_route', 'arrived_pickup') then
            raise exception 'Order cannot be cancelled at this stage (status: %)', v_order.status;
        end if;
    end if;

    if v_is_rider and not v_is_admin then
        if p_new_status not in ('pickup_en_route', 'arrived_pickup', 'in_transit', 'arrived_dropoff') then
            raise exception 'Riders may only advance non-terminal delivery transitions';
        end if;
    end if;

    if not (
        (v_order.status = 'pending'          and p_new_status in ('matched',          'cancelled')) or
        (v_order.status = 'matched'          and p_new_status in ('pickup_en_route',  'cancelled')) or
        (v_order.status = 'pickup_en_route'  and p_new_status in ('arrived_pickup',   'cancelled')) or
        (v_order.status = 'arrived_pickup'   and p_new_status in ('in_transit',       'cancelled')) or
        (v_order.status = 'in_transit'       and p_new_status in ('arrived_dropoff',  'cancelled')) or
        (v_order.status = 'arrived_dropoff'  and p_new_status = 'cancelled') or
        (v_order.status = 'arrived_dropoff'  and p_new_status = 'delivered' and v_admin_delivery_override) or
        (v_order.status = 'delivered'        and p_new_status = 'completed')
    ) then
        raise exception 'Invalid status transition: % -> %', v_order.status, p_new_status;
    end if;

    update orders set
        status       = p_new_status,
        picked_up_at = case when p_new_status = 'in_transit'  then now() else picked_up_at end,
        delivered_at = case when p_new_status = 'delivered'   then now() else delivered_at end,
        cancelled_at = case when p_new_status = 'cancelled'   then now() else cancelled_at end,
        updated_at   = now()
    where id = p_order_id;

    insert into order_status_history (order_id, old_status, new_status, changed_by, reason, metadata)
    values (p_order_id, v_order.status, p_new_status, coalesce(p_changed_by, v_caller_id), p_reason, p_metadata);

    if v_order.customer_id is not null then
        insert into notifications (user_id, type, title, body, data)
        values (
            v_order.customer_id,
            'order_update',
            'Order Update',
            'Your order status has changed to: ' || p_new_status,
            jsonb_build_object('order_id', p_order_id, 'status', p_new_status)
        );
    end if;
end;
$$;

revoke all on function public.update_order_status(uuid, public.order_status, uuid, text, jsonb) from anon;
grant execute on function public.update_order_status(uuid, public.order_status, uuid, text, jsonb) to authenticated;
grant execute on function public.update_order_status(uuid, public.order_status, uuid, text, jsonb) to service_role;

create or replace function public.enqueue_partner_delivery_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_partner_delivery public.partner_deliveries%rowtype;
  v_account public.partner_accounts%rowtype;
  v_partner_status text;
  v_sequence bigint;
  v_event_id text;
  v_payload jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.rider_id is not distinct from old.rider_id then
    return new;
  end if;

  select * into v_partner_delivery
  from public.partner_deliveries
  where dzpatch_order_id = new.id
  limit 1;

  if not found then
    return new;
  end if;

  select * into v_account
  from public.partner_accounts
  where id = v_partner_delivery.partner_account_id;

  if not found then
    return new;
  end if;

  v_partner_status := case
    when new.status = 'matched' then 'rider_assigned'
    when new.status = 'pickup_en_route' then 'rider_assigned'
    when new.status = 'arrived_pickup' then 'arrived_pickup'
    when new.status = 'in_transit' then 'picked_up'
    when new.status = 'arrived_dropoff' then 'arrived_dropoff'
    when new.status = 'delivered' then 'delivered'
    when new.status = 'cancelled' then 'cancelled'
    else null
  end;

  if v_partner_status is null then
    return new;
  end if;

  update public.partner_deliveries
  set status = v_partner_status,
      completed_at = case when v_partner_status = 'delivered' then now() else completed_at end,
      cancelled_at = case when v_partner_status = 'cancelled' then now() else cancelled_at end,
      delivery_code_status = case when v_partner_status = 'delivered' then 'used' when v_partner_status = 'cancelled' then 'expired' else delivery_code_status end
  where id = v_partner_delivery.id
  returning * into v_partner_delivery;

  select coalesce(max(sequence_version), 0) + 1
  into v_sequence
  from public.partner_webhook_events
  where partner_delivery_id = v_partner_delivery.id;

  v_event_id := v_partner_delivery.id::text || ':' || v_sequence::text || ':' || v_partner_status;
  v_payload := jsonb_build_object(
    'event_id', v_event_id,
    'event_type', 'delivery.' || v_partner_status,
    'occurred_at', now(),
    'delivery', jsonb_build_object(
      'delivery_id', v_partner_delivery.id,
      'external_order_id', v_partner_delivery.external_order_id,
      'status', v_partner_status,
      'tracking_url', 'https://dzpatch.app/track/' || v_partner_delivery.id::text,
      'rider', case when new.rider_id is null then null else jsonb_build_object('id', new.rider_id) end
    )
  );

  insert into public.partner_webhook_events (
    partner_account_id,
    partner_delivery_id,
    event_id,
    event_type,
    sequence_version,
    payload,
    status,
    next_retry_at
  )
  values (
    v_account.id,
    v_partner_delivery.id,
    v_event_id,
    'delivery.' || v_partner_status,
    v_sequence,
    v_payload,
    'pending',
    now()
  )
  on conflict (partner_delivery_id, sequence_version) do nothing;

  return new;
end;
$$;

drop trigger if exists enqueue_partner_delivery_webhook_after_order_update on public.orders;
create trigger enqueue_partner_delivery_webhook_after_order_update
after update of status, rider_id on public.orders
for each row
execute function public.enqueue_partner_delivery_webhook();

-- Reapply latest create_order body with the suggested_price fix from sprint 1.
-- The 20260407210000_sprint5_stability migration reintroduced dynamic_price
-- into suggested_price. Keep this repair last so it owns the deployed body.
CREATE OR REPLACE FUNCTION public.create_order(
    p_customer_id uuid,
    p_pickup_address text,
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_pickup_contact_name text DEFAULT NULL,
    p_pickup_contact_phone text DEFAULT NULL,
    p_dropoff_address text DEFAULT NULL,
    p_dropoff_lat double precision DEFAULT NULL,
    p_dropoff_lng double precision DEFAULT NULL,
    p_dropoff_contact_name text DEFAULT NULL,
    p_dropoff_contact_phone text DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_package_size text DEFAULT 'small',
    p_package_description text DEFAULT NULL,
    p_package_notes text DEFAULT NULL,
    p_suggested_price numeric DEFAULT NULL,
    p_promo_code text DEFAULT NULL,
    p_service_area_id uuid DEFAULT NULL,
    p_payment_method text DEFAULT 'wallet'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order_id UUID;
    v_pickup_point GEOGRAPHY;
    v_dropoff_point GEOGRAPHY;
    v_distance_km NUMERIC;
    v_dynamic_price NUMERIC;
    v_vat_amount NUMERIC;
    v_final_price NUMERIC;
    v_delivery_code TEXT;
    v_wallet_id UUID;
    v_reference TEXT;
    v_promo_id UUID;
    v_discount_amount NUMERIC := 0;
    v_pricing pricing_rules%ROWTYPE;
    v_platform_commission_rate NUMERIC := 15.00;
    v_platform_commission_amount NUMERIC;
    v_expires_at TIMESTAMPTZ;
    v_size_multiplier NUMERIC := 1.0;
    v_effective_surge NUMERIC := 1.0;
    v_promo promo_codes%ROWTYPE;
    v_effective_suggested_price NUMERIC;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_customer_id THEN
        RAISE EXCEPTION 'Not authorized to create this order';
    END IF;

    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
    END IF;

    IF p_package_size = 'medium' THEN
        v_size_multiplier := 1.5;
    ELSIF p_package_size = 'large' THEN
        v_size_multiplier := 2.0;
    END IF;

    v_pickup_point := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;
    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_effective_surge := GREATEST(1, LEAST(COALESCE(v_pricing.surge_multiplier, 1), 5));
        v_dynamic_price := ROUND((v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_effective_surge * v_size_multiplier, 2);
        IF v_dynamic_price < v_pricing.min_price THEN
            v_dynamic_price := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_dynamic_price := ROUND((500 + (v_distance_km * 100)) * v_size_multiplier, 2);
        v_vat_amount := ROUND(v_dynamic_price * 0.075, 2);
    END IF;

    v_effective_suggested_price := COALESCE(p_suggested_price, v_dynamic_price);

    IF p_promo_code IS NOT NULL AND NULLIF(TRIM(p_promo_code), '') IS NOT NULL THEN
        SELECT * INTO v_promo
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
        FOR UPDATE;

        IF FOUND
           AND v_promo.is_active = TRUE
           AND v_promo.starts_at <= NOW()
           AND (v_promo.expires_at IS NULL OR v_promo.expires_at > NOW())
           AND (v_promo.max_uses IS NULL OR v_promo.used_count < v_promo.max_uses)
           AND (v_dynamic_price + v_vat_amount) >= v_promo.min_order_amount
        THEN
            v_promo_id := v_promo.id;
            v_discount_amount := CASE
                WHEN v_promo.discount_type = 'percentage' THEN
                    LEAST(ROUND(v_dynamic_price * (v_promo.discount_value / 100.0), 2), COALESCE(v_promo.max_discount_amount, v_dynamic_price))
                ELSE LEAST(v_promo.discount_value, v_dynamic_price)
            END;
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    v_final_price := GREATEST(v_dynamic_price + v_vat_amount - v_discount_amount, 0);
    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '2 hours';

    IF p_payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        IF v_wallet_id IS NULL THEN
            RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
        END IF;

        v_reference := 'ORD-' || gen_random_uuid()::TEXT;
        PERFORM debit_wallet(v_wallet_id, v_final_price, 'debit', v_reference, 'Payment for delivery order');
    END IF;

    INSERT INTO orders (
        customer_id, status,
        pickup_address, pickup_location, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_location, dropoff_contact_name, dropoff_contact_phone,
        category_id, package_size, package_description, package_notes,
        distance_km, dynamic_price, suggested_price, final_price, vat_amount,
        platform_commission_rate, platform_commission_amount,
        fleet_commission_rate, fleet_commission_amount, rider_net_amount,
        promo_code_id, discount_amount,
        payment_method, delivery_code, expires_at, service_area_id
    )
    VALUES (
        p_customer_id, 'pending',
        p_pickup_address, v_pickup_point, p_pickup_contact_name, p_pickup_contact_phone,
        p_dropoff_address, v_dropoff_point, p_dropoff_contact_name, p_dropoff_contact_phone,
        p_category_id, p_package_size::package_size, p_package_description, p_package_notes,
        v_distance_km, v_dynamic_price, v_effective_suggested_price, v_final_price, v_vat_amount,
        v_platform_commission_rate, v_platform_commission_amount,
        0, 0, v_final_price - v_platform_commission_amount,
        v_promo_id, v_discount_amount,
        p_payment_method, v_delivery_code, v_expires_at, p_service_area_id
    )
    RETURNING id INTO v_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order_id, NULL, 'pending', p_customer_id);

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        p_customer_id,
        'delivery_code',
        'Order Created - Save Your Code',
        'Your order is placed. Keep your delivery code safe - share it only when the rider is with you.',
        jsonb_build_object('order_id', v_order_id, 'code', v_delivery_code)
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'distance_km', v_distance_km,
        'dynamic_price', v_dynamic_price,
        'suggested_price', v_effective_suggested_price,
        'final_price', v_final_price,
        'vat_amount', v_vat_amount,
        'discount_amount', v_discount_amount,
        'delivery_code', v_delivery_code,
        'expires_at', v_expires_at,
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, text, text, text, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, text, text, text, numeric, text, uuid, text) TO service_role;
