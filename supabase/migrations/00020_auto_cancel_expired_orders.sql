-- ============================================================
-- DZpatch V2.0 — Auto-cancel expired pending orders
-- Migration: 00020_auto_cancel_expired_orders.sql
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_expired_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
    v_order_id UUID;
BEGIN
    v_count := 0;

    FOR v_order_id IN
        SELECT id FROM orders
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
    LOOP
        UPDATE orders SET status = 'cancelled' WHERE id = v_order_id;

        INSERT INTO cancellations (order_id, cancelled_by, user_id, reason, penalty_amount)
        VALUES (v_order_id, 'system', NULL, 'Order expired — no rider found in time', 0)
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- Schedule with pg_cron if available (runs every 5 minutes)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('cancel-expired-orders', '*/5 * * * *', 'SELECT cancel_expired_orders()');
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$;
