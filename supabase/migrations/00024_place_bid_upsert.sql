-- ============================================================
-- DZpatch V2.0 — place_bid: upsert instead of insert
-- Migration: 00024_place_bid_upsert.sql
--
-- If a rider already has a pending bid on the same order,
-- update the amount instead of throwing a duplicate key error.
-- ============================================================

CREATE OR REPLACE FUNCTION place_bid(
    p_order_id UUID,
    p_rider_id UUID,
    p_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bid_id UUID;
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_customer_profile_id UUID;
BEGIN
    -- Validate order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting bids (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    -- Validate rider
    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF NOT v_rider.is_approved THEN
        RAISE EXCEPTION 'Rider is not approved for deliveries';
    END IF;
    IF NOT v_rider.is_online THEN
        RAISE EXCEPTION 'Rider must be online to place bids';
    END IF;
    IF v_rider.is_commission_locked THEN
        RAISE EXCEPTION 'Rider is commission-locked. Please settle outstanding commission.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bid amount must be positive';
    END IF;

    -- Upsert: update amount if pending bid exists, else insert
    INSERT INTO bids (order_id, rider_id, amount, status, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', NOW() + INTERVAL '2 minutes')
    ON CONFLICT ON CONSTRAINT idx_bids_one_pending_per_rider
    DO UPDATE SET amount = EXCLUDED.amount, expires_at = NOW() + INTERVAL '2 minutes'
    RETURNING id INTO v_bid_id;

    -- Notify customer of new/updated bid
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'New Rider Offer',
        'A rider has placed a bid on your delivery.',
        jsonb_build_object('order_id', p_order_id, 'bid_id', v_bid_id)
    )
    ON CONFLICT DO NOTHING;

    RETURN v_bid_id;
END;
$$;
