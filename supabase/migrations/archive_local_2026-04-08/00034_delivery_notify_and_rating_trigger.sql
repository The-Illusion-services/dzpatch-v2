-- Migration 00034: complete_delivery customer notification + average_rating trigger
--
-- FIX 1: complete_delivery RPC never notified the customer that their order
--         was delivered. Add a notification INSERT at the end of the function.
--
-- FIX 2: riders.average_rating is never updated when a new rating is inserted.
--         Add a trigger that recalculates the average on INSERT into ratings.

-- ── 1. Patch complete_delivery to notify customer ──────────────────────────

CREATE OR REPLACE FUNCTION complete_delivery(
    p_order_id      UUID,
    p_rider_id      UUID,
    p_pod_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order             orders%ROWTYPE;
    v_rider             riders%ROWTYPE;
    v_commission_rate   NUMERIC;
    v_commission        NUMERIC;
    v_rider_earnings    NUMERIC;
    v_rider_wallet      UUID;
    v_platform_wallet   UUID;
    v_unpaid_count      INT;
BEGIN
    -- Lock + validate order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;

    -- Validate rider is assigned
    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;

    -- Commission calculation
    v_commission_rate := COALESCE(v_rider.commission_rate, 0.10);
    v_commission      := ROUND(COALESCE(v_order.final_price, 0) * v_commission_rate, 2);
    v_rider_earnings  := COALESCE(v_order.final_price, 0) - v_commission;

    -- Update order to delivered
    UPDATE orders SET
        status        = 'delivered',
        pod_photo_url = COALESCE(p_pod_photo_url, pod_photo_url),
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    -- Credit rider wallet (for wallet-paid orders only; cash is paid directly)
    IF v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_rider_wallet FROM wallets
        WHERE owner_type = 'rider' AND owner_id = p_rider_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet,
                v_rider_earnings,
                'earning',
                'EARN-' || p_order_id::TEXT,
                'Delivery earnings',
                p_order_id
            );
        END IF;

        -- Commission to platform
        SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
        IF v_platform_wallet IS NOT NULL AND v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet,
                v_commission,
                'commission',
                'COMM-' || p_order_id::TEXT,
                'Platform commission',
                p_order_id
            );
        END IF;
    END IF;

    -- Check commission lock: count unpaid commissions >= threshold
    SELECT COUNT(*) INTO v_unpaid_count
    FROM orders
    WHERE rider_id = p_rider_id
      AND status = 'delivered'
      AND id NOT IN (
          SELECT DISTINCT reference::UUID
          FROM transactions
          WHERE owner_id = p_rider_id
            AND type = 'commission'
          LIMIT 1000
      );
    IF v_unpaid_count >= 2 THEN
        UPDATE riders SET is_commission_locked = TRUE WHERE id = p_rider_id;
    END IF;

    -- Notify customer their delivery is complete
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Order Delivered!',
        'Your package has been delivered successfully.',
        jsonb_build_object('order_id', p_order_id)
    );

    RETURN jsonb_build_object(
        'rider_earnings', v_rider_earnings,
        'commission',     v_commission,
        'final_price',    v_order.final_price
    );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery(UUID, UUID, TEXT) TO authenticated;

-- ── 2. Trigger: update riders.average_rating on new rating ────────────────

CREATE OR REPLACE FUNCTION update_rider_average_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE riders
    SET average_rating = (
        SELECT ROUND(AVG(score)::NUMERIC, 2)
        FROM ratings
        WHERE rider_id = NEW.rider_id
    )
    WHERE id = NEW.rider_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_rider_rating ON ratings;
CREATE TRIGGER trg_update_rider_rating
    AFTER INSERT OR UPDATE ON ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_rider_average_rating();
