-- ============================================================
-- DZpatch V2.0 — Fix place_bid to clear parent_bid_id on upsert
-- Migration: 00035_fix_place_bid_clears_parent.sql
--
-- Only change from 00025: parent_bid_id = NULL added to DO UPDATE SET
-- so rider re-bids over customer counters are correctly detected.
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
    v_order_status TEXT;
    v_order_expires_at TIMESTAMPTZ;
    v_order_customer_id UUID;
    v_is_approved BOOLEAN;
    v_is_online BOOLEAN;
    v_is_commission_locked BOOLEAN;
BEGIN
    SELECT status, expires_at, customer_id
    INTO v_order_status, v_order_expires_at, v_order_customer_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order_status != 'pending' THEN RAISE EXCEPTION 'Order is no longer accepting bids (status: %)', v_order_status; END IF;
    IF v_order_expires_at IS NOT NULL AND v_order_expires_at < NOW() THEN RAISE EXCEPTION 'Order has expired'; END IF;

    SELECT is_approved, is_online, is_commission_locked
    INTO v_is_approved, v_is_online, v_is_commission_locked
    FROM riders WHERE id = p_rider_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF NOT v_is_approved THEN RAISE EXCEPTION 'Rider is not approved for deliveries'; END IF;
    IF NOT v_is_online THEN RAISE EXCEPTION 'Rider must be online to place bids'; END IF;
    IF v_is_commission_locked THEN RAISE EXCEPTION 'Rider is commission-locked. Please settle outstanding commission.'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Bid amount must be positive'; END IF;

    INSERT INTO bids (order_id, rider_id, amount, status, parent_bid_id, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', NULL, NOW() + INTERVAL '5 minutes')
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount        = EXCLUDED.amount,
        parent_bid_id = NULL,
        expires_at    = NOW() + INTERVAL '5 minutes',
        updated_at    = NOW()
    RETURNING id INTO v_bid_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order_customer_id,
        'order_update',
        'New Rider Offer',
        'A rider has placed a bid on your delivery.',
        jsonb_build_object('order_id', p_order_id, 'bid_id', v_bid_id)
    )
    ON CONFLICT DO NOTHING;

    RETURN v_bid_id;
END;
$$;
