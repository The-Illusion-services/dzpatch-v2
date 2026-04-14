-- Direct rider acceptance for the plain "Accept" action.
-- Negotiation still uses bids/counter-offers; this function is for accepting
-- the listed price and starting the trip immediately.

create or replace function public.accept_order_direct(
  p_order_id uuid,
  p_rider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order orders%rowtype;
  v_rider riders%rowtype;
  v_profile profiles%rowtype;
  v_price numeric;
  v_platform_commission numeric;
  v_fleet_commission numeric := 0;
  v_fleet_commission_rate numeric := 0;
  v_rider_net numeric;
  v_partner_delivery partner_deliveries%rowtype;
  v_is_partner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status != 'pending' then
    raise exception 'Order is not available for direct acceptance (status: %)', v_order.status;
  end if;

  if v_order.rider_id is not null then
    raise exception 'Order already has an assigned rider';
  end if;

  if v_order.expires_at is not null and v_order.expires_at < now() then
    raise exception 'Order has expired';
  end if;

  select * into v_rider
  from public.riders
  where id = p_rider_id;

  if not found then
    raise exception 'Rider not found';
  end if;

  if v_rider.profile_id != auth.uid() then
    raise exception 'Unauthorized rider';
  end if;

  if not v_rider.is_online then
    raise exception 'Rider must be online to accept orders';
  end if;

  if coalesce(v_rider.is_commission_locked, false) then
    raise exception 'Rider is commission-locked. Please settle outstanding commission.';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_rider.profile_id;

  if not found then
    raise exception 'Rider profile not found';
  end if;

  if coalesce(v_profile.kyc_status, 'not_submitted'::public.kyc_status) != 'approved'::public.kyc_status then
    raise exception 'Rider KYC must be approved before accepting orders';
  end if;

  select * into v_partner_delivery
  from public.partner_deliveries
  where dzpatch_order_id = p_order_id
  limit 1;

  v_is_partner := found;

  v_price := coalesce(v_order.suggested_price, v_order.dynamic_price, v_order.final_price);
  if v_price is null or v_price <= 0 then
    raise exception 'No valid price available for this order';
  end if;

  v_platform_commission := round(
    v_price * (coalesce(v_order.platform_commission_rate, 15.0) / 100.0),
    2
  );

  if v_rider.fleet_id is not null then
    select commission_rate into v_fleet_commission_rate
    from public.fleets
    where id = v_rider.fleet_id;

    v_fleet_commission := round(
      (v_price - v_platform_commission) * (coalesce(v_fleet_commission_rate, 0) / 100.0),
      2
    );
  end if;

  v_rider_net := v_price - v_platform_commission - v_fleet_commission;

  update public.bids
  set status = 'expired',
      updated_at = now()
  where order_id = p_order_id
    and status in ('pending', 'countered');

  update public.orders
  set status = 'matched',
      rider_id = p_rider_id,
      final_price = v_price,
      platform_commission_amount = v_platform_commission,
      fleet_commission_rate = coalesce(v_fleet_commission_rate, 0),
      fleet_commission_amount = v_fleet_commission,
      rider_net_amount = v_rider_net,
      matched_at = now(),
      updated_at = now()
  where id = p_order_id;

  insert into public.order_status_history (order_id, old_status, new_status, changed_by, reason, metadata)
  values (
    p_order_id,
    'pending',
    'matched',
    v_rider.profile_id,
    case when v_is_partner then 'Partner delivery accepted directly by rider' else 'Order accepted directly by rider' end,
    jsonb_build_object(
      'rider_id', p_rider_id,
      'direct_accept', true,
      'source_type', case when v_is_partner then 'partner' else 'customer' end
    )
  );

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_order.customer_id,
    'order_update',
    'Rider assigned',
    'A rider accepted your delivery and is heading to pickup.',
    jsonb_build_object('order_id', p_order_id, 'rider_id', p_rider_id)
  );

  -- Partner delivery status/webhook enqueue is handled by the existing
  -- orders AFTER UPDATE trigger when status/rider_id changes.

  return jsonb_build_object(
    'order_id', p_order_id,
    'rider_id', p_rider_id,
    'status', 'matched',
    'final_price', v_price,
    'platform_commission', v_platform_commission,
    'fleet_commission', v_fleet_commission,
    'rider_net', v_rider_net,
    'source_type', case when v_is_partner then 'partner' else 'customer' end
  );
end;
$$;

revoke all on function public.accept_order_direct(uuid, uuid) from anon;
grant execute on function public.accept_order_direct(uuid, uuid) to authenticated;
grant execute on function public.accept_order_direct(uuid, uuid) to service_role;

drop function if exists public.get_nearby_orders(uuid, double precision);

create or replace function public.get_nearby_orders(
    p_rider_id uuid,
    p_radius_meters double precision default 10000
)
returns table(
    order_id uuid,
    pickup_address text,
    dropoff_address text,
    distance_to_pickup double precision,
    dynamic_price numeric,
    suggested_price numeric,
    package_size public.package_size,
    package_description text,
    category_name text,
    created_at timestamp with time zone,
    expires_at timestamp with time zone,
    pickup_lat double precision,
    pickup_lng double precision,
    source_type text,
    partner_name text,
    pickup_brand_name text,
    is_negotiable boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_rider_location geography;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not exists (select 1 from public.riders where id = p_rider_id and profile_id = auth.uid()) then
        raise exception 'Unauthorized: rider ID does not match session';
    end if;

    select current_location into v_rider_location
    from public.riders
    where id = p_rider_id;

    return query
    select
        o.id,
        o.pickup_address,
        o.dropoff_address,
        case
            when v_rider_location is not null and o.pickup_location is not null
            then st_distance(v_rider_location, o.pickup_location)::double precision
            else null::double precision
        end,
        o.dynamic_price,
        o.suggested_price,
        o.package_size,
        o.package_description,
        pc.name,
        o.created_at,
        o.expires_at,
        case when o.pickup_location is not null then st_y(o.pickup_location::geometry) end,
        case when o.pickup_location is not null then st_x(o.pickup_location::geometry) end,
        case when pd.id is not null then 'partner' else 'customer' end,
        pa.name,
        coalesce(pd.request_payload->'pickup'->>'name', o.pickup_contact_name),
        pd.id is null
    from public.orders o
    left join public.package_categories pc on pc.id = o.category_id
    left join public.partner_deliveries pd on pd.dzpatch_order_id = o.id
    left join public.partner_accounts pa on pa.id = pd.partner_account_id
    where o.status = 'pending'
        and (o.expires_at is null or o.expires_at > now())
        and (
            v_rider_location is null
            or o.pickup_location is null
            or st_dwithin(v_rider_location, o.pickup_location, p_radius_meters)
        )
    order by
        case
            when v_rider_location is not null and o.pickup_location is not null then st_distance(v_rider_location, o.pickup_location)
            else 999999
        end asc,
        o.created_at desc
    limit 20;
end;
$$;

revoke all on function public.get_nearby_orders(uuid, double precision) from anon;
grant execute on function public.get_nearby_orders(uuid, double precision) to authenticated;
grant execute on function public.get_nearby_orders(uuid, double precision) to service_role;

create or replace function public.get_order_partner_context(p_order_id uuid)
returns table(
  source_type text,
  partner_name text,
  pickup_brand_name text,
  is_negotiable boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.orders o
    left join public.riders r on r.id = o.rider_id
    where o.id = p_order_id
      and (
        o.status = 'pending'
        or o.customer_id = auth.uid()
        or r.profile_id = auth.uid()
        or exists (
          select 1
          from public.riders requester
          where requester.profile_id = auth.uid()
        )
      )
  ) then
    raise exception 'Order not available';
  end if;

  return query
  select
    case when pd.id is not null then 'partner' else 'customer' end,
    pa.name,
    coalesce(pd.request_payload->'pickup'->>'name', o.pickup_contact_name),
    pd.id is null
  from public.orders o
  left join public.partner_deliveries pd on pd.dzpatch_order_id = o.id
  left join public.partner_accounts pa on pa.id = pd.partner_account_id
  where o.id = p_order_id;
end;
$$;

revoke all on function public.get_order_partner_context(uuid) from anon;
grant execute on function public.get_order_partner_context(uuid) to authenticated;
grant execute on function public.get_order_partner_context(uuid) to service_role;
