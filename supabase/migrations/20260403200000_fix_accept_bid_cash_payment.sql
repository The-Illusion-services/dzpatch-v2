-- Fix accept_bid RPC: skip wallet credit/debit for cash payment orders
-- Cash orders have no upfront wallet debit, so no refund/charge needed on accept

CREATE OR REPLACE FUNCTION "public"."accept_bid"("p_bid_id" "uuid", "p_customer_id" "uuid")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
    v_bid bids%ROWTYPE;
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
    v_rider_profile_id UUID;
    v_price_diff NUMERIC;
    v_wallet_id UUID;
    v_new_final_price NUMERIC;
    v_platform_commission NUMERIC;
    v_fleet_commission NUMERIC := 0;
    v_fleet_commission_rate NUMERIC := 0;
    v_rider_net NUMERIC;
BEGIN
    -- Lock and validate bid
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;

    -- Lock and validate order
    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Only the order customer can accept bids';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting bids';
    END IF;

    -- Get rider info
    SELECT * INTO v_rider FROM riders WHERE id = v_bid.rider_id;
    SELECT id INTO v_rider_profile_id FROM profiles WHERE id = v_rider.profile_id;

    -- Calculate new final price (bid amount + VAT)
    v_new_final_price := v_bid.amount + COALESCE(v_order.vat_amount, 0);

    -- Only do wallet adjustments for wallet-payment orders
    IF v_order.payment_method = 'wallet' THEN
        v_price_diff := v_order.final_price - v_new_final_price;

        IF v_price_diff > 0 THEN
            -- Bid was lower than original price — refund difference to customer
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = p_customer_id;

            PERFORM credit_wallet(
                v_wallet_id,
                v_price_diff,
                'refund',
                'BID-REFUND-' || p_bid_id::TEXT,
                'Refund: accepted bid lower than original price',
                v_order.id
            );
        ELSIF v_price_diff < 0 THEN
            -- Bid was higher — charge the extra
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = p_customer_id;

            PERFORM debit_wallet(
                v_wallet_id,
                ABS(v_price_diff),
                'debit',
                'BID-CHARGE-' || p_bid_id::TEXT,
                'Additional charge: accepted bid higher than original price',
                v_order.id
            );
        END IF;
    END IF;
    -- Cash orders: no wallet action needed — rider collects cash at delivery

    -- Recalculate commission with new price
    v_platform_commission := ROUND(v_new_final_price * (COALESCE(v_order.platform_commission_rate, 10) / 100.0), 2);

    -- Check if rider is in a fleet
    IF v_rider.fleet_id IS NOT NULL THEN
        SELECT commission_rate INTO v_fleet_commission_rate
        FROM fleets WHERE id = v_rider.fleet_id;

        v_fleet_commission := ROUND(
            (v_new_final_price - v_platform_commission) * (COALESCE(v_fleet_commission_rate, 0) / 100.0),
            2
        );
    END IF;

    v_rider_net := v_new_final_price - v_platform_commission - v_fleet_commission;

    -- Accept the bid
    UPDATE bids SET status = 'accepted' WHERE id = p_bid_id;

    -- Expire all other pending bids for this order
    UPDATE bids SET status = 'expired'
    WHERE order_id = v_order.id AND id != p_bid_id AND status = 'pending';

    -- Update order to matched
    UPDATE orders SET
        status = 'matched',
        rider_id = v_bid.rider_id,
        final_price = v_new_final_price,
        platform_commission_amount = v_platform_commission,
        fleet_commission_rate = v_fleet_commission_rate,
        fleet_commission_amount = v_fleet_commission,
        rider_net_amount = v_rider_net,
        matched_at = NOW()
    WHERE id = v_order.id;

    -- Record status change
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order.id, 'pending', 'matched', p_customer_id);

    -- Notify rider
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_rider_profile_id,
        'order_update',
        'Bid Accepted!',
        'Your offer of ₦' || v_bid.amount::TEXT || ' was accepted. Head to pickup.',
        jsonb_build_object('order_id', v_order.id)
    );

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'rider_id', v_bid.rider_id,
        'final_price', v_new_final_price,
        'platform_commission', v_platform_commission,
        'fleet_commission', v_fleet_commission,
        'rider_net', v_rider_net
    );
END;
$$;
