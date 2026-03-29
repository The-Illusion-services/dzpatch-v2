-- Migration 00033: Fix get_nearby_orders when pickup_location is NULL
--
-- PROBLEM: get_nearby_orders uses ST_DWithin which silently excludes rows
-- where o.pickup_location IS NULL. Test orders created without geocoded
-- pickup coords never appear in the rider feed.
--
-- FIX: When pickup_location is NULL, include the order anyway (it will
-- appear with distance_to_pickup = NULL) so the rider can see it.
-- Orders without location data sort last.

CREATE OR REPLACE FUNCTION get_nearby_orders(
    p_rider_id UUID,
    p_radius_meters FLOAT DEFAULT 10000
)
RETURNS TABLE (
    order_id UUID,
    customer_name TEXT,
    pickup_address TEXT,
    dropoff_address TEXT,
    distance_to_pickup FLOAT,
    dynamic_price NUMERIC,
    suggested_price NUMERIC,
    package_size package_size,
    package_description TEXT,
    category_name TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rider_location GEOGRAPHY;
BEGIN
    SELECT current_location INTO v_rider_location
    FROM riders WHERE id = p_rider_id;

    -- If rider location unavailable, return all pending orders unfiltered
    IF v_rider_location IS NULL THEN
        RETURN QUERY
        SELECT
            o.id,
            p.full_name,
            o.pickup_address,
            o.dropoff_address,
            NULL::FLOAT,
            o.dynamic_price,
            o.suggested_price,
            o.package_size,
            o.package_description,
            pc.name,
            o.created_at,
            o.expires_at
        FROM orders o
        JOIN profiles p ON p.id = o.customer_id
        LEFT JOIN package_categories pc ON pc.id = o.category_id
        WHERE o.status = 'pending'
            AND (o.expires_at IS NULL OR o.expires_at > NOW())
        ORDER BY o.created_at DESC
        LIMIT 20;
        RETURN;
    END IF;

    -- Rider location available — prefer nearby orders, fall back to all pending
    RETURN QUERY
    SELECT
        o.id,
        p.full_name,
        o.pickup_address,
        o.dropoff_address,
        CASE
            WHEN o.pickup_location IS NOT NULL
            THEN ST_Distance(v_rider_location, o.pickup_location)::FLOAT
            ELSE NULL
        END,
        o.dynamic_price,
        o.suggested_price,
        o.package_size,
        o.package_description,
        pc.name,
        o.created_at,
        o.expires_at
    FROM orders o
    JOIN profiles p ON p.id = o.customer_id
    LEFT JOIN package_categories pc ON pc.id = o.category_id
    WHERE o.status = 'pending'
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
        AND (
            o.pickup_location IS NULL  -- always include orders without location
            OR ST_DWithin(v_rider_location, o.pickup_location, p_radius_meters)
        )
    ORDER BY
        CASE WHEN o.pickup_location IS NOT NULL
             THEN ST_Distance(v_rider_location, o.pickup_location)
             ELSE 999999 END ASC,
        o.created_at DESC
    LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_orders(UUID, FLOAT) TO authenticated;
