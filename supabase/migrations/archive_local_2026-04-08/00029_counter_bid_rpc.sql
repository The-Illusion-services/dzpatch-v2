-- ============================================================
-- DZpatch V2.0 — send_counter_offer RPC
-- Migration: 00029_counter_bid_rpc.sql
--
-- PROBLEM 1: bids table has no parent_bid_id column, which the
-- customer app (counter-offer.tsx) tries to insert.
--
-- PROBLEM 2: No counter_bid / send_counter_offer RPC exists.
-- The customer app does raw .update() + .insert() on the bids
-- table, but bids has no INSERT or UPDATE RLS policies for
-- customers. All mutations must go through SECURITY DEFINER RPCs.
--
-- PROBLEM 3: The customer app violates the partial unique index
-- idx_bids_one_pending_per_rider when trying to insert a new
-- counter bid while the original bid still exists for the same
-- (order_id, rider_id) pair.
--
-- FIX:
--   1. Add parent_bid_id column to bids (nullable FK to bids.id)
--   2. Create send_counter_offer RPC that:
--      - Validates customer owns the order
--      - Marks the original bid as 'countered'
--      - Upserts the counter bid using the correct partial index syntax
--      - Notifies the rider
-- ============================================================

-- ── 1. Add parent_bid_id column ───────────────────────────────
ALTER TABLE bids
    ADD COLUMN IF NOT EXISTS parent_bid_id UUID REFERENCES bids(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bids_parent_bid_id
    ON bids(parent_bid_id)
    WHERE parent_bid_id IS NOT NULL;

-- ── 2. Create send_counter_offer RPC ─────────────────────────
CREATE OR REPLACE FUNCTION send_counter_offer(
    p_bid_id        UUID,
    p_customer_id   UUID,
    p_amount        NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bid           bids%ROWTYPE;
    v_order         orders%ROWTYPE;
    v_new_bid_id    UUID;
    v_rider_profile_id UUID;
BEGIN
    -- Lock and fetch the bid
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;

    -- Verify customer owns the order
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

    -- Mark the original bid as countered
    UPDATE bids SET status = 'countered', updated_at = NOW() WHERE id = p_bid_id;

    -- Upsert the counter bid.
    -- Uses partial index inference (order_id, rider_id) WHERE status = 'pending'
    -- so that if this rider somehow already has a new pending bid, we update it.
    INSERT INTO bids (
        order_id, rider_id, amount, status,
        parent_bid_id, expires_at
    )
    VALUES (
        v_bid.order_id, v_bid.rider_id, p_amount, 'pending',
        p_bid_id, NOW() + INTERVAL '5 minutes'
    )
    ON CONFLICT (order_id, rider_id) WHERE status = 'pending'
    DO UPDATE SET
        amount        = EXCLUDED.amount,
        parent_bid_id = EXCLUDED.parent_bid_id,
        expires_at    = EXCLUDED.expires_at,
        updated_at    = NOW()
    RETURNING id INTO v_new_bid_id;

    -- Notify the rider
    SELECT r.profile_id INTO v_rider_profile_id
    FROM riders r WHERE r.id = v_bid.rider_id;

    IF v_rider_profile_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_rider_profile_id,
            'order_update',
            'Counter Offer',
            'The customer has sent a counter offer on your bid.',
            jsonb_build_object(
                'order_id',  v_bid.order_id,
                'bid_id',    v_new_bid_id,
                'amount',    p_amount
            )
        );
    END IF;

    RETURN v_new_bid_id;
END;
$$;
