-- The legacy package_size overload was left with a stale body that references
-- p_payment_method even though that overload has no such argument. Keep the
-- overload for older clients, but route it through the repaired text overload.

create or replace function public.create_order(
    p_customer_id uuid,
    p_pickup_address text,
    p_pickup_lat double precision,
    p_pickup_lng double precision,
    p_pickup_contact_name text default null::text,
    p_pickup_contact_phone text default null::text,
    p_dropoff_address text default null::text,
    p_dropoff_lat double precision default null::double precision,
    p_dropoff_lng double precision default null::double precision,
    p_dropoff_contact_name text default null::text,
    p_dropoff_contact_phone text default null::text,
    p_category_id uuid default null::uuid,
    p_package_size public.package_size default 'small'::public.package_size,
    p_package_description text default null::text,
    p_package_notes text default null::text,
    p_suggested_price numeric default null::numeric,
    p_promo_code text default null::text,
    p_service_area_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    return public.create_order(
        p_customer_id := p_customer_id,
        p_pickup_address := p_pickup_address,
        p_pickup_lat := p_pickup_lat,
        p_pickup_lng := p_pickup_lng,
        p_pickup_contact_name := p_pickup_contact_name,
        p_pickup_contact_phone := p_pickup_contact_phone,
        p_dropoff_address := p_dropoff_address,
        p_dropoff_lat := p_dropoff_lat,
        p_dropoff_lng := p_dropoff_lng,
        p_dropoff_contact_name := p_dropoff_contact_name,
        p_dropoff_contact_phone := p_dropoff_contact_phone,
        p_category_id := p_category_id,
        p_package_size := p_package_size::text,
        p_package_description := p_package_description,
        p_package_notes := p_package_notes,
        p_suggested_price := p_suggested_price,
        p_promo_code := p_promo_code,
        p_service_area_id := p_service_area_id,
        p_payment_method := 'wallet'
    );
end;
$$;

revoke all on function public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, public.package_size, text, text, numeric, text, uuid) from anon;
grant execute on function public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, public.package_size, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.create_order(uuid, text, double precision, double precision, text, text, text, double precision, double precision, text, text, uuid, public.package_size, text, text, numeric, text, uuid) to service_role;
