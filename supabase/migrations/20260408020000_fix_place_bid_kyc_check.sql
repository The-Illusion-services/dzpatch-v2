-- Fix place_bid: the sprint2 migration declared v_rider_profile but never
-- populated it before reading kyc_status, causing "record has no field kyc_status".
-- kyc_status is correctly on profiles — just need to SELECT it properly.

CREATE OR REPLACE FUNCTION public.place_bid(
    p_order_id uuid,
    p_rider_id uuid,
    p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order   orders%ROWTYPE;
    v_rider   riders%ROWTYPE;
    v_profile profiles%ROWTYPE;
    v_bid_id  uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is not accepting bids (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Bid amount must be positive'; END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF v_rider.profile_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized rider'; END IF;
    IF NOT v_rider.is_online THEN RAISE EXCEPTION 'Rider must be online to place bids'; END IF;
    IF COALESCE(v_rider.is_commission_locked, FALSE) THEN
        RAISE EXCEPTION 'Rider is commission-locked. Please settle outstanding commission.';
    END IF;

    -- kyc_status is on profiles, not riders
    SELECT * INTO v_profile FROM profiles WHERE id = v_rider.profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider profile not found'; END IF;
    IF COALESCE(v_profile.kyc_status, 'not_submitted'::kyc_status) != 'approved'::kyc_status THEN
        RAISE EXCEPTION 'Rider KYC must be approved before bidding';
    END IF;

    INSERT INTO bids (order_id, rider_id, amount, status, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', NOW() + INTERVAL '15 minutes')
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount = EXCLUDED.amount,
        parent_bid_id = NULL,
        negotiation_round = 1,
        expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    RETURNING id INTO v_bid_id;

    RETURN v_bid_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.place_bid(uuid, uuid, numeric) TO authenticated;
