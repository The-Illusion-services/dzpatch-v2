-- Extend bid expiry window from 5 minutes to 15 minutes.
-- The 5-min window was too short: customers often miss bids before they expire.

DROP FUNCTION IF EXISTS public.place_bid(uuid, uuid, numeric);
CREATE OR REPLACE FUNCTION public.place_bid(p_order_id uuid, p_rider_id uuid, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_bid_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is not accepting bids (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bid amount must be positive';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF v_rider.profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized rider';
    END IF;
    IF NOT v_rider.is_online THEN
        RAISE EXCEPTION 'Rider must be online to place bids';
    END IF;

    INSERT INTO bids (order_id, rider_id, amount, status, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', NOW() + INTERVAL '15 minutes')
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount = EXCLUDED.amount,
        expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    RETURNING id INTO v_bid_id;

    RETURN v_bid_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.place_bid(uuid, uuid, numeric) TO authenticated;

-- Also extend the counter-offer bid window (send_rider_counter_offer RPC)
CREATE OR REPLACE FUNCTION public.send_rider_counter_offer(p_bid_id uuid, p_rider_id uuid, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bid bids%ROWTYPE;
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_new_bid_id UUID;
    v_current_round INT;
    v_next_round INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;
    IF v_bid.parent_bid_id IS NULL THEN
        RAISE EXCEPTION 'This bid is not a customer counter-offer';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting counter-offers (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Counter amount must be positive';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF v_bid.rider_id != p_rider_id OR v_rider.profile_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized rider';
    END IF;

    SELECT COALESCE(MAX(negotiation_round), 0) INTO v_current_round
    FROM bids
    WHERE order_id = v_bid.order_id
      AND rider_id = v_bid.rider_id;

    v_next_round := v_current_round + 1;

    IF v_next_round > 3 THEN
        RAISE EXCEPTION 'Maximum 3 negotiation rounds reached for this rider. Accept or decline the current offer.';
    END IF;

    UPDATE bids
    SET status = 'countered',
        updated_at = NOW()
    WHERE id = p_bid_id;

    INSERT INTO bids (
        order_id, rider_id, amount, status,
        parent_bid_id, negotiation_round, expires_at
    )
    VALUES (
        v_bid.order_id, v_bid.rider_id, p_amount, 'pending',
        p_bid_id, v_next_round, NOW() + INTERVAL '15 minutes'
    )
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount = EXCLUDED.amount,
        parent_bid_id = EXCLUDED.parent_bid_id,
        negotiation_round = EXCLUDED.negotiation_round,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING id INTO v_new_bid_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Rider Counter-Offer - Round ' || v_next_round || '/3',
        CASE
            WHEN v_next_round = 3 THEN 'Final round. Rider countered at N' || p_amount::TEXT || '.'
            ELSE 'Rider countered at N' || p_amount::TEXT || '.'
        END,
        jsonb_build_object(
            'order_id', v_bid.order_id,
            'bid_id', v_new_bid_id,
            'amount', p_amount,
            'negotiation_round', v_next_round,
            'is_final_round', (v_next_round = 3)
        )
    );

    RETURN v_new_bid_id;
END;
$function$;

GRANT ALL ON FUNCTION public.send_rider_counter_offer(uuid, uuid, numeric) TO anon;
GRANT ALL ON FUNCTION public.send_rider_counter_offer(uuid, uuid, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.send_rider_counter_offer(uuid, uuid, numeric) TO service_role;
