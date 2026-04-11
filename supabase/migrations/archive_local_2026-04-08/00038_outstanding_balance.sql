-- ============================================================
-- DZpatch V2.0 — Sprint 1: Cash order outstanding balance tracking
-- Migration: 00038_outstanding_balance.sql
--
-- PROBLEM: Cash-payment orders have no tracking mechanism.
-- When complete_delivery fires, wallet-paid orders credit the rider.
-- Cash orders do nothing — the rider was paid in person, but the
-- platform has no record of whether the customer actually paid,
-- and no way to reconcile or follow up.
--
-- FIX:
-- 1. Create outstanding_balances table to record cash delivery debts
-- 2. Patch complete_delivery: for cash orders, insert outstanding_balance
--    instead of (not) crediting rider wallet
-- 3. Add RLS so customers see only their own balances
-- 4. Add helper function mark_cash_paid (admin/rider use)
-- ============================================================

-- ── 1. Create outstanding_balances table ───────────────────────
CREATE TABLE IF NOT EXISTS outstanding_balances (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    order_id    UUID NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    rider_id    UUID NOT NULL REFERENCES riders(id)   ON DELETE CASCADE,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    due_date    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    paid_at     TIMESTAMPTZ DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)  -- one record per order
);

CREATE INDEX IF NOT EXISTS idx_outstanding_balances_customer_id
    ON outstanding_balances(customer_id);
CREATE INDEX IF NOT EXISTS idx_outstanding_balances_rider_id
    ON outstanding_balances(rider_id);
CREATE INDEX IF NOT EXISTS idx_outstanding_balances_unpaid
    ON outstanding_balances(due_date)
    WHERE paid_at IS NULL;

-- ── 2. RLS policies ────────────────────────────────────────────
ALTER TABLE outstanding_balances ENABLE ROW LEVEL SECURITY;

-- Customers see their own balances
CREATE POLICY "customer_view_own_outstanding"
ON outstanding_balances FOR SELECT
USING (customer_id = auth.uid());

-- Riders see balances where they are the rider
CREATE POLICY "rider_view_assigned_outstanding"
ON outstanding_balances FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM riders
        WHERE riders.id = outstanding_balances.rider_id
          AND riders.profile_id = auth.uid()
    )
);

-- Only RPCs (SECURITY DEFINER) insert/update
CREATE POLICY "rpc_manage_outstanding"
ON outstanding_balances FOR ALL
USING (FALSE)
WITH CHECK (FALSE);

-- ── 3. Patch complete_delivery: handle cash orders ─────────────
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
    v_order           orders%ROWTYPE;
    v_rider           riders%ROWTYPE;
    v_commission_rate NUMERIC;
    v_commission      NUMERIC;
    v_rider_earnings  NUMERIC;
    v_rider_wallet    UUID;
    v_platform_wallet UUID;
    v_unpaid_count    INT;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'arrived_dropoff' THEN
        RAISE EXCEPTION 'Order must be in arrived_dropoff status (current: %)', v_order.status;
    END IF;

    -- Require delivery code verified (set by migration 00037)
    IF NOT COALESCE(v_order.delivery_code_verified, FALSE) THEN
        RAISE EXCEPTION 'Delivery code must be verified before marking complete';
    END IF;

    SELECT * INTO v_rider FROM riders WHERE id = p_rider_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF v_order.rider_id != p_rider_id THEN
        RAISE EXCEPTION 'Rider is not assigned to this order';
    END IF;

    v_commission_rate := COALESCE(v_rider.commission_rate, 0.10);
    v_commission      := ROUND(COALESCE(v_order.final_price, 0) * v_commission_rate, 2);
    v_rider_earnings  := COALESCE(v_order.final_price, 0) - v_commission;

    UPDATE orders SET
        status        = 'delivered',
        pod_photo_url = COALESCE(p_pod_photo_url, pod_photo_url),
        updated_at    = NOW()
    WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (p_order_id, 'arrived_dropoff', 'delivered', auth.uid());

    IF v_order.payment_method = 'wallet' THEN
        -- Wallet: credit rider and platform immediately
        SELECT id INTO v_rider_wallet FROM wallets
        WHERE owner_type = 'rider' AND owner_id = p_rider_id;

        IF v_rider_wallet IS NOT NULL AND v_rider_earnings > 0 THEN
            PERFORM credit_wallet(
                v_rider_wallet, v_rider_earnings, 'earning',
                'EARN-' || p_order_id::TEXT, 'Delivery earnings', p_order_id
            );
        END IF;

        SELECT id INTO v_platform_wallet FROM wallets WHERE owner_type = 'platform' LIMIT 1;
        IF v_platform_wallet IS NOT NULL AND v_commission > 0 THEN
            PERFORM credit_wallet(
                v_platform_wallet, v_commission, 'commission',
                'COMM-' || p_order_id::TEXT, 'Platform commission', p_order_id
            );
        END IF;

    ELSIF v_order.payment_method = 'cash' THEN
        -- Cash: rider collected in person. Record the outstanding balance so
        -- the platform can track and follow up on commission reconciliation.
        INSERT INTO outstanding_balances (customer_id, order_id, rider_id, amount)
        VALUES (v_order.customer_id, p_order_id, p_rider_id, v_order.final_price)
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    -- Commission lock check
    SELECT COUNT(*) INTO v_unpaid_count
    FROM orders
    WHERE rider_id = p_rider_id
      AND status = 'delivered'
      AND payment_method = 'wallet'
      AND id NOT IN (
          SELECT DISTINCT reference::UUID FROM transactions
          WHERE owner_id = p_rider_id AND type = 'commission'
          LIMIT 1000
      );
    IF v_unpaid_count >= 2 THEN
        UPDATE riders SET is_commission_locked = TRUE WHERE id = p_rider_id;
    END IF;

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
        'final_price',    v_order.final_price,
        'payment_method', v_order.payment_method
    );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery(UUID, UUID, TEXT) TO authenticated;

-- ── 4. mark_cash_paid helper (for rider/admin to confirm receipt) ──
CREATE OR REPLACE FUNCTION mark_cash_paid(
    p_order_id  UUID,
    p_rider_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance outstanding_balances%ROWTYPE;
BEGIN
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

GRANT EXECUTE ON FUNCTION mark_cash_paid(UUID, UUID) TO authenticated;
