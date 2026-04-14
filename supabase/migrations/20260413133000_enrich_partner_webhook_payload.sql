-- Enrich partner webhook payloads so Foodhunt can update courier snapshots,
-- delivery codes, and customer-facing delivery status from Dzpatch events.

create or replace function public.enqueue_partner_delivery_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_partner_delivery public.partner_deliveries%rowtype;
  v_account public.partner_accounts%rowtype;
  v_rider public.riders%rowtype;
  v_rider_profile public.profiles%rowtype;
  v_partner_status text;
  v_sequence bigint;
  v_event_id text;
  v_payload jsonb;
  v_courier jsonb := null;
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

  if new.rider_id is not null then
    select * into v_rider
    from public.riders
    where id = new.rider_id;

    if found then
      select * into v_rider_profile
      from public.profiles
      where id = v_rider.profile_id;

      v_courier := jsonb_build_object(
        'id', v_rider.id,
        'name', coalesce(v_rider_profile.full_name, 'Dzpatch Rider'),
        'phone_number', v_rider_profile.phone,
        'vehicle_type', v_rider.vehicle_type,
        'plate_number', v_rider.plate_number
      );
    end if;
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
    'courier', v_courier,
    'delivery', jsonb_build_object(
      'delivery_id', v_partner_delivery.id,
      'external_order_id', v_partner_delivery.external_order_id,
      'status', v_partner_status,
      'tracking_url', 'https://dzpatch.app/track/' || v_partner_delivery.id::text,
      'delivery_code', v_partner_delivery.delivery_code,
      'delivery_code_status', v_partner_delivery.delivery_code_status,
      'rider', v_courier,
      'pickup', v_partner_delivery.request_payload->'pickup',
      'dropoff', v_partner_delivery.request_payload->'dropoff',
      'items_summary', v_partner_delivery.request_payload->>'items_summary'
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
