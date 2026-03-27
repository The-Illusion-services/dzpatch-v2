-- Migration 00031: withdraw_bid RPC
-- Allows a rider to withdraw their pending bid (replaces broken raw UPDATE in frontend).
-- Sets bid status to 'rejected', notifies customer if they were viewing bids.

CREATE OR REPLACE FUNCTION withdraw_bid(
    p_bid_id  UUID,
    p_rider_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bid   bids%ROWTYPE;
BEGIN
    -- Lock and fetch the bid
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found.';
    END IF;

    -- Only the owning rider can withdraw
    IF v_bid.rider_id <> p_rider_id THEN
        RAISE EXCEPTION 'Not your bid.';
    END IF;

    -- Can only withdraw pending or countered bids
    IF v_bid.status NOT IN ('pending', 'countered') THEN
        RAISE EXCEPTION 'Bid cannot be withdrawn (status: %).', v_bid.status;
    END IF;

    -- Mark bid as rejected
    UPDATE bids SET status = 'rejected', updated_at = NOW() WHERE id = p_bid_id;

    -- Notify the customer that the bid was withdrawn
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT
        o.customer_id,
        'bid_withdrawn',
        'Rider withdrew their bid',
        'A rider has withdrawn their offer for your delivery.',
        jsonb_build_object('order_id', v_bid.order_id)
    FROM orders o
    WHERE o.id = v_bid.order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_bid(UUID, UUID) TO authenticated;
