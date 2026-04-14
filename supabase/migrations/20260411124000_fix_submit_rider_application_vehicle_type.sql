-- submit_rider_application accepts vehicle type as text from the app, while
-- riders.vehicle_type is the public.vehicle_type enum. Cast at the RPC boundary.

create or replace function public.submit_rider_application(
    p_full_name text,
    p_email text default null::text,
    p_vehicle_type text default null::text,
    p_vehicle_plate text default null::text,
    p_vehicle_make text default null::text,
    p_vehicle_model text default null::text,
    p_vehicle_year integer default null::integer,
    p_vehicle_color text default null::text,
    p_documents jsonb default '[]'::jsonb,
    p_bank_name text default null::text,
    p_bank_code text default null::text,
    p_account_number text default null::text,
    p_account_name text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_user_id uuid;
    v_rider_id uuid;
    v_doc jsonb;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    if p_vehicle_type is null or p_vehicle_type::public.vehicle_type is null then
        raise exception 'Vehicle type is required';
    end if;

    if exists (
        select 1 from profiles
        where id = v_user_id and role in ('rider', 'fleet_manager', 'admin')
    ) then
        raise exception 'Account role cannot be changed via this flow';
    end if;

    update profiles
    set
        full_name  = coalesce(nullif(trim(p_full_name), ''), full_name),
        email      = coalesce(nullif(trim(p_email), ''), email),
        role       = 'rider',
        kyc_status = 'pending'
    where id = v_user_id;

    insert into riders (
        profile_id, vehicle_type, vehicle_plate,
        vehicle_make, vehicle_model, vehicle_year, vehicle_color
    )
    values (
        v_user_id,
        p_vehicle_type::public.vehicle_type,
        p_vehicle_plate,
        p_vehicle_make,
        p_vehicle_model,
        p_vehicle_year,
        p_vehicle_color
    )
    returning id into v_rider_id;

    for v_doc in select * from jsonb_array_elements(p_documents)
    loop
        insert into rider_documents (rider_id, document_type, document_url)
        values (
            v_rider_id,
            (v_doc->>'document_type')::public.document_type,
            v_doc->>'document_url'
        );
    end loop;

    if p_account_number is not null then
        insert into rider_bank_accounts (
            rider_id, bank_name, bank_code, account_number, account_name, is_default
        )
        values (
            v_rider_id,
            p_bank_name,
            coalesce(p_bank_code, ''),
            p_account_number,
            p_account_name,
            true
        );
    end if;

    return jsonb_build_object('rider_id', v_rider_id, 'status', 'pending');
end;
$$;

revoke all on function public.submit_rider_application(text, text, text, text, text, text, integer, text, jsonb, text, text, text, text) from anon;
grant execute on function public.submit_rider_application(text, text, text, text, text, text, integer, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.submit_rider_application(text, text, text, text, text, text, integer, text, jsonb, text, text, text, text) to service_role;
