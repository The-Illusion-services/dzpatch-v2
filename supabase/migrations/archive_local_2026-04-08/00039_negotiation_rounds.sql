-- ============================================================
-- DZpatch V2.0 — Sprint 1: Enforce max 3 negotiation rounds
-- Migration: 00039_negotiation_rounds.sql
--
-- PROBLEM: send_counter_offer has no round limit. Rider and customer
-- can counter indefinitely, causing user fatigue and wasted bandwidth.
-- The product spec says max 3 rounds; nothing enforces it.
--
-- FIX:
-- 1. Add negotiation_round INT column to bids table
-- 2. Patch send_counter_offer: increment round, raise exception at >3
-- 3. Patch place_bid (rider initial bid): always starts at round 1
-- ============================================================

-- ── 1. Add negotiation_round to bids ───────────────────────────
ALTER TABLE bids
    ADD COLUMN IF NOT EXISTS negotiation_round INT NOT NULL DEFAULT 1;

-- Index to quickly find current round for an order
CREATE INDEX IF NOT EXISTS idx_bids_negotiation_round
    ON bids(order_id, negotiation_round);

-- ── 2. Patch send_counter_offer to enforce max 3 rounds ────────
CREATE OR REPLACE FUNCTION send_counter_offer(
    p_bid_id        UUID,
    p_customer_id   UUID,
    p_amount        NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bid              bids%ROWTYPE;
    v_order            orders%ROWTYPE;
    v_new_bid_id       UUID;
    v_rider_profile_id UUID;
    v_current_round    INT;
    v_next_round       INT;
BEGIN
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized: you do not own this order';
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

    -- Determine next round number
    SELECT COALESCE(MAX(negotiation_round), 0) INTO v_current_round
    FROM bids WHERE order_id = v_bid.order_id AND rider_id = v_bid.rider_id;

    v_next_round := v_current_round + 1;

    IF v_next_round > 3 THEN
        RAISE EXCEPTION 'Maximum 3 negotiation rounds reached for this rider. Accept, decline, or find another rider.';
    END IF;

    -- Mark the original bid as countered
    UPDATE bids SET status = 'countered', updated_at = NOW() WHERE id = p_bid_id;

    -- Insert the counter bid with the next round number
    INSERT INTO bids (
        order_id, rider_id, amount, status,
        parent_bid_id, negotiation_round, expires_at
    )
    VALUES (
        v_bid.order_id, v_bid.rider_id, p_amount, 'pending',
        p_bid_id, v_next_round, NOW() + INTERVAL '5 minutes'
    )
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount           = EXCLUDED.amount,
        parent_bid_id    = EXCLUDED.parent_bid_id,
        negotiation_round = EXCLUDED.negotiation_round,
        expires_at       = EXCLUDED.expires_at,
        updated_at       = NOW()
    RETURNING id INTO v_new_bid_id;

    -- Notify rider
    SELECT r.profile_id INTO v_rider_profile_id
    FROM riders r WHERE r.id = v_bid.rider_id;

    IF v_rider_profile_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_rider_profile_id,
            'order_update',
            'Counter Offer — Round ' || v_next_round || '/3',
            CASE
                WHEN v_next_round = 3 THEN 'Final round! Customer countered at ₦' || p_amount::TEXT || '. Accept or decline.'
                ELSE 'Customer countered at ₦' || p_amount::TEXT || '. Round ' || v_next_round || ' of 3.'
            END,
            jsonb_build_object(
                'order_id',          v_bid.order_id,
                'bid_id',            v_new_bid_id,
                'amount',            p_amount,
                'negotiation_round', v_next_round,
                'is_final_round',    (v_next_round = 3)
            )
        );
    END IF;

    RETURN v_new_bid_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_counter_offer(UUID, UUID, NUMERIC) TO authenticated;

-- ── 3. Return negotiation_round in place_bid so frontend can read it ──
-- place_bid already exists with RETURNS UUID. We change it to RETURNS JSONB
-- so the frontend can read negotiation_round from the result.
-- PostgreSQL requires DROP before changing return type.

DROP FUNCTION IF EXISTS place_bid(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION place_bid(
    p_order_id  UUID,
    p_rider_id  UUID,
    p_amount    NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order         orders%ROWTYPE;
    v_rider         riders%ROWTYPE;
    v_bid_id        UUID;
    v_profile_id    UUID;
BEGIN
    -- Validate order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status NOT IN ('pending') THEN
        RAISE EXCEPTION 'Order is not open for bids (status: %)', v_order.status;
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    -- Validate rider
    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF NOT v_rider.is_online THEN RAISE EXCEPTION 'Rider is offline'; END IF;
    IF v_rider.is_commission_locked THEN
        RAISE EXCEPTION 'Your account is locked due to unpaid commissions. Please settle outstanding balance.';
    END IF;
    IF v_rider.kyc_status != 'approved' THEN
        RAISE EXCEPTION 'Rider account is not approved yet';
    END IF;

    IF p_amount <= 0 THEN RAISE EXCEPTION 'Bid amount must be positive'; END IF;

    -- Upsert bid — rider re-bid always resets to round 1 (fresh negotiation thread)
    INSERT INTO bids (order_id, rider_id, amount, status, negotiation_round, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', 1, NOW() + INTERVAL '5 minutes')
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount            = EXCLUDED.amount,
        negotiation_round = 1,
        parent_bid_id     = NULL,
        expires_at        = EXCLUDED.expires_at,
        updated_at        = NOW()
    RETURNING id INTO v_bid_id;

    -- Notify customer
    SELECT profile_id INTO v_profile_id FROM riders WHERE id = p_rider_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'new_bid',
        'New Rider Offer',
        'A rider has offered ₦' || p_amount::TEXT || ' for your delivery.',
        jsonb_build_object(
            'order_id',          p_order_id,
            'bid_id',            v_bid_id,
            'amount',            p_amount,
            'rider_id',          p_rider_id,
            'negotiation_round', 1
        )
    );

    RETURN jsonb_build_object(
        'bid_id',            v_bid_id,
        'order_id',          p_order_id,
        'amount',            p_amount,
        'negotiation_round', 1
    );
END;
$$;

GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, NUMERIC) TO authenticated;
