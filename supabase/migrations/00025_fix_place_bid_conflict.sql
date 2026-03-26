-- ============================================================
-- DZpatch V2.0 — Fix place_bid ON CONFLICT syntax
-- Migration: 00025_fix_place_bid_conflict.sql
--
-- PROBLEM: 00024 used ON CONFLICT ON CONSTRAINT idx_bids_one_pending_per_rider
-- idx_bids_one_pending_per_rider is a PARTIAL UNIQUE INDEX, not a named
-- constraint. PostgreSQL only supports ON CONFLICT ON CONSTRAINT for named
-- table constraints (PRIMARY KEY, UNIQUE CONSTRAINT). For partial indexes
-- the column inference syntax must be used instead:
--
--   ON CONFLICT (col1, col2) WHERE <partial_index_predicate>
--
-- IMPACT: The previous version crashed on every execution.
-- The rider app (job-details.tsx) silently swallowed the error because
-- the Postgres error message contained 'idx_bids_one_pending_per_rider',
-- causing riders to believe their bid succeeded when no row was inserted.
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
BEGIN
    -- Validate order (lock row to prevent race conditions)
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

    -- FIXED: Use column inference syntax for partial index (not ON CONSTRAINT).
    -- idx_bids_one_pending_per_rider is defined as:
    --   UNIQUE (order_id, rider_id) WHERE status = 'pending'
    -- So the correct ON CONFLICT clause mirrors that predicate exactly.
    INSERT INTO bids (order_id, rider_id, amount, status, expires_at)
    VALUES (p_order_id, p_rider_id, p_amount, 'pending', NOW() + INTERVAL '2 minutes')
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount     = EXCLUDED.amount,
        expires_at = NOW() + INTERVAL '2 minutes',
        updated_at = NOW()
    RETURNING id INTO v_bid_id;

    -- Notify customer of new/updated bid (idempotent)
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