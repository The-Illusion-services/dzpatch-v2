--
-- PostgreSQL database dump
--

\restrict An2tlIYvMq24HfJwWkdrsUpg5radeaujnlMvSCIkviLz7B6rWleIBEGCY1nLgTY

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6 (Debian 17.6-2.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: bid_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."bid_status" AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'countered',
    'expired'
);


ALTER TYPE "public"."bid_status" OWNER TO "postgres";

--
-- Name: cancellation_actor; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."cancellation_actor" AS ENUM (
    'customer',
    'rider',
    'system',
    'admin'
);


ALTER TYPE "public"."cancellation_actor" OWNER TO "postgres";

--
-- Name: dispute_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."dispute_status" AS ENUM (
    'open',
    'investigating',
    'resolved',
    'dismissed'
);


ALTER TYPE "public"."dispute_status" OWNER TO "postgres";

--
-- Name: document_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."document_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."document_status" OWNER TO "postgres";

--
-- Name: document_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."document_type" AS ENUM (
    'drivers_license',
    'vehicle_insurance',
    'plate_photo',
    'national_id',
    'other'
);


ALTER TYPE "public"."document_type" OWNER TO "postgres";

--
-- Name: fleet_pay_structure; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."fleet_pay_structure" AS ENUM (
    'percentage',
    'flat_rate'
);


ALTER TYPE "public"."fleet_pay_structure" OWNER TO "postgres";

--
-- Name: kyc_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."kyc_status" AS ENUM (
    'not_submitted',
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."kyc_status" OWNER TO "postgres";

--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."notification_type" AS ENUM (
    'order_update',
    'payment',
    'promo',
    'system',
    'chat',
    'sos',
    'delivery_code',
    'new_bid',
    'bid_withdrawn',
    'delivery_completed',
    'bid_accepted',
    'bid_rejected',
    'counter_offer',
    'order_cancelled'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'matched',
    'pickup_en_route',
    'arrived_pickup',
    'in_transit',
    'arrived_dropoff',
    'delivered',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";

--
-- Name: package_size; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."package_size" AS ENUM (
    'small',
    'medium',
    'large',
    'extra_large'
);


ALTER TYPE "public"."package_size" OWNER TO "postgres";

--
-- Name: promo_discount_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."promo_discount_type" AS ENUM (
    'percentage',
    'flat'
);


ALTER TYPE "public"."promo_discount_type" OWNER TO "postgres";

--
-- Name: sos_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."sos_status" AS ENUM (
    'active',
    'acknowledged',
    'resolved'
);


ALTER TYPE "public"."sos_status" OWNER TO "postgres";

--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."transaction_type" AS ENUM (
    'credit',
    'debit',
    'commission_credit',
    'commission_debit',
    'withdrawal',
    'refund',
    'adjustment'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'rider',
    'fleet_manager',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

--
-- Name: vehicle_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."vehicle_type" AS ENUM (
    'bicycle',
    'motorcycle',
    'car',
    'van',
    'truck'
);


ALTER TYPE "public"."vehicle_type" OWNER TO "postgres";

--
-- Name: wallet_owner_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."wallet_owner_type" AS ENUM (
    'customer',
    'rider',
    'fleet',
    'platform'
);


ALTER TYPE "public"."wallet_owner_type" OWNER TO "postgres";

--
-- Name: withdrawal_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."withdrawal_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'rejected'
);


ALTER TYPE "public"."withdrawal_status" OWNER TO "postgres";

--
-- Name: accept_bid("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."accept_bid"("p_bid_id" "uuid", "p_customer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_bid                 bids%ROWTYPE;
    v_order               orders%ROWTYPE;
    v_rider               riders%ROWTYPE;
    v_rider_profile_id    UUID;
    v_price_diff          NUMERIC;
    v_wallet_id           UUID;
    v_wallet_balance      NUMERIC;
    v_new_final_price     NUMERIC;
    v_platform_commission NUMERIC;
    v_fleet_commission    NUMERIC := 0;
    v_fleet_commission_rate NUMERIC := 0;
    v_rider_net           NUMERIC;
BEGIN
    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Only the order customer can accept bids';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting bids';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = v_bid.rider_id;
    SELECT id INTO v_rider_profile_id FROM profiles WHERE id = v_rider.profile_id;

    v_new_final_price := v_bid.amount + COALESCE(v_order.vat_amount, 0);

    IF v_order.payment_method = 'wallet' THEN
        v_price_diff := v_order.final_price - v_new_final_price;

        IF v_price_diff > 0 THEN
            -- Bid lower than original — refund difference
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = p_customer_id;

            PERFORM credit_wallet(
                v_wallet_id, v_price_diff, 'refund',
                'BID-REFUND-' || p_bid_id::TEXT,
                'Refund: accepted bid lower than original price',
                v_order.id
            );
        ELSIF v_price_diff < 0 THEN
            -- Bid higher than original — charge the extra
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = p_customer_id;

            -- F9: Check balance before debiting — raise clean error if insufficient
            SELECT balance INTO v_wallet_balance FROM wallets WHERE id = v_wallet_id;
            IF v_wallet_balance < ABS(v_price_diff) THEN
                RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Wallet balance (₦%) is less than required extra charge (₦%)',
                    v_wallet_balance, ABS(v_price_diff);
            END IF;

            PERFORM debit_wallet(
                v_wallet_id, ABS(v_price_diff), 'debit',
                'BID-CHARGE-' || p_bid_id::TEXT,
                'Additional charge: accepted bid higher than original price',
                v_order.id
            );
        END IF;
    END IF;

    -- F8: Default commission rate is 15% not 10%
    v_platform_commission := ROUND(
        v_new_final_price * (COALESCE(v_order.platform_commission_rate, 15.0) / 100.0),
        2
    );

    IF v_rider.fleet_id IS NOT NULL THEN
        SELECT commission_rate INTO v_fleet_commission_rate
        FROM fleets WHERE id = v_rider.fleet_id;

        v_fleet_commission := ROUND(
            (v_new_final_price - v_platform_commission) * (COALESCE(v_fleet_commission_rate, 0) / 100.0),
            2
        );
    END IF;

    v_rider_net := v_new_final_price - v_platform_commission - v_fleet_commission;

    UPDATE bids SET status = 'accepted' WHERE id = p_bid_id;

    UPDATE bids SET status = 'expired'
    WHERE order_id = v_order.id AND id != p_bid_id AND status = 'pending';

    UPDATE orders SET
        status                    = 'matched',
        rider_id                  = v_bid.rider_id,
        final_price               = v_new_final_price,
        platform_commission_amount = v_platform_commission,
        fleet_commission_rate     = v_fleet_commission_rate,
        fleet_commission_amount   = v_fleet_commission,
        rider_net_amount          = v_rider_net,
        matched_at                = NOW()
    WHERE id = v_order.id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order.id, 'pending', 'matched', p_customer_id);

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_rider_profile_id,
        'order_update',
        'Bid Accepted!',
        'Your offer of ₦' || v_bid.amount::TEXT || ' was accepted. Head to pickup.',
        jsonb_build_object('order_id', v_order.id)
    );

    RETURN jsonb_build_object(
        'order_id',            v_order.id,
        'rider_id',            v_bid.rider_id,
        'final_price',         v_new_final_price,
        'platform_commission', v_platform_commission,
        'fleet_commission',    v_fleet_commission,
        'rider_net',           v_rider_net
    );
END;
$$;


ALTER FUNCTION "public"."accept_bid"("p_bid_id" "uuid", "p_customer_id" "uuid") OWNER TO "postgres";

--
-- Name: accept_customer_counter_offer("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."accept_customer_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_bid bids%ROWTYPE;
    v_order orders%ROWTYPE;
    v_rider riders%ROWTYPE;
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
    IF COALESCE(v_bid.negotiation_round, 1) % 2 != 0 THEN
        RAISE EXCEPTION 'Only a customer counter-offer can be accepted from the rider flow';
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

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    IF v_rider.profile_id != auth.uid() OR v_bid.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Unauthorized rider';
    END IF;

    RETURN public.accept_bid(p_bid_id, v_order.customer_id);
END;
$$;


ALTER FUNCTION "public"."accept_customer_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid") OWNER TO "postgres";

--
-- Name: can_read_customer_profile_for_assigned_order("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
  v_can_read boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.riders r ON r.id = o.rider_id
    WHERE o.customer_id = p_customer_profile_id
      AND r.profile_id = auth.uid()
      AND o.status IN (
        'matched',
        'pickup_en_route',
        'arrived_pickup',
        'in_transit',
        'arrived_dropoff'
      )
  )
  INTO v_can_read;

  RETURN coalesce(v_can_read, false);
END;
$$;


ALTER FUNCTION "public"."can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid") OWNER TO "postgres";

--
-- Name: can_read_rider_for_customer_order("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."can_read_rider_for_customer_order"("p_rider_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
  v_can_read boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.customer_id = auth.uid()
      AND o.rider_id = p_rider_id
      AND o.rider_id IS NOT NULL
  )
  INTO v_can_read;

  RETURN coalesce(v_can_read, false);
END;
$$;


ALTER FUNCTION "public"."can_read_rider_for_customer_order"("p_rider_id" "uuid") OWNER TO "postgres";

--
-- Name: cancel_expired_orders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."cancel_expired_orders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_expired_ids UUID[];
    v_order       orders%ROWTYPE;
    v_order_id    UUID;
    v_wallet_id   UUID;
    v_platform_wallet UUID;
BEGIN
    SELECT ARRAY_AGG(id) INTO v_expired_ids
    FROM orders
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    IF v_expired_ids IS NULL OR ARRAY_LENGTH(v_expired_ids, 1) = 0 THEN
        RETURN 0;
    END IF;

    SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;

    FOREACH v_order_id IN ARRAY v_expired_ids LOOP
        SELECT * INTO v_order FROM orders WHERE id = v_order_id;

        UPDATE orders
        SET status     = 'cancelled',
            updated_at = NOW()
        WHERE id = v_order_id;

        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
        VALUES (v_order_id, 'pending', 'cancelled', NULL);

        -- F7: Refund wallet-paid orders on expiry
        IF v_order.payment_method = 'wallet' AND COALESCE(v_order.final_price, 0) > 0 THEN
            SELECT id INTO v_wallet_id FROM wallets
            WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

            IF v_wallet_id IS NOT NULL THEN
                PERFORM credit_wallet(
                    v_wallet_id,
                    v_order.final_price,
                    'refund',
                    'EXPIRE-REFUND-' || v_order_id::TEXT,
                    'Refund: no rider found before order expired',
                    v_order_id
                );
            END IF;

            -- Reverse the platform commission expectation if any was recorded
            -- (order never matched so no commission was earned)
            -- Nothing to reverse in platform wallet since debit never happened
        END IF;

        -- Reject all open bids on this order
        UPDATE bids SET status = 'rejected', updated_at = NOW()
        WHERE order_id = v_order_id AND status IN ('pending', 'countered');

        -- Notify customer
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_order.customer_id,
            'order_update',
            'Order Expired',
            'No rider was found for your order. If you paid by wallet, your money has been refunded.',
            jsonb_build_object('order_id', v_order_id, 'reason', 'no_rider_found')
        );
    END LOOP;

    RETURN ARRAY_LENGTH(v_expired_ids, 1);
END;
$$;


ALTER FUNCTION "public"."cancel_expired_orders"() OWNER TO "postgres";

--
-- Name: cancel_order("uuid", "public"."cancellation_actor", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_cancelled_by" "public"."cancellation_actor", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT 'No reason provided'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_wallet_id UUID;
    v_penalty NUMERIC := 0;
    v_refund_amount NUMERIC;
    v_rider_profile_id UUID;
    v_platform_wallet UUID;
    v_actor_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status IN ('delivered', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot cancel order in status: %', v_order.status;
    END IF;

    IF p_cancelled_by = 'customer'::cancellation_actor THEN
        IF v_order.customer_id != v_actor_id OR auth.uid() != v_actor_id THEN
            RAISE EXCEPTION 'Only the order customer can cancel this order';
        END IF;
    ELSIF p_cancelled_by = 'rider'::cancellation_actor THEN
        SELECT profile_id
        INTO v_rider_profile_id
        FROM riders
        WHERE id = v_order.rider_id;

        IF v_order.rider_id IS NULL OR v_rider_profile_id IS NULL OR v_rider_profile_id != v_actor_id OR auth.uid() != v_actor_id THEN
            RAISE EXCEPTION 'Only the assigned rider can cancel this order as rider';
        END IF;
    END IF;

    IF v_order.status IN ('in_transit', 'arrived_dropoff') THEN
        v_penalty := ROUND(v_order.final_price * 0.20, 2);
    END IF;

    v_refund_amount := COALESCE(v_order.final_price, 0) - v_penalty;

    IF v_refund_amount > 0 AND v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

        IF v_wallet_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM transactions
               WHERE order_id = p_order_id
                 AND type = 'refund'
           ) THEN
            PERFORM credit_wallet(
                v_wallet_id,
                v_refund_amount,
                'refund',
                'CANCEL-REFUND-' || p_order_id::TEXT,
                'Order cancellation refund',
                p_order_id
            );
        END IF;
    END IF;

    IF v_penalty > 0 THEN
        SELECT id INTO v_platform_wallet
        FROM wallets
        WHERE owner_type = 'platform'
        LIMIT 1;

        IF v_platform_wallet IS NOT NULL THEN
            PERFORM credit_wallet(
                v_platform_wallet,
                v_penalty,
                'credit',
                'CANCEL-PENALTY-' || p_order_id::TEXT,
                'Cancellation penalty',
                p_order_id
            );
        END IF;
    END IF;

    UPDATE orders
    SET status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, reason)
    VALUES (p_order_id, v_order.status, 'cancelled', v_actor_id, p_reason);

    INSERT INTO cancellations (order_id, cancelled_by, user_id, reason, penalty_amount)
    VALUES (p_order_id, p_cancelled_by, v_actor_id, p_reason, v_penalty);

    IF v_order.rider_id IS NOT NULL THEN
        SELECT profile_id INTO v_rider_profile_id
        FROM riders
        WHERE id = v_order.rider_id;

        IF v_rider_profile_id IS NOT NULL THEN
            INSERT INTO notifications (user_id, type, title, body, data)
            VALUES (
                v_rider_profile_id,
                'order_update',
                'Order Cancelled',
                'The delivery order has been cancelled.',
                jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
            );
        END IF;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_order.customer_id,
        'order_update',
        'Order Cancelled',
        'Your order has been cancelled.',
        jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
    );
END;
$$;


ALTER FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_cancelled_by" "public"."cancellation_actor", "p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";

--
-- Name: complete_delivery("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_rider_id" "uuid", "p_pod_photo_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order           orders%ROWTYPE;
    v_rider           riders%ROWTYPE;
    v_commission      NUMERIC;
    v_delivery_price  NUMERIC;
    v_rider_earnings  NUMERIC;
    v_rider_wallet    UUID;
    v_platform_wallet UUID;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;
    IF NOT COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RAISE EXCEPTION 'Delivery code must be verified before marking complete';
    END IF;

    -- Issue 19: Require a proof-of-delivery photo URL
    IF p_pod_photo_url IS NULL OR TRIM(p_pod_photo_url) = '' THEN
        RAISE EXCEPTION 'Proof-of-delivery photo is required to complete a delivery';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;

    SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
    IF v_platform_wallet IS NULL THEN
        RAISE EXCEPTION 'Platform wallet not found — cannot complete delivery without a revenue ledger';
    END IF;

    v_delivery_price := COALESCE(v_order.final_price, 0) - COALESCE(v_order.vat_amount, 0);

    IF COALESCE(v_order.platform_commission_amount, 0) > 0 THEN
        v_commission := v_order.platform_commission_amount;
    ELSE
        v_commission := ROUND(
            v_delivery_price * (COALESCE(v_order.platform_commission_rate, 15.0) / 100.0),
            2
        );
    END IF;

    v_rider_earnings := COALESCE(v_order.final_price, 0) - v_commission;

    UPDATE orders SET
        status        = 'delivered',
        pod_photo_url = p_pod_photo_url,
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        SELECT id INTO v_rider_wallet FROM wallets
        WHERE owner_type = 'rider' AND owner_id = v_rider.profile_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet, v_rider_earnings, 'credit',
                'EARN-' || p_order_id::TEXT, 'Delivery earnings', p_order_id
            );
        END IF;

        IF v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission_credit',
                'COMM-' || p_order_id::TEXT, 'Platform commission', p_order_id
            );
        END IF;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        v_rider.profile_id,
        'delivery_completed',
        'Delivery Completed',
        'Great job! Your earnings have been added to your wallet.',
        jsonb_build_object(
            'order_id', p_order_id,
            'earnings', v_rider_earnings,
            'commission', v_commission
        )
    );

    RETURN jsonb_build_object(
        'rider_earnings',       v_rider_earnings,
        'platform_commission',  v_commission,
        'delivery_price',       v_delivery_price
    );
END;
$$;


ALTER FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_rider_id" "uuid", "p_pod_photo_url" "text") OWNER TO "postgres";

--
-- Name: create_order("uuid", "text", double precision, double precision, "text", "text", "text", double precision, double precision, "text", "text", "uuid", "public"."package_size", "text", "text", numeric, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text" DEFAULT NULL::"text", "p_pickup_contact_phone" "text" DEFAULT NULL::"text", "p_dropoff_address" "text" DEFAULT NULL::"text", "p_dropoff_lat" double precision DEFAULT NULL::double precision, "p_dropoff_lng" double precision DEFAULT NULL::double precision, "p_dropoff_contact_name" "text" DEFAULT NULL::"text", "p_dropoff_contact_phone" "text" DEFAULT NULL::"text", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_package_size" "public"."package_size" DEFAULT 'small'::"public"."package_size", "p_package_description" "text" DEFAULT NULL::"text", "p_package_notes" "text" DEFAULT NULL::"text", "p_suggested_price" numeric DEFAULT NULL::numeric, "p_promo_code" "text" DEFAULT NULL::"text", "p_service_area_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order_id UUID;
    v_pickup_point GEOGRAPHY;
    v_dropoff_point GEOGRAPHY;
    v_distance_km NUMERIC;
    v_dynamic_price NUMERIC;
    v_vat_amount NUMERIC;
    v_final_price NUMERIC;
    v_delivery_code TEXT;
    v_wallet_id UUID;
    v_reference TEXT;
    v_promo_id UUID;
    v_discount_amount NUMERIC := 0;
    v_pricing pricing_rules%ROWTYPE;
    v_platform_commission_rate NUMERIC := 15.00;  -- default platform commission %
    v_platform_commission_amount NUMERIC;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Validate required dropoff
    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
    END IF;

    -- Build PostGIS points
    v_pickup_point := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;

    -- Calculate distance in km
    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    -- Get pricing rules for service area
    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- Calculate dynamic price
    IF v_pricing.id IS NOT NULL THEN
        v_dynamic_price := ROUND(
            (v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_pricing.surge_multiplier,
            2
        );
        -- Apply min/max
        IF v_dynamic_price < v_pricing.min_price THEN
            v_dynamic_price := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        -- VAT
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        -- Fallback pricing if no pricing rules configured
        v_dynamic_price := ROUND(500 + (v_distance_km * 100), 2);  -- NGN 500 base + 100/km
        v_vat_amount := ROUND(v_dynamic_price * 0.075, 2);         -- 7.5% VAT
    END IF;

    -- Validate and apply promo code
    IF p_promo_code IS NOT NULL THEN
        SELECT id INTO v_promo_id
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
            AND is_active = TRUE
            AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR used_count < max_uses)
            AND (v_dynamic_price + v_vat_amount) >= min_order_amount;

        IF v_promo_id IS NOT NULL THEN
            SELECT
                CASE
                    WHEN discount_type = 'percentage' THEN
                        LEAST(
                            ROUND(v_dynamic_price * (discount_value / 100.0), 2),
                            COALESCE(max_discount_amount, v_dynamic_price)
                        )
                    ELSE
                        LEAST(discount_value, v_dynamic_price)
                END
            INTO v_discount_amount
            FROM promo_codes
            WHERE id = v_promo_id;

            -- Increment usage
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    -- Determine final price:
    -- If customer suggests a price, that becomes the starting point for negotiation.
    -- If not, dynamic_price is used. Discount applies either way.
    v_final_price := COALESCE(p_suggested_price, v_dynamic_price) + v_vat_amount - v_discount_amount;
    IF v_final_price < 0 THEN
        v_final_price := 0;
    END IF;

    -- Commission calculations (snapshot at order creation)
    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);

    -- Generate 6-digit delivery code
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

    -- Negotiation timeout (configurable, default 10 minutes)
    v_expires_at := NOW() + INTERVAL '2 hours';

    -- Get customer wallet
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE owner_type = 'customer' AND owner_id = p_customer_id;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
    END IF;

    -- Debit customer wallet (atomic — fails if insufficient balance)
    v_reference := 'ORD-' || gen_random_uuid()::TEXT;
    PERFORM debit_wallet(
        v_wallet_id,
        v_final_price,
        'debit',
        v_reference,
        'Payment for delivery order'
    );

    -- Create the order
    INSERT INTO orders (
        customer_id, status,
        pickup_address, pickup_location, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_location, dropoff_contact_name, dropoff_contact_phone,
        category_id, package_size, package_description, package_notes,
        distance_km, dynamic_price, suggested_price, final_price, vat_amount,
        platform_commission_rate, platform_commission_amount,
        fleet_commission_rate, fleet_commission_amount, rider_net_amount,
        promo_code_id, discount_amount,
        payment_method, delivery_code, expires_at, service_area_id
    )
    VALUES (
        p_customer_id, 'pending',
        p_pickup_address, v_pickup_point, p_pickup_contact_name, p_pickup_contact_phone,
        p_dropoff_address, v_dropoff_point, p_dropoff_contact_name, p_dropoff_contact_phone,
        p_category_id, p_package_size, p_package_description, p_package_notes,
        v_distance_km, v_dynamic_price, p_suggested_price, v_final_price, v_vat_amount,
        v_platform_commission_rate, v_platform_commission_amount,
        0, 0, v_final_price - v_platform_commission_amount,
        v_promo_id, v_discount_amount,
        p_payment_method, v_delivery_code, v_expires_at, p_service_area_id
    )
    RETURNING id INTO v_order_id;

    -- Record initial status
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order_id, NULL, 'pending', p_customer_id);

    -- Create notification for customer
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        p_customer_id,
        'order_update',
        'Order Created',
        'Your delivery order has been placed. Finding a rider...',
        jsonb_build_object('order_id', v_order_id)
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'distance_km', v_distance_km,
        'dynamic_price', v_dynamic_price,
        'suggested_price', p_suggested_price,
        'final_price', v_final_price,
        'vat_amount', v_vat_amount,
        'discount_amount', v_discount_amount,
        'delivery_code', v_delivery_code,
        'expires_at', v_expires_at,
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address
    );
END;
$$;


ALTER FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "public"."package_size", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid") OWNER TO "postgres";

--
-- Name: create_order("uuid", "text", double precision, double precision, "text", "text", "text", double precision, double precision, "text", "text", "uuid", "text", "text", "text", numeric, "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text" DEFAULT NULL::"text", "p_pickup_contact_phone" "text" DEFAULT NULL::"text", "p_dropoff_address" "text" DEFAULT NULL::"text", "p_dropoff_lat" double precision DEFAULT NULL::double precision, "p_dropoff_lng" double precision DEFAULT NULL::double precision, "p_dropoff_contact_name" "text" DEFAULT NULL::"text", "p_dropoff_contact_phone" "text" DEFAULT NULL::"text", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_package_size" "text" DEFAULT 'small'::"text", "p_package_description" "text" DEFAULT NULL::"text", "p_package_notes" "text" DEFAULT NULL::"text", "p_suggested_price" numeric DEFAULT NULL::numeric, "p_promo_code" "text" DEFAULT NULL::"text", "p_service_area_id" "uuid" DEFAULT NULL::"uuid", "p_payment_method" "text" DEFAULT 'wallet'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order_id UUID;
    v_pickup_point GEOGRAPHY;
    v_dropoff_point GEOGRAPHY;
    v_distance_km NUMERIC;
    v_dynamic_price NUMERIC;
    v_vat_amount NUMERIC;
    v_final_price NUMERIC;
    v_delivery_code TEXT;
    v_wallet_id UUID;
    v_reference TEXT;
    v_promo_id UUID;
    v_discount_amount NUMERIC := 0;
    v_pricing pricing_rules%ROWTYPE;
    v_platform_commission_rate NUMERIC := 15.00;
    v_platform_commission_amount NUMERIC;
    v_expires_at TIMESTAMPTZ;
    v_size_multiplier NUMERIC := 1.0;
    v_effective_surge NUMERIC := 1.0;
    v_promo promo_codes%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_customer_id THEN
        RAISE EXCEPTION 'Not authorized to create this order';
    END IF;

    IF p_dropoff_address IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Dropoff address, latitude, and longitude are required';
    END IF;

    IF p_package_size = 'medium' THEN
        v_size_multiplier := 1.5;
    ELSIF p_package_size = 'large' THEN
        v_size_multiplier := 2.0;
    END IF;

    v_pickup_point := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;
    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_effective_surge := GREATEST(1, LEAST(COALESCE(v_pricing.surge_multiplier, 1), 5));
        v_dynamic_price := ROUND((v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_effective_surge * v_size_multiplier, 2);
        IF v_dynamic_price < v_pricing.min_price THEN
            v_dynamic_price := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_dynamic_price > v_pricing.max_price THEN
            v_dynamic_price := v_pricing.max_price;
        END IF;
        v_vat_amount := ROUND(v_dynamic_price * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_dynamic_price := ROUND((500 + (v_distance_km * 100)) * v_size_multiplier, 2);
        v_vat_amount := ROUND(v_dynamic_price * 0.075, 2);
    END IF;

    -- F15: Lock the promo row BEFORE checking validity to prevent concurrent double-use
    IF p_promo_code IS NOT NULL AND NULLIF(TRIM(p_promo_code), '') IS NOT NULL THEN
        SELECT * INTO v_promo
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
        FOR UPDATE;

        IF FOUND
           AND v_promo.is_active = TRUE
           AND v_promo.starts_at <= NOW()
           AND (v_promo.expires_at IS NULL OR v_promo.expires_at > NOW())
           AND (v_promo.max_uses IS NULL OR v_promo.used_count < v_promo.max_uses)
           AND (v_dynamic_price + v_vat_amount) >= v_promo.min_order_amount
        THEN
            v_promo_id := v_promo.id;
            v_discount_amount := CASE
                WHEN v_promo.discount_type = 'percentage' THEN
                    LEAST(ROUND(v_dynamic_price * (v_promo.discount_value / 100.0), 2), COALESCE(v_promo.max_discount_amount, v_dynamic_price))
                ELSE LEAST(v_promo.discount_value, v_dynamic_price)
            END;
            UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo_id;
        END IF;
    END IF;

    v_final_price := GREATEST(v_dynamic_price + v_vat_amount - v_discount_amount, 0);
    v_platform_commission_amount := ROUND(v_final_price * (v_platform_commission_rate / 100.0), 2);
    v_delivery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '2 hours';

    IF p_payment_method = 'wallet' THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = 'customer' AND owner_id = p_customer_id;

        IF v_wallet_id IS NULL THEN
            RAISE EXCEPTION 'Customer wallet not found. Please set up your wallet first.';
        END IF;

        v_reference := 'ORD-' || gen_random_uuid()::TEXT;
        PERFORM debit_wallet(v_wallet_id, v_final_price, 'debit', v_reference, 'Payment for delivery order');
    END IF;

    INSERT INTO orders (
        customer_id, status,
        pickup_address, pickup_location, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_location, dropoff_contact_name, dropoff_contact_phone,
        category_id, package_size, package_description, package_notes,
        distance_km, dynamic_price, suggested_price, final_price, vat_amount,
        platform_commission_rate, platform_commission_amount,
        fleet_commission_rate, fleet_commission_amount, rider_net_amount,
        promo_code_id, discount_amount,
        payment_method, delivery_code, expires_at, service_area_id
    )
    VALUES (
        p_customer_id, 'pending',
        p_pickup_address, v_pickup_point, p_pickup_contact_name, p_pickup_contact_phone,
        p_dropoff_address, v_dropoff_point, p_dropoff_contact_name, p_dropoff_contact_phone,
        p_category_id, p_package_size::package_size, p_package_description, p_package_notes,
        v_distance_km, v_dynamic_price, v_dynamic_price, v_final_price, v_vat_amount,
        v_platform_commission_rate, v_platform_commission_amount,
        0, 0, v_final_price - v_platform_commission_amount,
        v_promo_id, v_discount_amount,
        p_payment_method, v_delivery_code, v_expires_at, p_service_area_id
    )
    RETURNING id INTO v_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (v_order_id, NULL, 'pending', p_customer_id);

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
        p_customer_id,
        'delivery_code',
        'Order Created - Save Your Code',
        'Your order is placed. Keep your delivery code safe - share it only when the rider is with you.',
        jsonb_build_object('order_id', v_order_id, 'code', v_delivery_code)
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'distance_km', v_distance_km,
        'dynamic_price', v_dynamic_price,
        'suggested_price', v_dynamic_price,
        'final_price', v_final_price,
        'vat_amount', v_vat_amount,
        'discount_amount', v_discount_amount,
        'delivery_code', v_delivery_code,
        'expires_at', v_expires_at,
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address
    );
END;
$$;


ALTER FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "text", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid", "p_payment_method" "text") OWNER TO "postgres";

--
-- Name: create_wallet("public"."wallet_owner_type", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_wallet"("p_owner_type" "public"."wallet_owner_type", "p_owner_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    INSERT INTO wallets (owner_type, owner_id, balance, currency)
    VALUES (p_owner_type, p_owner_id, 0, 'NGN')
    ON CONFLICT (owner_type, owner_id) DO NOTHING
    RETURNING id INTO v_wallet_id;

    -- If already exists, fetch the existing one
    IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE owner_type = p_owner_type AND owner_id = p_owner_id;
    END IF;

    RETURN v_wallet_id;
END;
$$;


ALTER FUNCTION "public"."create_wallet"("p_owner_type" "public"."wallet_owner_type", "p_owner_id" "uuid") OWNER TO "postgres";

--
-- Name: credit_wallet("uuid", numeric, "public"."transaction_type", "text", "text", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."credit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text" DEFAULT NULL::"text", "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_balance_before  NUMERIC;
    v_balance_after   NUMERIC;
    v_transaction_id  UUID;
    v_existing_id     UUID;
BEGIN
    -- Idempotency check: if reference already processed, return existing transaction
    SELECT id INTO v_existing_id FROM transactions WHERE reference = p_reference;
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive: %', p_amount;
    END IF;

    -- Lock the wallet row
    SELECT balance INTO v_balance_before
    FROM wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    v_balance_after := v_balance_before + p_amount;

    -- Update wallet balance
    UPDATE wallets
    SET balance = v_balance_after
    WHERE id = p_wallet_id;

    -- Record transaction
    INSERT INTO transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference, description, order_id, metadata
    )
    VALUES (
        p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after,
        p_reference, p_description, p_order_id, p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$;


ALTER FUNCTION "public"."credit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";

--
-- Name: debit_wallet("uuid", numeric, "public"."transaction_type", "text", "text", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."debit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text" DEFAULT NULL::"text", "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_balance_before  NUMERIC;
    v_balance_after   NUMERIC;
    v_transaction_id  UUID;
    v_existing_id     UUID;
BEGIN
    -- Idempotency check
    SELECT id INTO v_existing_id FROM transactions WHERE reference = p_reference;
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive: %', p_amount;
    END IF;

    -- Lock the wallet row
    SELECT balance INTO v_balance_before
    FROM wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    v_balance_after := v_balance_before - p_amount;

    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_balance_before, p_amount;
    END IF;

    -- Update wallet balance
    UPDATE wallets
    SET balance = v_balance_after
    WHERE id = p_wallet_id;

    -- Record transaction
    INSERT INTO transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference, description, order_id, metadata
    )
    VALUES (
        p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after,
        p_reference, p_description, p_order_id, p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$;


ALTER FUNCTION "public"."debit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";

--
-- Name: get_current_rider_fleet_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_current_rider_fleet_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_fleet_id UUID;
BEGIN
    SELECT fleet_id INTO v_fleet_id FROM riders WHERE profile_id = auth.uid();
    RETURN v_fleet_id;
END;
$$;


ALTER FUNCTION "public"."get_current_rider_fleet_id"() OWNER TO "postgres";

--
-- Name: get_fleet_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_fleet_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN SELECT id INTO v_id FROM fleets WHERE owner_id = auth.uid(); RETURN v_id; END; $$;


ALTER FUNCTION "public"."get_fleet_id"() OWNER TO "postgres";

--
-- Name: get_fleet_rider_ids_for_owner("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_fleet_rider_ids_for_owner"("p_owner_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT r.id FROM riders r
    JOIN fleets f ON r.fleet_id = f.id
    WHERE f.owner_id = p_owner_id;
END;
$$;


ALTER FUNCTION "public"."get_fleet_rider_ids_for_owner"("p_owner_id" "uuid") OWNER TO "postgres";

--
-- Name: get_nearby_orders("uuid", double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_nearby_orders"("p_rider_id" "uuid", "p_radius_meters" double precision DEFAULT 10000) RETURNS TABLE("order_id" "uuid", "pickup_address" "text", "dropoff_address" "text", "distance_to_pickup" double precision, "dynamic_price" numeric, "suggested_price" numeric, "package_size" "public"."package_size", "package_description" "text", "category_name" "text", "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "pickup_lat" double precision, "pickup_lng" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_rider_location geography;
BEGIN
    -- Ownership check: caller must own the rider profile
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: rider ID does not match session';
    END IF;

    SELECT current_location INTO v_rider_location
    FROM riders
    WHERE id = p_rider_id;

    IF v_rider_location IS NULL THEN
        RETURN QUERY
        SELECT
            o.id,
            o.pickup_address,
            o.dropoff_address,
            NULL::FLOAT,
            o.dynamic_price,
            o.suggested_price,
            o.package_size,
            o.package_description,
            pc.name,
            o.created_at,
            o.expires_at,
            CASE WHEN o.pickup_location IS NOT NULL THEN ST_Y(o.pickup_location::geometry) END,
            CASE WHEN o.pickup_location IS NOT NULL THEN ST_X(o.pickup_location::geometry) END
        FROM orders o
        LEFT JOIN package_categories pc ON pc.id = o.category_id
        WHERE o.status = 'pending'
            AND (o.expires_at IS NULL OR o.expires_at > NOW())
        ORDER BY o.created_at DESC
        LIMIT 20;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        o.id,
        o.pickup_address,
        o.dropoff_address,
        CASE
            WHEN o.pickup_location IS NOT NULL
            THEN ST_Distance(v_rider_location, o.pickup_location)::FLOAT
            ELSE NULL
        END,
        o.dynamic_price,
        o.suggested_price,
        o.package_size,
        o.package_description,
        pc.name,
        o.created_at,
        o.expires_at,
        CASE WHEN o.pickup_location IS NOT NULL THEN ST_Y(o.pickup_location::geometry) END,
        CASE WHEN o.pickup_location IS NOT NULL THEN ST_X(o.pickup_location::geometry) END
    FROM orders o
    LEFT JOIN package_categories pc ON pc.id = o.category_id
    WHERE o.status = 'pending'
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
        AND (
            o.pickup_location IS NULL
            OR ST_DWithin(v_rider_location, o.pickup_location, p_radius_meters)
        )
    ORDER BY
        CASE
            WHEN o.pickup_location IS NOT NULL THEN ST_Distance(v_rider_location, o.pickup_location)
            ELSE 999999
        END ASC,
        o.created_at DESC
    LIMIT 20;
END;
$$;


ALTER FUNCTION "public"."get_nearby_orders"("p_rider_id" "uuid", "p_radius_meters" double precision) OWNER TO "postgres";

--
-- Name: get_order_customer_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_order_customer_id"("p_order_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE v_customer_id UUID;
BEGIN
    SELECT customer_id INTO v_customer_id FROM orders WHERE id = p_order_id;
    RETURN v_customer_id;
END;
$$;


ALTER FUNCTION "public"."get_order_customer_id"("p_order_id" "uuid") OWNER TO "postgres";

--
-- Name: get_order_rider_profile_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_order_rider_profile_id"("p_order_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    SELECT r.profile_id INTO v_profile_id
    FROM orders o
    JOIN riders r ON r.id = o.rider_id
    WHERE o.id = p_order_id;
    RETURN v_profile_id;
END;
$$;


ALTER FUNCTION "public"."get_order_rider_profile_id"("p_order_id" "uuid") OWNER TO "postgres";

--
-- Name: get_price_quote(double precision, double precision, double precision, double precision, "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_price_quote"("p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_package_size" "text" DEFAULT 'small'::"text", "p_promo_code" "text" DEFAULT NULL::"text", "p_service_area_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("distance_km" double precision, "delivery_fee" numeric, "vat_amount" numeric, "discount_amount" numeric, "total_price" numeric, "surge_multiplier" numeric, "promo_applied" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_pickup_point geography;
    v_dropoff_point geography;
    v_distance_km numeric;
    v_delivery_fee numeric;
    v_vat_amount numeric;
    v_discount_amount numeric := 0;
    v_total_price numeric;
    v_size_multiplier numeric := 1.0;
    v_promo_id uuid;
    v_pricing pricing_rules%ROWTYPE;
    v_effective_surge numeric := 1.0;
    v_promo_applied boolean := false;
BEGIN
    IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN
        RAISE EXCEPTION 'Pickup and dropoff coordinates are required';
    END IF;

    IF p_package_size = 'medium' THEN
        v_size_multiplier := 1.5;
    ELSIF p_package_size = 'large' THEN
        v_size_multiplier := 2.0;
    END IF;

    v_pickup_point := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::GEOGRAPHY;
    v_dropoff_point := ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::GEOGRAPHY;
    v_distance_km := ROUND((ST_Distance(v_pickup_point, v_dropoff_point) / 1000.0)::NUMERIC, 2);

    IF p_service_area_id IS NOT NULL THEN
        SELECT * INTO v_pricing
        FROM pricing_rules
        WHERE service_area_id = p_service_area_id
            AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_pricing.id IS NOT NULL THEN
        v_effective_surge := GREATEST(1, LEAST(COALESCE(v_pricing.surge_multiplier, 1), 5));
        v_delivery_fee := ROUND(
            (v_pricing.base_rate + (v_distance_km * v_pricing.per_km_rate)) * v_effective_surge * v_size_multiplier,
            2
        );
        IF v_delivery_fee < v_pricing.min_price THEN
            v_delivery_fee := v_pricing.min_price;
        END IF;
        IF v_pricing.max_price IS NOT NULL AND v_delivery_fee > v_pricing.max_price THEN
            v_delivery_fee := v_pricing.max_price;
        END IF;
        v_vat_amount := ROUND(v_delivery_fee * (v_pricing.vat_percentage / 100.0), 2);
    ELSE
        v_effective_surge := 1.0;
        v_delivery_fee := ROUND((500 + (v_distance_km * 100)) * v_size_multiplier, 2);
        v_vat_amount := ROUND(v_delivery_fee * 0.075, 2);
    END IF;

    IF p_promo_code IS NOT NULL AND NULLIF(BTRIM(p_promo_code), '') IS NOT NULL THEN
        SELECT id INTO v_promo_id
        FROM promo_codes
        WHERE code = UPPER(TRIM(p_promo_code))
            AND is_active = TRUE
            AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR used_count < max_uses)
            AND (v_delivery_fee + v_vat_amount) >= min_order_amount;

        IF v_promo_id IS NOT NULL THEN
            SELECT CASE
                WHEN discount_type = 'percentage' THEN
                    LEAST(ROUND(v_delivery_fee * (discount_value / 100.0), 2), COALESCE(max_discount_amount, v_delivery_fee))
                ELSE LEAST(discount_value, v_delivery_fee)
            END
            INTO v_discount_amount
            FROM promo_codes
            WHERE id = v_promo_id;
            v_promo_applied := TRUE;
        END IF;
    END IF;

    v_total_price := GREATEST(v_delivery_fee + v_vat_amount - v_discount_amount, 0);

    RETURN QUERY
    SELECT
        v_distance_km::FLOAT,
        v_delivery_fee,
        v_vat_amount,
        v_discount_amount,
        v_total_price,
        v_effective_surge,
        v_promo_applied;
END;
$$;


ALTER FUNCTION "public"."get_price_quote"("p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_package_size" "text", "p_promo_code" "text", "p_service_area_id" "uuid") OWNER TO "postgres";

--
-- Name: get_rider_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_rider_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE v_id uuid;
BEGIN
    SELECT id INTO v_id FROM riders WHERE profile_id = auth.uid();
    RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."get_rider_id"() OWNER TO "postgres";

--
-- Name: get_rider_location_customer_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_rider_location_customer_id"("p_rider_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    -- Priority 1: matched/active trip — customer can always see their assigned rider
    SELECT o.customer_id INTO v_customer_id
    FROM orders o
    WHERE o.rider_id = p_rider_id
      AND o.status IN (
          'matched',
          'pickup_en_route',
          'arrived_pickup',
          'in_transit',
          'arrived_dropoff'
      )
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
        RETURN v_customer_id;
    END IF;

    -- Priority 2: rider has an active bid on a pending order — customer can see
    -- the rider's location during negotiation so they can make informed decisions
    SELECT o.customer_id INTO v_customer_id
    FROM bids b
    JOIN orders o ON o.id = b.order_id
    WHERE b.rider_id = p_rider_id
      AND b.status IN ('pending', 'countered')
      AND o.status = 'pending'
      AND (o.expires_at IS NULL OR o.expires_at > NOW())
    ORDER BY b.created_at DESC
    LIMIT 1;

    RETURN v_customer_id; -- may be NULL if no active bid either
END;
$$;


ALTER FUNCTION "public"."get_rider_location_customer_id"("p_rider_id" "uuid") OWNER TO "postgres";

--
-- Name: get_rider_profile_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_rider_profile_id"("p_rider_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    SELECT profile_id INTO v_profile_id FROM riders WHERE id = p_rider_id;
    RETURN v_profile_id;
END;
$$;


ALTER FUNCTION "public"."get_rider_profile_id"("p_rider_id" "uuid") OWNER TO "postgres";

--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_user_role"() RETURNS "public"."user_role"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE v_role_text TEXT;
BEGIN
    v_role_text := auth.jwt() -> 'user_metadata' ->> 'role';
    IF v_role_text IS NULL THEN
        SELECT role::text INTO v_role_text FROM profiles WHERE id = auth.uid();
    END IF;
    RETURN v_role_text::user_role;
END;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_role       public.user_role;
    v_full_name  TEXT;
    v_phone      TEXT;
    v_email      TEXT;
    v_owner_type public.wallet_owner_type;
BEGIN
    v_role      := COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::public.user_role;
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    v_email     := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', NULL);
    v_phone     := NULLIF(TRIM(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', '')), '');

    INSERT INTO public.profiles (id, role, full_name, phone, email)
    VALUES (NEW.id, v_role, v_full_name, v_phone, v_email)
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email;

    IF v_role != 'admin' THEN
        v_owner_type := CASE v_role::text
            WHEN 'customer'      THEN 'customer'::public.wallet_owner_type
            WHEN 'rider'         THEN 'rider'::public.wallet_owner_type
            WHEN 'fleet_manager' THEN 'fleet'::public.wallet_owner_type
            ELSE 'customer'::public.wallet_owner_type
        END;
        INSERT INTO public.wallets (owner_type, owner_id, balance, currency)
        VALUES (v_owner_type, NEW.id, 0, 'NGN')
        ON CONFLICT (owner_type, owner_id) DO NOTHING;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
BEGIN
    RETURN (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin';
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

--
-- Name: mark_cash_paid("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."mark_cash_paid"("p_order_id" "uuid", "p_rider_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_balance outstanding_balances%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: rider ID does not match session';
    END IF;

    SELECT * INTO v_balance
    FROM outstanding_balances
    WHERE order_id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No outstanding balance found for this order';
    END IF;
    IF v_balance.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Unauthorized: this balance is not associated with your rider account';
    END IF;
    IF v_balance.paid_at IS NOT NULL THEN
        RAISE EXCEPTION 'Balance already marked as paid';
    END IF;

    UPDATE outstanding_balances
    SET paid_at = NOW()
    WHERE id = v_balance.id;
END;
$$;


ALTER FUNCTION "public"."mark_cash_paid"("p_order_id" "uuid", "p_rider_id" "uuid") OWNER TO "postgres";

--
-- Name: place_bid("uuid", "uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."place_bid"("p_order_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."place_bid"("p_order_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) OWNER TO "postgres";

--
-- Name: raise_dispute("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."raise_dispute"("p_order_id" "uuid", "p_subject" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_caller_id uuid;
    v_dispute_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Caller must be the customer or matched rider for this order
    IF NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = p_order_id
          AND (
              o.customer_id = v_caller_id
              OR EXISTS (
                  SELECT 1 FROM riders r
                  WHERE r.id = o.rider_id AND r.profile_id = v_caller_id
              )
          )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: you are not a participant in this order';
    END IF;

    IF NULLIF(TRIM(p_subject), '') IS NULL THEN
        RAISE EXCEPTION 'Dispute subject is required';
    END IF;

    INSERT INTO disputes (order_id, raised_by, subject, description)
    VALUES (p_order_id, v_caller_id, TRIM(p_subject), p_description)
    ON CONFLICT (order_id, raised_by) DO NOTHING
    RETURNING id INTO v_dispute_id;

    RETURN v_dispute_id;
END;
$$;


ALTER FUNCTION "public"."raise_dispute"("p_order_id" "uuid", "p_subject" "text", "p_description" "text") OWNER TO "postgres";

--
-- Name: rate_rider("uuid", "uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."rate_rider"("p_order_id" "uuid", "p_customer_id" "uuid", "p_score" integer, "p_review" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order    orders%ROWTYPE;
    v_rating_id UUID;
    v_new_avg   NUMERIC;
    v_new_count INT;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Only the customer can rate this order';
    END IF;
    IF v_order.status NOT IN ('delivered', 'completed') THEN
        RAISE EXCEPTION 'Can only rate after delivery';
    END IF;
    IF p_score < 1 OR p_score > 5 THEN
        RAISE EXCEPTION 'Rating must be between 1 and 5';
    END IF;

    -- Insert rating (unique constraint on order_id prevents duplicates)
    INSERT INTO ratings (order_id, customer_id, rider_id, score, review)
    VALUES (p_order_id, p_customer_id, v_order.rider_id, p_score, p_review)
    RETURNING id INTO v_rating_id;

    -- Update rider average rating
    SELECT
        ROUND(AVG(score)::NUMERIC, 2),
        COUNT(*)
    INTO v_new_avg, v_new_count
    FROM ratings
    WHERE rider_id = v_order.rider_id;

    UPDATE riders
    SET average_rating = v_new_avg, rating_count = v_new_count
    WHERE id = v_order.rider_id;

    RETURN v_rating_id;
END;
$$;


ALTER FUNCTION "public"."rate_rider"("p_order_id" "uuid", "p_customer_id" "uuid", "p_score" integer, "p_review" "text") OWNER TO "postgres";

--
-- Name: refund_cancelled_order("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."refund_cancelled_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order      orders%ROWTYPE;
    v_wallet_id  UUID;
    v_refund_ref TEXT;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Only refund wallet orders that haven't already been refunded
    IF v_order.payment_method != 'wallet' THEN RETURN; END IF;
    IF v_order.final_price IS NULL OR v_order.final_price <= 0 THEN RETURN; END IF;

    -- Check if a refund transaction already exists for this order
    IF EXISTS (
        SELECT 1 FROM transactions
        WHERE reference LIKE 'REFUND-' || p_order_id::TEXT || '%'
    ) THEN
        RETURN; -- Already refunded
    END IF;

    SELECT id INTO v_wallet_id
    FROM wallets WHERE owner_type = 'customer' AND owner_id = v_order.customer_id;

    IF v_wallet_id IS NULL THEN RETURN; END IF;

    v_refund_ref := 'REFUND-' || p_order_id::TEXT;

    PERFORM credit_wallet(
        v_wallet_id,
        v_order.final_price,
        'refund',
        v_refund_ref,
        'Refund: order expired — no rider found',
        p_order_id
    );
END;
$$;


ALTER FUNCTION "public"."refund_cancelled_order"("p_order_id" "uuid") OWNER TO "postgres";

--
-- Name: request_withdrawal("uuid", numeric, "text", "text", "text", "text", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."request_withdrawal"("p_wallet_id" "uuid", "p_amount" numeric, "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text", "p_fee" numeric DEFAULT 100) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_withdrawal_id  UUID;
    v_reference      TEXT;
    v_transaction_id UUID;
    v_wallet         wallets%ROWTYPE;
    v_rider_profile_id UUID;
    v_net_payout     NUMERIC;
    v_total_debit    NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must be positive';
    END IF;
    IF p_fee < 0 THEN
        RAISE EXCEPTION 'Fee cannot be negative';
    END IF;

    SELECT * INTO v_wallet FROM wallets WHERE id = p_wallet_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    IF v_wallet.owner_type = 'rider' THEN
        SELECT profile_id INTO v_rider_profile_id FROM riders WHERE id = v_wallet.owner_id;
        IF NOT (
            v_wallet.owner_id = auth.uid()
            OR (v_rider_profile_id IS NOT NULL AND v_rider_profile_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Unauthorized wallet access';
        END IF;
    ELSIF v_wallet.owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized wallet access';
    END IF;

    v_net_payout  := p_amount - p_fee;
    v_total_debit := p_amount;
    v_reference   := 'WDR-' || gen_random_uuid()::TEXT;

    IF v_net_payout <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must exceed the processing fee of ₦%', p_fee;
    END IF;

    -- Debit the net payout from wallet (fee is retained by platform, not re-credited)
    v_transaction_id := debit_wallet(
        p_wallet_id,
        v_total_debit,
        'withdrawal',
        v_reference,
        'Withdrawal to ' || p_bank_name || ' ' || p_account_number || ' (net: ₦' || v_net_payout || ', fee: ₦' || p_fee || ')'
    );

    INSERT INTO withdrawals (
        wallet_id, amount, bank_name, bank_code, account_number, account_name,
        transaction_id, withdrawal_fee, net_payout
    )
    VALUES (
        p_wallet_id, p_amount, p_bank_name, p_bank_code, p_account_number, p_account_name,
        v_transaction_id, p_fee, v_net_payout
    )
    RETURNING id INTO v_withdrawal_id;

    RETURN v_withdrawal_id;
END;
$$;


ALTER FUNCTION "public"."request_withdrawal"("p_wallet_id" "uuid", "p_amount" numeric, "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text", "p_fee" numeric) OWNER TO "postgres";

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

--
-- Name: send_counter_offer("uuid", "uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_bid              bids%ROWTYPE;
    v_order            orders%ROWTYPE;
    v_rider_profile_id UUID;
    v_new_bid_id       UUID;
    v_next_round       INT;
BEGIN
    IF auth.uid() != p_customer_id THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_bid FROM bids WHERE id = p_bid_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found';
    END IF;
    IF v_bid.status != 'pending' THEN
        RAISE EXCEPTION 'Bid is no longer pending (status: %)', v_bid.status;
    END IF;
    
    -- CUSTOMER COUNTER FIX: Ensure customer is not countering their own bid
    IF v_bid.negotiation_round % 2 = 0 THEN
        RAISE EXCEPTION 'You cannot counter your own bid. Please wait for the rider to respond.';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_bid.order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Order is no longer accepting counter-offers (status: %)', v_order.status;
    END IF;
    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized to counter this order';
    END IF;
    IF v_order.expires_at IS NOT NULL AND v_order.expires_at < NOW() THEN
        RAISE EXCEPTION 'Order has expired';
    END IF;

    v_next_round := v_bid.negotiation_round + 1;
    IF v_next_round > 3 THEN
        RAISE EXCEPTION 'Maximum 3 negotiation rounds reached for this rider. Accept, decline, or find another rider.';
    END IF;

    UPDATE bids SET status = 'countered', updated_at = NOW() WHERE id = p_bid_id;

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
        amount           = EXCLUDED.amount,
        parent_bid_id    = EXCLUDED.parent_bid_id,
        negotiation_round = EXCLUDED.negotiation_round,
        expires_at       = EXCLUDED.expires_at,
        updated_at       = NOW()
    RETURNING id INTO v_new_bid_id;

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


ALTER FUNCTION "public"."send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric) OWNER TO "postgres";

--
-- Name: send_rider_counter_offer("uuid", "uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."send_rider_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."send_rider_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) OWNER TO "postgres";

--
-- Name: submit_rider_application("text", "text", "text", "text", "text", "text", integer, "text", "jsonb", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."submit_rider_application"("p_full_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_vehicle_type" "text" DEFAULT NULL::"text", "p_vehicle_plate" "text" DEFAULT NULL::"text", "p_vehicle_make" "text" DEFAULT NULL::"text", "p_vehicle_model" "text" DEFAULT NULL::"text", "p_vehicle_year" integer DEFAULT NULL::integer, "p_vehicle_color" "text" DEFAULT NULL::"text", "p_documents" "jsonb" DEFAULT '[]'::"jsonb", "p_bank_name" "text" DEFAULT NULL::"text", "p_bank_code" "text" DEFAULT NULL::"text", "p_account_number" "text" DEFAULT NULL::"text", "p_account_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id uuid;
    v_rider_id uuid;
    v_doc jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Reject if already a rider or admin to prevent re-submission attacks
    IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = v_user_id AND role IN ('rider', 'fleet_manager', 'admin')
    ) THEN
        RAISE EXCEPTION 'Account role cannot be changed via this flow';
    END IF;

    -- 1. Update profile — only safe fields + role/kyc controlled here (server-side)
    UPDATE profiles
    SET
        full_name  = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
        email      = COALESCE(NULLIF(TRIM(p_email), ''), email),
        role       = 'rider',
        kyc_status = 'pending'
    WHERE id = v_user_id;

    -- 2. Insert rider record (idempotent — fail if already exists for this profile)
    INSERT INTO riders (
        profile_id, vehicle_type, vehicle_plate,
        vehicle_make, vehicle_model, vehicle_year, vehicle_color
    )
    VALUES (
        v_user_id,
        p_vehicle_type,
        p_vehicle_plate,
        p_vehicle_make,
        p_vehicle_model,
        p_vehicle_year,
        p_vehicle_color
    )
    RETURNING id INTO v_rider_id;

    -- 3. Insert documents
    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents)
    LOOP
        INSERT INTO rider_documents (rider_id, document_type, document_url)
        VALUES (
            v_rider_id,
            (v_doc->>'document_type')::public.document_type,
            v_doc->>'document_url'
        );
    END LOOP;

    -- 4. Insert bank account (optional)
    IF p_account_number IS NOT NULL THEN
        INSERT INTO rider_bank_accounts (
            rider_id, bank_name, bank_code, account_number, account_name, is_default
        )
        VALUES (
            v_rider_id,
            p_bank_name,
            COALESCE(p_bank_code, ''),
            p_account_number,
            p_account_name,
            TRUE
        );
    END IF;

    RETURN jsonb_build_object('rider_id', v_rider_id, 'status', 'pending');
END;
$$;


ALTER FUNCTION "public"."submit_rider_application"("p_full_name" "text", "p_email" "text", "p_vehicle_type" "text", "p_vehicle_plate" "text", "p_vehicle_make" "text", "p_vehicle_model" "text", "p_vehicle_year" integer, "p_vehicle_color" "text", "p_documents" "jsonb", "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text") OWNER TO "postgres";

--
-- Name: sync_order_rider_profile_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."sync_order_rider_profile_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NEW.rider_id IS NOT NULL AND (OLD.rider_id IS DISTINCT FROM NEW.rider_id) THEN
        SELECT profile_id INTO NEW.rider_profile_id
        FROM riders WHERE id = NEW.rider_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_order_rider_profile_id"() OWNER TO "postgres";

--
-- Name: toggle_rider_online("uuid", boolean, double precision, double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."toggle_rider_online"("p_rider_id" "uuid", "p_is_online" boolean, "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized rider toggle';
    END IF;

    UPDATE riders SET
        is_online = p_is_online,
        current_location = CASE
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY
            ELSE current_location
        END,
        location_updated_at = CASE
            WHEN p_lat IS NOT NULL THEN NOW()
            ELSE location_updated_at
        END
    WHERE id = p_rider_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider not found: %', p_rider_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."toggle_rider_online"("p_rider_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";

--
-- Name: trigger_sos("uuid", "uuid", double precision, double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."trigger_sos"("p_user_id" "uuid", "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_sos_id   UUID;
    v_location GEOGRAPHY;
BEGIN
    IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;
    END IF;

    INSERT INTO sos_alerts (user_id, order_id, location)
    VALUES (p_user_id, p_order_id, v_location)
    RETURNING id INTO v_sos_id;

    -- Notify all admins
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT
        p2.id,
        'sos',
        '🚨 SOS Alert',
        'Emergency alert triggered by a user. Immediate attention required.',
        jsonb_build_object('sos_id', v_sos_id, 'order_id', p_order_id, 'user_id', p_user_id)
    FROM profiles p2
    WHERE p2.role = 'admin' AND p2.is_active = TRUE;

    RETURN v_sos_id;
END;
$$;


ALTER FUNCTION "public"."trigger_sos"("p_user_id" "uuid", "p_order_id" "uuid", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";

--
-- Name: update_order_status("uuid", "public"."order_status", "uuid", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_changed_by" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order          orders%ROWTYPE;
    v_caller_id      UUID;
    v_rider_profile  UUID;
    v_caller_role    user_role;
    v_is_customer    BOOLEAN := FALSE;
    v_is_rider       BOOLEAN := FALSE;
    v_is_admin       BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Identify actor
    IF v_caller_id IS NOT NULL THEN
        IF v_caller_id = v_order.customer_id THEN
            v_is_customer := TRUE;
        END IF;

        IF NOT v_is_customer AND v_order.rider_id IS NOT NULL THEN
            SELECT r.profile_id INTO v_rider_profile
            FROM riders r WHERE r.id = v_order.rider_id;
            IF v_rider_profile = v_caller_id THEN
                v_is_rider := TRUE;
            END IF;
        END IF;

        IF NOT v_is_customer AND NOT v_is_rider THEN
            SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;
            IF v_caller_role = 'admin' THEN
                v_is_admin := TRUE;
            END IF;
        END IF;
    ELSE
        -- NULL caller = internal/cron (cancel_expired_orders, etc.)
        v_is_admin := TRUE;
    END IF;

    IF NOT (v_is_customer OR v_is_rider OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: you are not a participant in this order';
    END IF;

    -- Actor-by-transition enforcement
    -- Customers may only cancel (and only before in_transit)
    IF v_is_customer AND NOT v_is_admin THEN
        IF p_new_status != 'cancelled' THEN
            RAISE EXCEPTION 'Customers may only cancel orders';
        END IF;
        IF v_order.status NOT IN ('pending', 'matched', 'pickup_en_route', 'arrived_pickup') THEN
            RAISE EXCEPTION 'Order cannot be cancelled at this stage (status: %)', v_order.status;
        END IF;
    END IF;

    -- Riders may only advance delivery-phase transitions (not cancel, not matched from pending)
    IF v_is_rider AND NOT v_is_admin THEN
        IF p_new_status NOT IN ('pickup_en_route', 'arrived_pickup', 'in_transit', 'arrived_dropoff', 'delivered') THEN
            RAISE EXCEPTION 'Riders may only advance delivery transitions';
        END IF;
    END IF;

    -- State machine
    IF NOT (
        (v_order.status = 'pending'          AND p_new_status IN ('matched',          'cancelled')) OR
        (v_order.status = 'matched'          AND p_new_status IN ('pickup_en_route',  'cancelled')) OR
        (v_order.status = 'pickup_en_route'  AND p_new_status IN ('arrived_pickup',   'cancelled')) OR
        (v_order.status = 'arrived_pickup'   AND p_new_status IN ('in_transit',       'cancelled')) OR
        (v_order.status = 'in_transit'       AND p_new_status IN ('arrived_dropoff',  'cancelled')) OR
        (v_order.status = 'arrived_dropoff'  AND p_new_status IN ('delivered',        'cancelled')) OR
        (v_order.status = 'delivered'        AND p_new_status = 'completed')
    ) THEN
        RAISE EXCEPTION 'Invalid status transition: % → %', v_order.status, p_new_status;
    END IF;

    UPDATE orders SET
        status       = p_new_status,
        picked_up_at = CASE WHEN p_new_status = 'in_transit'  THEN NOW() ELSE picked_up_at END,
        delivered_at = CASE WHEN p_new_status = 'delivered'   THEN NOW() ELSE delivered_at END,
        cancelled_at = CASE WHEN p_new_status = 'cancelled'   THEN NOW() ELSE cancelled_at END,
        updated_at   = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, reason, metadata)
    VALUES (p_order_id, v_order.status, p_new_status, COALESCE(p_changed_by, v_caller_id), p_reason, p_metadata);

    IF v_order.customer_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (
            v_order.customer_id,
            'order_update',
            'Order Update',
            'Your order status has changed to: ' || p_new_status,
            jsonb_build_object('order_id', p_order_id, 'status', p_new_status)
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_changed_by" "uuid", "p_reason" "text", "p_metadata" "jsonb") OWNER TO "postgres";

--
-- Name: update_rider_average_rating(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_rider_average_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_rider_average_rating"() OWNER TO "postgres";

--
-- Name: update_rider_location("uuid", double precision, double precision, "uuid", numeric, numeric, numeric, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_rider_location"("p_rider_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_speed" numeric DEFAULT NULL::numeric, "p_heading" numeric DEFAULT NULL::numeric, "p_accuracy" numeric DEFAULT NULL::numeric, "p_recorded_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_sequence_number" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_location GEOGRAPHY;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized rider location update';
    END IF;

    v_location := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

    -- Update rider's current location in riders table
    UPDATE riders
    SET
        current_location    = v_location,
        location_updated_at = COALESCE(p_recorded_at, NOW())
    WHERE id = p_rider_id;

    -- Append to location history log
    INSERT INTO rider_location_logs (
        rider_id, order_id, location,
        speed, heading, accuracy,
        recorded_at, sequence_number
    )
    VALUES (
        p_rider_id,
        p_order_id,
        v_location,
        p_speed,
        p_heading,
        p_accuracy,
        COALESCE(p_recorded_at, NOW()),
        p_sequence_number
    )
    ON CONFLICT DO NOTHING;

    -- Upsert flat lat/lng into rider_locations for Realtime subscriptions
    INSERT INTO rider_locations (
        rider_id, latitude, longitude,
        order_id, speed, heading, accuracy, updated_at
    )
    VALUES (
        p_rider_id, p_lat, p_lng,
        p_order_id, p_speed, p_heading, p_accuracy, NOW()
    )
    ON CONFLICT (rider_id) DO UPDATE SET
        latitude   = EXCLUDED.latitude,
        longitude  = EXCLUDED.longitude,
        order_id   = EXCLUDED.order_id,
        speed      = EXCLUDED.speed,
        heading    = EXCLUDED.heading,
        accuracy   = EXCLUDED.accuracy,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."update_rider_location"("p_rider_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_order_id" "uuid", "p_speed" numeric, "p_heading" numeric, "p_accuracy" numeric, "p_recorded_at" timestamp with time zone, "p_sequence_number" integer) OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: verify_delivery_code("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."verify_delivery_code"("p_order_id" "uuid", "p_rider_id" "uuid", "p_code" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_order orders%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Caller must own the rider profile being passed
    IF NOT EXISTS (SELECT 1 FROM riders WHERE id = p_rider_id AND profile_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: rider ID does not match session';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'This order is not assigned to you';
    END IF;
    IF v_order.status NOT IN ('arrived_dropoff', 'in_transit') THEN
        RAISE EXCEPTION 'Order is not at the delivery stage (status: %)', v_order.status;
    END IF;

    -- Already verified
    IF COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RETURN TRUE;
    END IF;

    -- Check lockout (reduced from 1 hour to 15 minutes — F13 partial fix)
    IF v_order.delivery_locked_until IS NOT NULL AND v_order.delivery_locked_until > NOW() THEN
        RAISE EXCEPTION 'Too many incorrect attempts. Code entry locked until %',
            to_char(v_order.delivery_locked_until AT TIME ZONE 'UTC', 'HH24:MI UTC');
    END IF;

    IF v_order.delivery_code = p_code THEN
        UPDATE orders SET
            delivery_code_verified   = TRUE,
            failed_delivery_attempts = 0,
            delivery_locked_until    = NULL,
            updated_at               = NOW()
        WHERE id = p_order_id;
        RETURN TRUE;
    ELSE
        UPDATE orders SET
            failed_delivery_attempts = failed_delivery_attempts + 1,
            delivery_locked_until    = CASE
                WHEN failed_delivery_attempts + 1 >= 3
                THEN NOW() + INTERVAL '15 minutes'
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE id = p_order_id;
        RETURN FALSE;
    END IF;
END;
$$;


ALTER FUNCTION "public"."verify_delivery_code"("p_order_id" "uuid", "p_rider_id" "uuid", "p_code" "text") OWNER TO "postgres";

--
-- Name: withdraw_bid("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."withdraw_bid"("p_bid_id" "uuid", "p_rider_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."withdraw_bid"("p_bid_id" "uuid", "p_rider_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: admin_action_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."admin_action_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_action_logs" OWNER TO "postgres";

--
-- Name: bids; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."bids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "public"."bid_status" DEFAULT 'pending'::"public"."bid_status" NOT NULL,
    "parent_bid_id" "uuid",
    "metadata" "jsonb",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "negotiation_round" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "bid_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."bids" OWNER TO "postgres";

--
-- Name: cancellations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."cancellations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "cancelled_by" "public"."cancellation_actor" NOT NULL,
    "user_id" "uuid",
    "reason" "text" NOT NULL,
    "penalty_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cancellations" OWNER TO "postgres";

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";

--
-- Name: disputes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "raised_by" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "public"."dispute_status" DEFAULT 'open'::"public"."dispute_status" NOT NULL,
    "resolution" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";

--
-- Name: fleet_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."fleet_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fleet_id" "uuid" NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'joined'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    "removed_by" "uuid"
);


ALTER TABLE "public"."fleet_invites" OWNER TO "postgres";

--
-- Name: fleet_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."fleet_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fleet_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "message" "text" NOT NULL,
    "is_broadcast" boolean DEFAULT false NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fleet_messages" OWNER TO "postgres";

--
-- Name: fleets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."fleets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text",
    "fleet_code" "text" NOT NULL,
    "commission_type" "public"."fleet_pay_structure" DEFAULT 'percentage'::"public"."fleet_pay_structure" NOT NULL,
    "commission_rate" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "payout_schedule" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "bank_name" "text",
    "bank_account_number" "text",
    "bank_account_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fleet_commission_rate_positive" CHECK (("commission_rate" >= (0)::numeric))
);


ALTER TABLE "public"."fleets" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb",
    "is_read" boolean DEFAULT false NOT NULL,
    "is_pushed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";

--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "old_status" "public"."order_status",
    "new_status" "public"."order_status" NOT NULL,
    "changed_by" "uuid",
    "reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "rider_id" "uuid",
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "pickup_address" "text" NOT NULL,
    "pickup_location" "public"."geography"(Point,4326) NOT NULL,
    "pickup_contact_name" "text",
    "pickup_contact_phone" "text",
    "dropoff_address" "text" NOT NULL,
    "dropoff_location" "public"."geography"(Point,4326) NOT NULL,
    "dropoff_contact_name" "text",
    "dropoff_contact_phone" "text",
    "category_id" "uuid",
    "package_size" "public"."package_size" DEFAULT 'small'::"public"."package_size" NOT NULL,
    "package_description" "text",
    "package_notes" "text",
    "distance_km" numeric(8,2),
    "dynamic_price" numeric(10,2) NOT NULL,
    "suggested_price" numeric(10,2),
    "final_price" numeric(10,2),
    "vat_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "platform_commission_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "platform_commission_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "fleet_commission_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "fleet_commission_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "rider_net_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "promo_code_id" "uuid",
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "delivery_code" "text",
    "delivery_code_verified" boolean DEFAULT false NOT NULL,
    "pod_photo_url" "text",
    "matched_at" timestamp with time zone,
    "picked_up_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_area_id" "uuid",
    "payment_method" "text" DEFAULT 'cash'::"text" NOT NULL,
    "rider_profile_id" "uuid",
    "failed_delivery_attempts" integer DEFAULT 0 NOT NULL,
    "delivery_locked_until" timestamp with time zone,
    "cancellation_reason" "text",
    CONSTRAINT "order_final_price_positive" CHECK ((("final_price" IS NULL) OR ("final_price" >= (0)::numeric))),
    CONSTRAINT "order_price_positive" CHECK (("dynamic_price" >= (0)::numeric)),
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'wallet'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";

--
-- Name: outstanding_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."outstanding_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "due_date" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outstanding_balances_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."outstanding_balances" OWNER TO "postgres";

--
-- Name: package_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."package_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."package_categories" OWNER TO "postgres";

--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_area_id" "uuid" NOT NULL,
    "base_rate" numeric(10,2) NOT NULL,
    "per_km_rate" numeric(10,2) NOT NULL,
    "vat_percentage" numeric(5,2) DEFAULT 7.50 NOT NULL,
    "surge_multiplier" numeric(4,2) DEFAULT 1.00 NOT NULL,
    "min_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "max_price" numeric(10,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pricing_rates_positive" CHECK ((("base_rate" >= (0)::numeric) AND ("per_km_rate" >= (0)::numeric) AND ("surge_multiplier" >= 1.00)))
);


ALTER TABLE "public"."pricing_rules" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "avatar_url" "text",
    "kyc_status" "public"."kyc_status" DEFAULT 'not_submitted'::"public"."kyc_status" NOT NULL,
    "kyc_id_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_banned" boolean DEFAULT false NOT NULL,
    "ban_reason" "text",
    "push_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "public"."promo_discount_type" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "min_order_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "max_discount_amount" numeric(10,2),
    "max_uses" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "max_uses_per_user" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promo_discount_positive" CHECK (("discount_value" > (0)::numeric))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";

--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";

--
-- Name: ratings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "score" integer NOT NULL,
    "review" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rating_score_range" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."ratings" OWNER TO "postgres";

--
-- Name: rider_bank_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."rider_bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "bank_name" "text" NOT NULL,
    "bank_code" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "is_default" boolean DEFAULT true NOT NULL,
    "paystack_recipient_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rider_bank_accounts" OWNER TO "postgres";

--
-- Name: rider_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."rider_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "document_type" "public"."document_type" NOT NULL,
    "document_url" "text" NOT NULL,
    "status" "public"."document_status" DEFAULT 'pending'::"public"."document_status" NOT NULL,
    "rejection_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rider_documents" OWNER TO "postgres";

--
-- Name: rider_location_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."rider_location_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rider_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "location" "public"."geography"(Point,4326) NOT NULL,
    "speed" numeric(6,2),
    "heading" numeric(6,2),
    "accuracy" numeric(8,2),
    "recorded_at" timestamp with time zone NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sequence_number" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rider_location_logs" OWNER TO "postgres";

--
-- Name: rider_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."rider_locations" (
    "rider_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "order_id" "uuid",
    "speed" numeric,
    "heading" numeric,
    "accuracy" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rider_locations" OWNER TO "postgres";

--
-- Name: riders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."riders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "fleet_id" "uuid",
    "vehicle_type" "public"."vehicle_type" NOT NULL,
    "vehicle_plate" "text",
    "vehicle_make" "text",
    "vehicle_model" "text",
    "vehicle_year" integer,
    "vehicle_color" "text",
    "documents_verified" boolean DEFAULT false NOT NULL,
    "is_approved" boolean DEFAULT false NOT NULL,
    "is_online" boolean DEFAULT false NOT NULL,
    "current_location" "public"."geography"(Point,4326),
    "location_updated_at" timestamp with time zone,
    "total_trips" integer DEFAULT 0 NOT NULL,
    "total_earnings" numeric(12,2) DEFAULT 0 NOT NULL,
    "average_rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "rating_count" integer DEFAULT 0 NOT NULL,
    "unpaid_commission_count" integer DEFAULT 0 NOT NULL,
    "is_commission_locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."riders" OWNER TO "postgres";

--
-- Name: saved_addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."saved_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "address" "text" NOT NULL,
    "location" "public"."geography"(Point,4326) NOT NULL,
    "place_id" "text",
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "latitude" double precision,
    "longitude" double precision
);


ALTER TABLE "public"."saved_addresses" OWNER TO "postgres";

--
-- Name: service_areas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."service_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "state" "text",
    "country" "text" DEFAULT 'NG'::"text" NOT NULL,
    "center_location" "public"."geography"(Point,4326),
    "radius_km" numeric(8,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_areas" OWNER TO "postgres";

--
-- Name: sos_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sos_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "location" "public"."geography"(Point,4326),
    "status" "public"."sos_status" DEFAULT 'active'::"public"."sos_status" NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sos_alerts" OWNER TO "postgres";

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "type" "public"."transaction_type" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "balance_before" numeric(12,2) NOT NULL,
    "balance_after" numeric(12,2) NOT NULL,
    "reference" "text" NOT NULL,
    "description" "text",
    "order_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transaction_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";

--
-- Name: wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_type" "public"."wallet_owner_type" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_balance_non_negative" CHECK (("balance" >= (0)::numeric))
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";

--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."withdrawals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "bank_name" "text" NOT NULL,
    "bank_code" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "status" "public"."withdrawal_status" DEFAULT 'pending'::"public"."withdrawal_status" NOT NULL,
    "paystack_transfer_code" "text",
    "paystack_reference" "text",
    "processed_by" "uuid",
    "processed_at" timestamp with time zone,
    "rejection_reason" "text",
    "transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "withdrawal_fee" numeric(18,2) DEFAULT 0 NOT NULL,
    "net_payout" numeric(18,2),
    CONSTRAINT "withdrawal_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."withdrawals" OWNER TO "postgres";

--
-- Name: admin_action_logs admin_action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_action_logs"
    ADD CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id");


--
-- Name: bids bids_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_pkey" PRIMARY KEY ("id");


--
-- Name: cancellations cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cancellations"
    ADD CONSTRAINT "cancellations_pkey" PRIMARY KEY ("id");


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");


--
-- Name: disputes disputes_order_raised_by_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_order_raised_by_unique" UNIQUE ("order_id", "raised_by");


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");


--
-- Name: fleet_invites fleet_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_invites"
    ADD CONSTRAINT "fleet_invites_pkey" PRIMARY KEY ("id");


--
-- Name: fleet_messages fleet_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_messages"
    ADD CONSTRAINT "fleet_messages_pkey" PRIMARY KEY ("id");


--
-- Name: fleets fleets_fleet_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleets"
    ADD CONSTRAINT "fleets_fleet_code_key" UNIQUE ("fleet_code");


--
-- Name: fleets fleets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleets"
    ADD CONSTRAINT "fleets_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");


--
-- Name: outstanding_balances outstanding_balances_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outstanding_balances"
    ADD CONSTRAINT "outstanding_balances_order_id_key" UNIQUE ("order_id");


--
-- Name: outstanding_balances outstanding_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outstanding_balances"
    ADD CONSTRAINT "outstanding_balances_pkey" PRIMARY KEY ("id");


--
-- Name: package_categories package_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."package_categories"
    ADD CONSTRAINT "package_categories_name_key" UNIQUE ("name");


--
-- Name: package_categories package_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."package_categories"
    ADD CONSTRAINT "package_categories_pkey" PRIMARY KEY ("id");


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_key" UNIQUE ("phone");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_code_key" UNIQUE ("code");


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: push_tokens push_tokens_profile_id_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_profile_id_token_key" UNIQUE ("profile_id", "token");


--
-- Name: ratings ratings_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_order_id_key" UNIQUE ("order_id");


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");


--
-- Name: rider_bank_accounts rider_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_bank_accounts"
    ADD CONSTRAINT "rider_bank_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: rider_documents rider_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_documents"
    ADD CONSTRAINT "rider_documents_pkey" PRIMARY KEY ("id");


--
-- Name: rider_location_logs rider_location_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_location_logs"
    ADD CONSTRAINT "rider_location_logs_pkey" PRIMARY KEY ("id");


--
-- Name: rider_locations rider_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_locations"
    ADD CONSTRAINT "rider_locations_pkey" PRIMARY KEY ("rider_id");


--
-- Name: riders riders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_pkey" PRIMARY KEY ("id");


--
-- Name: riders riders_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_profile_id_key" UNIQUE ("profile_id");


--
-- Name: saved_addresses saved_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."saved_addresses"
    ADD CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id");


--
-- Name: service_areas service_areas_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_name_key" UNIQUE ("name");


--
-- Name: service_areas service_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id");


--
-- Name: sos_alerts sos_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sos_alerts"
    ADD CONSTRAINT "sos_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");


--
-- Name: transactions transactions_reference_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_reference_key" UNIQUE ("reference");


--
-- Name: wallets wallet_owner_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallet_owner_unique" UNIQUE ("owner_type", "owner_id");


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id");


--
-- Name: idx_admin_action_logs_admin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_action_logs_admin" ON "public"."admin_action_logs" USING "btree" ("admin_id", "created_at" DESC);


--
-- Name: idx_bids_negotiation_round; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bids_negotiation_round" ON "public"."bids" USING "btree" ("order_id", "negotiation_round");


--
-- Name: idx_bids_one_pending_per_rider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_bids_one_pending_per_rider" ON "public"."bids" USING "btree" ("order_id", "rider_id") WHERE ("status" = 'pending'::"public"."bid_status");


--
-- Name: idx_bids_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bids_order_id" ON "public"."bids" USING "btree" ("order_id");


--
-- Name: idx_bids_parent_bid_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bids_parent_bid_id" ON "public"."bids" USING "btree" ("parent_bid_id") WHERE ("parent_bid_id" IS NOT NULL);


--
-- Name: idx_bids_rider_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bids_rider_id" ON "public"."bids" USING "btree" ("rider_id");


--
-- Name: idx_chat_messages_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_chat_messages_order" ON "public"."chat_messages" USING "btree" ("order_id", "created_at");


--
-- Name: idx_disputes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disputes_status" ON "public"."disputes" USING "btree" ("status");


--
-- Name: idx_fleet_invites_fleet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fleet_invites_fleet" ON "public"."fleet_invites" USING "btree" ("fleet_id");


--
-- Name: idx_fleet_invites_rider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fleet_invites_rider" ON "public"."fleet_invites" USING "btree" ("rider_id");


--
-- Name: idx_fleet_messages_fleet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fleet_messages_fleet" ON "public"."fleet_messages" USING "btree" ("fleet_id", "created_at" DESC);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read") WHERE ("is_read" = false);


--
-- Name: idx_order_status_history_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_status_history_order" ON "public"."order_status_history" USING "btree" ("order_id", "created_at");


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);


--
-- Name: idx_orders_customer_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_customer_status" ON "public"."orders" USING "btree" ("customer_id", "status");


--
-- Name: idx_orders_dropoff_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_dropoff_location" ON "public"."orders" USING "gist" ("dropoff_location");


--
-- Name: idx_orders_pickup_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_pickup_location" ON "public"."orders" USING "gist" ("pickup_location");


--
-- Name: idx_orders_rider_profile_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_rider_profile_id" ON "public"."orders" USING "btree" ("rider_profile_id");


--
-- Name: idx_orders_rider_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_rider_status" ON "public"."orders" USING "btree" ("rider_id", "status");


--
-- Name: idx_orders_service_area; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_service_area" ON "public"."orders" USING "btree" ("service_area_id", "status");


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");


--
-- Name: idx_outstanding_balances_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outstanding_balances_customer_id" ON "public"."outstanding_balances" USING "btree" ("customer_id");


--
-- Name: idx_outstanding_balances_rider_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outstanding_balances_rider_id" ON "public"."outstanding_balances" USING "btree" ("rider_id");


--
-- Name: idx_outstanding_balances_unpaid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outstanding_balances_unpaid" ON "public"."outstanding_balances" USING "btree" ("due_date") WHERE ("paid_at" IS NULL);


--
-- Name: idx_profiles_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_profiles_phone" ON "public"."profiles" USING "btree" ("phone");


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");


--
-- Name: idx_promo_codes_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_codes_code" ON "public"."promo_codes" USING "btree" ("code");


--
-- Name: idx_rider_documents_rider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rider_documents_rider" ON "public"."rider_documents" USING "btree" ("rider_id");


--
-- Name: idx_rider_documents_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rider_documents_status" ON "public"."rider_documents" USING "btree" ("status");


--
-- Name: idx_rider_location_logs_rider_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rider_location_logs_rider_order" ON "public"."rider_location_logs" USING "btree" ("rider_id", "order_id", "recorded_at");


--
-- Name: idx_rider_location_logs_synced; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rider_location_logs_synced" ON "public"."rider_location_logs" USING "btree" ("rider_id", "sequence_number");


--
-- Name: idx_rider_locations_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rider_locations_order_id" ON "public"."rider_locations" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);


--
-- Name: idx_riders_current_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_riders_current_location" ON "public"."riders" USING "gist" ("current_location");


--
-- Name: idx_riders_fleet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_riders_fleet" ON "public"."riders" USING "btree" ("fleet_id") WHERE ("fleet_id" IS NOT NULL);


--
-- Name: idx_saved_addresses_default_per_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_saved_addresses_default_per_user" ON "public"."saved_addresses" USING "btree" ("user_id") WHERE ("is_default" = true);


--
-- Name: idx_saved_addresses_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_saved_addresses_user" ON "public"."saved_addresses" USING "btree" ("user_id");


--
-- Name: idx_sos_alerts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sos_alerts_status" ON "public"."sos_alerts" USING "btree" ("status") WHERE ("status" = 'active'::"public"."sos_status");


--
-- Name: idx_transactions_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_order_id" ON "public"."transactions" USING "btree" ("order_id");


--
-- Name: idx_transactions_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_reference" ON "public"."transactions" USING "btree" ("reference");


--
-- Name: idx_transactions_wallet_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_wallet_created" ON "public"."transactions" USING "btree" ("wallet_id", "created_at" DESC);


--
-- Name: idx_withdrawals_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_withdrawals_status" ON "public"."withdrawals" USING "btree" ("status");


--
-- Name: idx_withdrawals_wallet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_withdrawals_wallet" ON "public"."withdrawals" USING "btree" ("wallet_id", "created_at" DESC);


--
-- Name: push_tokens_profile_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "push_tokens_profile_idx" ON "public"."push_tokens" USING "btree" ("profile_id");


--
-- Name: bids set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."bids" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: disputes set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."disputes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: fleets set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."fleets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pricing_rules set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."pricing_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: promo_codes set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."promo_codes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: rider_bank_accounts set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."rider_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: rider_documents set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."rider_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: riders set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."riders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: saved_addresses set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."saved_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: service_areas set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."service_areas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: sos_alerts set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sos_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: wallets set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."wallets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: withdrawals set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."withdrawals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders trg_sync_order_rider_profile_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_sync_order_rider_profile_id" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_order_rider_profile_id"();


--
-- Name: ratings trg_update_rider_rating; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_update_rider_rating" AFTER INSERT OR UPDATE ON "public"."ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_rider_average_rating"();


--
-- Name: admin_action_logs admin_action_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_action_logs"
    ADD CONSTRAINT "admin_action_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id");


--
-- Name: bids bids_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: bids bids_parent_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_parent_bid_id_fkey" FOREIGN KEY ("parent_bid_id") REFERENCES "public"."bids"("id");


--
-- Name: bids bids_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id");


--
-- Name: cancellations cancellations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cancellations"
    ADD CONSTRAINT "cancellations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");


--
-- Name: cancellations cancellations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cancellations"
    ADD CONSTRAINT "cancellations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");


--
-- Name: chat_messages chat_messages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");


--
-- Name: disputes disputes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");


--
-- Name: disputes disputes_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "public"."profiles"("id");


--
-- Name: disputes disputes_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");


--
-- Name: orders fk_orders_promo_code; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "fk_orders_promo_code" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id");


--
-- Name: fleet_invites fleet_invites_fleet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_invites"
    ADD CONSTRAINT "fleet_invites_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;


--
-- Name: fleet_invites fleet_invites_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_invites"
    ADD CONSTRAINT "fleet_invites_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "public"."profiles"("id");


--
-- Name: fleet_invites fleet_invites_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_invites"
    ADD CONSTRAINT "fleet_invites_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id");


--
-- Name: fleet_messages fleet_messages_fleet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_messages"
    ADD CONSTRAINT "fleet_messages_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE CASCADE;


--
-- Name: fleet_messages fleet_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_messages"
    ADD CONSTRAINT "fleet_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."riders"("id");


--
-- Name: fleet_messages fleet_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleet_messages"
    ADD CONSTRAINT "fleet_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");


--
-- Name: fleets fleets_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fleets"
    ADD CONSTRAINT "fleets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: orders orders_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."package_categories"("id");


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");


--
-- Name: orders orders_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id");


--
-- Name: orders orders_rider_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_rider_profile_id_fkey" FOREIGN KEY ("rider_profile_id") REFERENCES "public"."profiles"("id");


--
-- Name: orders orders_service_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_service_area_id_fkey" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id");


--
-- Name: outstanding_balances outstanding_balances_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outstanding_balances"
    ADD CONSTRAINT "outstanding_balances_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: outstanding_balances outstanding_balances_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outstanding_balances"
    ADD CONSTRAINT "outstanding_balances_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: outstanding_balances outstanding_balances_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outstanding_balances"
    ADD CONSTRAINT "outstanding_balances_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_service_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_service_area_id_fkey" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: push_tokens push_tokens_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: ratings ratings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");


--
-- Name: ratings ratings_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");


--
-- Name: ratings ratings_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id");


--
-- Name: rider_bank_accounts rider_bank_accounts_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_bank_accounts"
    ADD CONSTRAINT "rider_bank_accounts_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE CASCADE;


--
-- Name: rider_documents rider_documents_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_documents"
    ADD CONSTRAINT "rider_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");


--
-- Name: rider_documents rider_documents_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_documents"
    ADD CONSTRAINT "rider_documents_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE CASCADE;


--
-- Name: rider_location_logs rider_location_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_location_logs"
    ADD CONSTRAINT "rider_location_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");


--
-- Name: rider_location_logs rider_location_logs_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_location_logs"
    ADD CONSTRAINT "rider_location_logs_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id");


--
-- Name: rider_locations rider_locations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_locations"
    ADD CONSTRAINT "rider_locations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;


--
-- Name: rider_locations rider_locations_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rider_locations"
    ADD CONSTRAINT "rider_locations_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE CASCADE;


--
-- Name: riders riders_fleet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE SET NULL;


--
-- Name: riders riders_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: saved_addresses saved_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."saved_addresses"
    ADD CONSTRAINT "saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: sos_alerts sos_alerts_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sos_alerts"
    ADD CONSTRAINT "sos_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");


--
-- Name: sos_alerts sos_alerts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sos_alerts"
    ADD CONSTRAINT "sos_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");


--
-- Name: sos_alerts sos_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sos_alerts"
    ADD CONSTRAINT "sos_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");


--
-- Name: transactions transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");


--
-- Name: transactions transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id");


--
-- Name: withdrawals withdrawals_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id");


--
-- Name: withdrawals withdrawals_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id");


--
-- Name: withdrawals withdrawals_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id");


--
-- Name: admin_action_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."admin_action_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: rider_locations admins_read_all_locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins_read_all_locations" ON "public"."rider_locations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'fleet_manager'::"public"."user_role"])) AND ("p"."is_active" = true)))));


--
-- Name: bids; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bids" ENABLE ROW LEVEL SECURITY;

--
-- Name: bids bids_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bids_select_customer" ON "public"."bids" FOR SELECT USING (("public"."get_order_customer_id"("order_id") = "auth"."uid"()));


--
-- Name: bids bids_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bids_select_rider" ON "public"."bids" FOR SELECT USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: cancellations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cancellations" ENABLE ROW LEVEL SECURITY;

--
-- Name: cancellations cancellations_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cancellations_select_customer" ON "public"."cancellations" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."customer_id" = "auth"."uid"()))));


--
-- Name: cancellations cancellations_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cancellations_select_rider" ON "public"."cancellations" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."rider_profile_id" = "auth"."uid"()))));


--
-- Name: package_categories categories_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categories_select_all" ON "public"."package_categories" FOR SELECT USING (("is_active" = true));


--
-- Name: chat_messages chat_insert_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "chat_insert_customer" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("public"."get_order_customer_id"("order_id") = "auth"."uid"())));


--
-- Name: chat_messages chat_insert_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "chat_insert_rider" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("public"."get_order_rider_profile_id"("order_id") = "auth"."uid"())));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "chat_select_admin" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role") AND ("p"."is_active" = true)))));


--
-- Name: chat_messages chat_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "chat_select_customer" ON "public"."chat_messages" FOR SELECT USING (("public"."get_order_customer_id"("order_id") = "auth"."uid"()));


--
-- Name: chat_messages chat_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "chat_select_rider" ON "public"."chat_messages" FOR SELECT USING (("public"."get_order_rider_profile_id"("order_id") = "auth"."uid"()));


--
-- Name: chat_messages chat_update_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "chat_update_read" ON "public"."chat_messages" FOR UPDATE USING ((("sender_id" <> "auth"."uid"()) AND ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE (("orders"."customer_id" = "auth"."uid"()) OR ("orders"."rider_profile_id" = "auth"."uid"()))))));


--
-- Name: outstanding_balances customer_view_own_outstanding; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "customer_view_own_outstanding" ON "public"."outstanding_balances" FOR SELECT USING (("customer_id" = "auth"."uid"()));


--
-- Name: rider_locations customers_read_active_rider_location; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "customers_read_active_rider_location" ON "public"."rider_locations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."rider_id" = "rider_locations"."rider_id") AND ("o"."customer_id" = "auth"."uid"()) AND ("o"."status" = ANY (ARRAY['matched'::"public"."order_status", 'pickup_en_route'::"public"."order_status", 'arrived_pickup'::"public"."order_status", 'in_transit'::"public"."order_status", 'arrived_dropoff'::"public"."order_status"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."bids" "b"
     JOIN "public"."orders" "o" ON (("o"."id" = "b"."order_id")))
  WHERE (("b"."rider_id" = "rider_locations"."rider_id") AND ("o"."customer_id" = "auth"."uid"()) AND ("b"."status" = ANY (ARRAY['pending'::"public"."bid_status", 'countered'::"public"."bid_status"])) AND ("o"."status" = 'pending'::"public"."order_status") AND (("o"."expires_at" IS NULL) OR ("o"."expires_at" > "now"())))))));


--
-- Name: disputes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;

--
-- Name: disputes disputes_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "disputes_insert_own" ON "public"."disputes" FOR INSERT WITH CHECK (("raised_by" = "auth"."uid"()));


--
-- Name: disputes disputes_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "disputes_select_own" ON "public"."disputes" FOR SELECT USING (("raised_by" = "auth"."uid"()));


--
-- Name: fleet_invites fleet_inv_insert_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_inv_insert_rider" ON "public"."fleet_invites" FOR INSERT WITH CHECK (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: fleet_invites fleet_inv_select_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_inv_select_owner" ON "public"."fleet_invites" FOR SELECT USING (("fleet_id" IN ( SELECT "fleets"."id"
   FROM "public"."fleets"
  WHERE ("fleets"."owner_id" = "auth"."uid"()))));


--
-- Name: fleet_invites fleet_inv_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_inv_select_rider" ON "public"."fleet_invites" FOR SELECT USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: fleet_invites fleet_inv_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_inv_update_owner" ON "public"."fleet_invites" FOR UPDATE USING (("fleet_id" IN ( SELECT "fleets"."id"
   FROM "public"."fleets"
  WHERE ("fleets"."owner_id" = "auth"."uid"()))));


--
-- Name: fleet_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fleet_invites" ENABLE ROW LEVEL SECURITY;

--
-- Name: fleet_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fleet_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: fleet_messages fleet_msg_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_msg_insert_owner" ON "public"."fleet_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("fleet_id" IN ( SELECT "fleets"."id"
   FROM "public"."fleets"
  WHERE ("fleets"."owner_id" = "auth"."uid"())))));


--
-- Name: fleet_messages fleet_msg_select_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_msg_select_owner" ON "public"."fleet_messages" FOR SELECT USING (("fleet_id" IN ( SELECT "fleets"."id"
   FROM "public"."fleets"
  WHERE ("fleets"."owner_id" = "auth"."uid"()))));


--
-- Name: fleet_messages fleet_msg_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_msg_select_rider" ON "public"."fleet_messages" FOR SELECT USING ((("fleet_id" = "public"."get_current_rider_fleet_id"()) AND (("is_broadcast" = true) OR ("recipient_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")))));


--
-- Name: fleet_messages fleet_msg_update_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleet_msg_update_rider" ON "public"."fleet_messages" FOR UPDATE USING (("recipient_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: fleets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fleets" ENABLE ROW LEVEL SECURITY;

--
-- Name: fleets fleets_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleets_insert_owner" ON "public"."fleets" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: fleets fleets_select_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleets_select_owner" ON "public"."fleets" FOR SELECT USING (("owner_id" = "auth"."uid"()));


--
-- Name: fleets fleets_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleets_select_rider" ON "public"."fleets" FOR SELECT USING (("id" = "public"."get_current_rider_fleet_id"()));


--
-- Name: fleets fleets_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fleets_update_owner" ON "public"."fleets" FOR UPDATE USING (("owner_id" = "auth"."uid"()));


--
-- Name: rider_location_logs location_logs_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "location_logs_select_customer" ON "public"."rider_location_logs" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE (("orders"."customer_id" = "auth"."uid"()) AND ("orders"."status" = ANY (ARRAY['pickup_en_route'::"public"."order_status", 'arrived_pickup'::"public"."order_status", 'in_transit'::"public"."order_status", 'arrived_dropoff'::"public"."order_status"]))))));


--
-- Name: rider_location_logs location_logs_select_fleet; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "location_logs_select_fleet" ON "public"."rider_location_logs" FOR SELECT USING (("rider_id" IN ( SELECT "riders"."id"
   FROM "public"."riders"
  WHERE ("riders"."fleet_id" IN ( SELECT "fleets"."id"
           FROM "public"."fleets"
          WHERE ("fleets"."owner_id" = "auth"."uid"()))))));


--
-- Name: rider_location_logs location_logs_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "location_logs_select_own" ON "public"."rider_location_logs" FOR SELECT USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));


--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_select_admin" ON "public"."orders" FOR SELECT USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: orders orders_select_assigned_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_select_assigned_rider" ON "public"."orders" FOR SELECT USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: orders orders_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_select_customer" ON "public"."orders" FOR SELECT USING (("customer_id" = "auth"."uid"()));


--
-- Name: orders orders_select_fleet; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_select_fleet" ON "public"."orders" FOR SELECT USING (("rider_id" IN ( SELECT "public"."get_fleet_rider_ids_for_owner"("auth"."uid"()) AS "get_fleet_rider_ids_for_owner")));


--
-- Name: orders orders_select_pending; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_select_pending" ON "public"."orders" FOR SELECT USING ((("status" = 'pending'::"public"."order_status") AND (EXISTS ( SELECT 1
   FROM "public"."riders"
  WHERE ("riders"."profile_id" = "auth"."uid"())))));


--
-- Name: orders orders_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_select_rider" ON "public"."orders" FOR SELECT USING (("rider_profile_id" = "auth"."uid"()));


--
-- Name: orders orders_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders_update_admin" ON "public"."orders" FOR UPDATE USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: outstanding_balances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."outstanding_balances" ENABLE ROW LEVEL SECURITY;

--
-- Name: package_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."package_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pricing_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules pricing_select_active; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pricing_select_active" ON "public"."pricing_rules" FOR SELECT USING (("is_active" = true));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_admin" ON "public"."profiles" FOR SELECT USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));


--
-- Name: profiles profiles_select_rider_active_order; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_rider_active_order" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."can_read_customer_profile_for_assigned_order"("id"));


--
-- Name: profiles profiles_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("role" = ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))) AND ("kyc_status" = ( SELECT "profiles_1"."kyc_status"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))) AND ("is_banned" = ( SELECT "profiles_1"."is_banned"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));


--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes promos_select_active; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "promos_select_active" ON "public"."promo_codes" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));


--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens push_tokens_manage_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "push_tokens_manage_own" ON "public"."push_tokens" TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));


--
-- Name: ratings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ratings ratings_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ratings_select_all" ON "public"."ratings" FOR SELECT USING (true);


--
-- Name: rider_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rider_bank_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: rider_bank_accounts rider_bank_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rider_bank_insert_own" ON "public"."rider_bank_accounts" FOR INSERT WITH CHECK (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: rider_bank_accounts rider_bank_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rider_bank_select_own" ON "public"."rider_bank_accounts" FOR SELECT USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: rider_bank_accounts rider_bank_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rider_bank_update_own" ON "public"."rider_bank_accounts" FOR UPDATE USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: rider_documents rider_docs_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rider_docs_insert_own" ON "public"."rider_documents" FOR INSERT WITH CHECK (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: rider_documents rider_docs_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rider_docs_select_own" ON "public"."rider_documents" FOR SELECT USING (("rider_id" = ( SELECT "public"."get_rider_id"() AS "get_rider_id")));


--
-- Name: rider_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rider_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: rider_location_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rider_location_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: rider_locations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rider_locations" ENABLE ROW LEVEL SECURITY;

--
-- Name: outstanding_balances rider_view_assigned_outstanding; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rider_view_assigned_outstanding" ON "public"."outstanding_balances" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."riders"
  WHERE (("riders"."id" = "outstanding_balances"."rider_id") AND ("riders"."profile_id" = "auth"."uid"())))));


--
-- Name: riders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."riders" ENABLE ROW LEVEL SECURITY;

--
-- Name: riders riders_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_insert_own" ON "public"."riders" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));


--
-- Name: rider_locations riders_manage_own_location; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_manage_own_location" ON "public"."rider_locations" USING ((EXISTS ( SELECT 1
   FROM "public"."riders" "r"
  WHERE (("r"."id" = "rider_locations"."rider_id") AND ("r"."profile_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."riders" "r"
  WHERE (("r"."id" = "rider_locations"."rider_id") AND ("r"."profile_id" = "auth"."uid"())))));


--
-- Name: riders riders_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_select_admin" ON "public"."riders" FOR SELECT USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: riders riders_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_select_customer" ON "public"."riders" FOR SELECT TO "authenticated" USING ("public"."can_read_rider_for_customer_order"("id"));


--
-- Name: riders riders_select_fleet; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_select_fleet" ON "public"."riders" FOR SELECT USING (("fleet_id" IN ( SELECT "fleets"."id"
   FROM "public"."fleets"
  WHERE ("fleets"."owner_id" = "auth"."uid"()))));


--
-- Name: riders riders_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_select_own" ON "public"."riders" FOR SELECT USING (("profile_id" = "auth"."uid"()));


--
-- Name: riders riders_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_update_admin" ON "public"."riders" FOR UPDATE USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: riders riders_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "riders_update_own" ON "public"."riders" FOR UPDATE USING (("profile_id" = "auth"."uid"()));


--
-- Name: outstanding_balances rpc_manage_outstanding; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "rpc_manage_outstanding" ON "public"."outstanding_balances" USING (false) WITH CHECK (false);


--
-- Name: saved_addresses saved_addr_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "saved_addr_delete_own" ON "public"."saved_addresses" FOR DELETE USING (("user_id" = "auth"."uid"()));


--
-- Name: saved_addresses saved_addr_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "saved_addr_insert_own" ON "public"."saved_addresses" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: saved_addresses saved_addr_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "saved_addr_select_own" ON "public"."saved_addresses" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: saved_addresses saved_addr_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "saved_addr_update_own" ON "public"."saved_addresses" FOR UPDATE USING (("user_id" = "auth"."uid"()));


--
-- Name: saved_addresses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."saved_addresses" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_areas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."service_areas" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_areas service_areas_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_areas_select_all" ON "public"."service_areas" FOR SELECT USING (("is_active" = true));


--
-- Name: sos_alerts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sos_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: sos_alerts sos_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sos_insert_own" ON "public"."sos_alerts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: sos_alerts sos_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sos_select_own" ON "public"."sos_alerts" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: order_status_history status_history_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "status_history_customer" ON "public"."order_status_history" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."customer_id" = "auth"."uid"()))));


--
-- Name: order_status_history status_history_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "status_history_rider" ON "public"."order_status_history" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."rider_profile_id" = "auth"."uid"()))));


--
-- Name: order_status_history status_history_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "status_history_select_admin" ON "public"."order_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role") AND ("p"."is_active" = true)))));


--
-- Name: order_status_history status_history_select_customer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "status_history_select_customer" ON "public"."order_status_history" FOR SELECT USING (("public"."get_order_customer_id"("order_id") = "auth"."uid"()));


--
-- Name: order_status_history status_history_select_rider; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "status_history_select_rider" ON "public"."order_status_history" FOR SELECT USING (("public"."get_order_rider_profile_id"("order_id") = "auth"."uid"()));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_select_admin" ON "public"."transactions" FOR SELECT USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: transactions transactions_select_fleet; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_select_fleet" ON "public"."transactions" FOR SELECT USING (("wallet_id" IN ( SELECT "w"."id"
   FROM ("public"."wallets" "w"
     JOIN "public"."fleets" "f" ON ((("w"."owner_id" = "f"."id") AND ("w"."owner_type" = 'fleet'::"public"."wallet_owner_type"))))
  WHERE ("f"."owner_id" = "auth"."uid"()))));


--
-- Name: transactions transactions_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_select_own" ON "public"."transactions" FOR SELECT USING (("wallet_id" IN ( SELECT "wallets"."id"
   FROM "public"."wallets"
  WHERE ("wallets"."owner_id" = "auth"."uid"()))));


--
-- Name: wallets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;

--
-- Name: wallets wallets_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wallets_select_admin" ON "public"."wallets" FOR SELECT USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: wallets wallets_select_fleet; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wallets_select_fleet" ON "public"."wallets" FOR SELECT USING ((("owner_type" = 'fleet'::"public"."wallet_owner_type") AND ("owner_id" IN ( SELECT "fleets"."id"
   FROM "public"."fleets"
  WHERE ("fleets"."owner_id" = "auth"."uid"())))));


--
-- Name: wallets wallets_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wallets_select_own" ON "public"."wallets" FOR SELECT USING (("owner_id" = "auth"."uid"()));


--
-- Name: withdrawals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."withdrawals" ENABLE ROW LEVEL SECURITY;

--
-- Name: withdrawals withdrawals_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "withdrawals_select_own" ON "public"."withdrawals" FOR SELECT USING (("wallet_id" IN ( SELECT "wallets"."id"
   FROM "public"."wallets"
  WHERE ("wallets"."owner_id" = "auth"."uid"()))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "accept_bid"("p_bid_id" "uuid", "p_customer_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."accept_bid"("p_bid_id" "uuid", "p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_bid"("p_bid_id" "uuid", "p_customer_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "accept_customer_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."accept_customer_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_customer_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_customer_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_customer_profile_for_assigned_order"("p_customer_profile_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_read_rider_for_customer_order"("p_rider_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."can_read_rider_for_customer_order"("p_rider_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_rider_for_customer_order"("p_rider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_rider_for_customer_order"("p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_rider_for_customer_order"("p_rider_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "cancel_expired_orders"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."cancel_expired_orders"() TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_expired_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_expired_orders"() TO "service_role";


--
-- Name: FUNCTION "cancel_order"("p_order_id" "uuid", "p_cancelled_by" "public"."cancellation_actor", "p_user_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_cancelled_by" "public"."cancellation_actor", "p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_cancelled_by" "public"."cancellation_actor", "p_user_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "complete_delivery"("p_order_id" "uuid", "p_rider_id" "uuid", "p_pod_photo_url" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_rider_id" "uuid", "p_pod_photo_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_order_id" "uuid", "p_rider_id" "uuid", "p_pod_photo_url" "text") TO "service_role";


--
-- Name: FUNCTION "create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "public"."package_size", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "public"."package_size", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "public"."package_size", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "public"."package_size", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "text", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid", "p_payment_method" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "text", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid", "p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order"("p_customer_id" "uuid", "p_pickup_address" "text", "p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_pickup_contact_name" "text", "p_pickup_contact_phone" "text", "p_dropoff_address" "text", "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_dropoff_contact_name" "text", "p_dropoff_contact_phone" "text", "p_category_id" "uuid", "p_package_size" "text", "p_package_description" "text", "p_package_notes" "text", "p_suggested_price" numeric, "p_promo_code" "text", "p_service_area_id" "uuid", "p_payment_method" "text") TO "service_role";


--
-- Name: FUNCTION "create_wallet"("p_owner_type" "public"."wallet_owner_type", "p_owner_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_wallet"("p_owner_type" "public"."wallet_owner_type", "p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_wallet"("p_owner_type" "public"."wallet_owner_type", "p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_wallet"("p_owner_type" "public"."wallet_owner_type", "p_owner_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "credit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."credit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") TO "service_role";


--
-- Name: FUNCTION "debit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."debit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."debit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debit_wallet"("p_wallet_id" "uuid", "p_amount" numeric, "p_type" "public"."transaction_type", "p_reference" "text", "p_description" "text", "p_order_id" "uuid", "p_metadata" "jsonb") TO "service_role";


--
-- Name: FUNCTION "get_current_rider_fleet_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_current_rider_fleet_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_rider_fleet_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_rider_fleet_id"() TO "service_role";


--
-- Name: FUNCTION "get_fleet_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_fleet_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_fleet_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_fleet_id"() TO "service_role";


--
-- Name: FUNCTION "get_fleet_rider_ids_for_owner"("p_owner_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_fleet_rider_ids_for_owner"("p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_fleet_rider_ids_for_owner"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_fleet_rider_ids_for_owner"("p_owner_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_nearby_orders"("p_rider_id" "uuid", "p_radius_meters" double precision); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_nearby_orders"("p_rider_id" "uuid", "p_radius_meters" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nearby_orders"("p_rider_id" "uuid", "p_radius_meters" double precision) TO "service_role";


--
-- Name: FUNCTION "get_order_customer_id"("p_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_order_customer_id"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_order_customer_id"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_customer_id"("p_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_order_rider_profile_id"("p_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_order_rider_profile_id"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_order_rider_profile_id"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_rider_profile_id"("p_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_price_quote"("p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_package_size" "text", "p_promo_code" "text", "p_service_area_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_price_quote"("p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_package_size" "text", "p_promo_code" "text", "p_service_area_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_price_quote"("p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_package_size" "text", "p_promo_code" "text", "p_service_area_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_price_quote"("p_pickup_lat" double precision, "p_pickup_lng" double precision, "p_dropoff_lat" double precision, "p_dropoff_lng" double precision, "p_package_size" "text", "p_promo_code" "text", "p_service_area_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_rider_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_rider_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_rider_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rider_id"() TO "service_role";


--
-- Name: FUNCTION "get_rider_location_customer_id"("p_rider_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_rider_location_customer_id"("p_rider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rider_location_customer_id"("p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rider_location_customer_id"("p_rider_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_rider_profile_id"("p_rider_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_rider_profile_id"("p_rider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rider_profile_id"("p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rider_profile_id"("p_rider_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_user_role"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "mark_cash_paid"("p_order_id" "uuid", "p_rider_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."mark_cash_paid"("p_order_id" "uuid", "p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_cash_paid"("p_order_id" "uuid", "p_rider_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "place_bid"("p_order_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."place_bid"("p_order_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."place_bid"("p_order_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_bid"("p_order_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) TO "service_role";


--
-- Name: FUNCTION "raise_dispute"("p_order_id" "uuid", "p_subject" "text", "p_description" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."raise_dispute"("p_order_id" "uuid", "p_subject" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."raise_dispute"("p_order_id" "uuid", "p_subject" "text", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "rate_rider"("p_order_id" "uuid", "p_customer_id" "uuid", "p_score" integer, "p_review" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rate_rider"("p_order_id" "uuid", "p_customer_id" "uuid", "p_score" integer, "p_review" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rate_rider"("p_order_id" "uuid", "p_customer_id" "uuid", "p_score" integer, "p_review" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rate_rider"("p_order_id" "uuid", "p_customer_id" "uuid", "p_score" integer, "p_review" "text") TO "service_role";


--
-- Name: FUNCTION "refund_cancelled_order"("p_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."refund_cancelled_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refund_cancelled_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_cancelled_order"("p_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "request_withdrawal"("p_wallet_id" "uuid", "p_amount" numeric, "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text", "p_fee" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."request_withdrawal"("p_wallet_id" "uuid", "p_amount" numeric, "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text", "p_fee" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_withdrawal"("p_wallet_id" "uuid", "p_amount" numeric, "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text", "p_fee" numeric) TO "service_role";


--
-- Name: FUNCTION "rls_auto_enable"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


--
-- Name: FUNCTION "send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_counter_offer"("p_bid_id" "uuid", "p_customer_id" "uuid", "p_amount" numeric) TO "service_role";


--
-- Name: FUNCTION "send_rider_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."send_rider_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."send_rider_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_rider_counter_offer"("p_bid_id" "uuid", "p_rider_id" "uuid", "p_amount" numeric) TO "service_role";


--
-- Name: FUNCTION "submit_rider_application"("p_full_name" "text", "p_email" "text", "p_vehicle_type" "text", "p_vehicle_plate" "text", "p_vehicle_make" "text", "p_vehicle_model" "text", "p_vehicle_year" integer, "p_vehicle_color" "text", "p_documents" "jsonb", "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."submit_rider_application"("p_full_name" "text", "p_email" "text", "p_vehicle_type" "text", "p_vehicle_plate" "text", "p_vehicle_make" "text", "p_vehicle_model" "text", "p_vehicle_year" integer, "p_vehicle_color" "text", "p_documents" "jsonb", "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_rider_application"("p_full_name" "text", "p_email" "text", "p_vehicle_type" "text", "p_vehicle_plate" "text", "p_vehicle_make" "text", "p_vehicle_model" "text", "p_vehicle_year" integer, "p_vehicle_color" "text", "p_documents" "jsonb", "p_bank_name" "text", "p_bank_code" "text", "p_account_number" "text", "p_account_name" "text") TO "service_role";


--
-- Name: FUNCTION "sync_order_rider_profile_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_order_rider_profile_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_order_rider_profile_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_order_rider_profile_id"() TO "service_role";


--
-- Name: FUNCTION "toggle_rider_online"("p_rider_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."toggle_rider_online"("p_rider_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_rider_online"("p_rider_id" "uuid", "p_is_online" boolean, "p_lat" double precision, "p_lng" double precision) TO "service_role";


--
-- Name: FUNCTION "trigger_sos"("p_user_id" "uuid", "p_order_id" "uuid", "p_lat" double precision, "p_lng" double precision); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trigger_sos"("p_user_id" "uuid", "p_order_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_sos"("p_user_id" "uuid", "p_order_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_sos"("p_user_id" "uuid", "p_order_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "service_role";


--
-- Name: FUNCTION "update_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_changed_by" "uuid", "p_reason" "text", "p_metadata" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_changed_by" "uuid", "p_reason" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_changed_by" "uuid", "p_reason" "text", "p_metadata" "jsonb") TO "service_role";


--
-- Name: FUNCTION "update_rider_average_rating"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_rider_average_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rider_average_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rider_average_rating"() TO "service_role";


--
-- Name: FUNCTION "update_rider_location"("p_rider_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_order_id" "uuid", "p_speed" numeric, "p_heading" numeric, "p_accuracy" numeric, "p_recorded_at" timestamp with time zone, "p_sequence_number" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_rider_location"("p_rider_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_order_id" "uuid", "p_speed" numeric, "p_heading" numeric, "p_accuracy" numeric, "p_recorded_at" timestamp with time zone, "p_sequence_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rider_location"("p_rider_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_order_id" "uuid", "p_speed" numeric, "p_heading" numeric, "p_accuracy" numeric, "p_recorded_at" timestamp with time zone, "p_sequence_number" integer) TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "verify_delivery_code"("p_order_id" "uuid", "p_rider_id" "uuid", "p_code" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."verify_delivery_code"("p_order_id" "uuid", "p_rider_id" "uuid", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_delivery_code"("p_order_id" "uuid", "p_rider_id" "uuid", "p_code" "text") TO "service_role";


--
-- Name: FUNCTION "withdraw_bid"("p_bid_id" "uuid", "p_rider_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."withdraw_bid"("p_bid_id" "uuid", "p_rider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."withdraw_bid"("p_bid_id" "uuid", "p_rider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_bid"("p_bid_id" "uuid", "p_rider_id" "uuid") TO "service_role";


--
-- Name: TABLE "admin_action_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."admin_action_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_action_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_action_logs" TO "service_role";


--
-- Name: TABLE "bids"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bids" TO "anon";
GRANT ALL ON TABLE "public"."bids" TO "authenticated";
GRANT ALL ON TABLE "public"."bids" TO "service_role";


--
-- Name: TABLE "cancellations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cancellations" TO "anon";
GRANT ALL ON TABLE "public"."cancellations" TO "authenticated";
GRANT ALL ON TABLE "public"."cancellations" TO "service_role";


--
-- Name: TABLE "chat_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";


--
-- Name: TABLE "disputes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."disputes" TO "anon";
GRANT ALL ON TABLE "public"."disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."disputes" TO "service_role";


--
-- Name: TABLE "fleet_invites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fleet_invites" TO "anon";
GRANT ALL ON TABLE "public"."fleet_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_invites" TO "service_role";


--
-- Name: TABLE "fleet_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fleet_messages" TO "anon";
GRANT ALL ON TABLE "public"."fleet_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."fleet_messages" TO "service_role";


--
-- Name: TABLE "fleets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fleets" TO "anon";
GRANT ALL ON TABLE "public"."fleets" TO "authenticated";
GRANT ALL ON TABLE "public"."fleets" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "order_status_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";


--
-- Name: TABLE "orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";


--
-- Name: TABLE "outstanding_balances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."outstanding_balances" TO "anon";
GRANT ALL ON TABLE "public"."outstanding_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."outstanding_balances" TO "service_role";


--
-- Name: TABLE "package_categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."package_categories" TO "anon";
GRANT ALL ON TABLE "public"."package_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."package_categories" TO "service_role";


--
-- Name: TABLE "pricing_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_rules" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "promo_codes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";


--
-- Name: TABLE "push_tokens"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";


--
-- Name: TABLE "ratings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ratings" TO "anon";
GRANT ALL ON TABLE "public"."ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ratings" TO "service_role";


--
-- Name: TABLE "rider_bank_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rider_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."rider_bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."rider_bank_accounts" TO "service_role";


--
-- Name: TABLE "rider_documents"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rider_documents" TO "anon";
GRANT ALL ON TABLE "public"."rider_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rider_documents" TO "service_role";


--
-- Name: TABLE "rider_location_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rider_location_logs" TO "anon";
GRANT ALL ON TABLE "public"."rider_location_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."rider_location_logs" TO "service_role";


--
-- Name: TABLE "rider_locations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rider_locations" TO "anon";
GRANT ALL ON TABLE "public"."rider_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."rider_locations" TO "service_role";


--
-- Name: TABLE "riders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."riders" TO "anon";
GRANT ALL ON TABLE "public"."riders" TO "authenticated";
GRANT ALL ON TABLE "public"."riders" TO "service_role";


--
-- Name: TABLE "saved_addresses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."saved_addresses" TO "anon";
GRANT ALL ON TABLE "public"."saved_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_addresses" TO "service_role";


--
-- Name: TABLE "service_areas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."service_areas" TO "anon";
GRANT ALL ON TABLE "public"."service_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."service_areas" TO "service_role";


--
-- Name: TABLE "sos_alerts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sos_alerts" TO "anon";
GRANT ALL ON TABLE "public"."sos_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."sos_alerts" TO "service_role";


--
-- Name: TABLE "transactions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";


--
-- Name: TABLE "wallets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";


--
-- Name: TABLE "withdrawals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."withdrawals" TO "anon";
GRANT ALL ON TABLE "public"."withdrawals" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawals" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

\unrestrict An2tlIYvMq24HfJwWkdrsUpg5radeaujnlMvSCIkviLz7B6rWleIBEGCY1nLgTY

