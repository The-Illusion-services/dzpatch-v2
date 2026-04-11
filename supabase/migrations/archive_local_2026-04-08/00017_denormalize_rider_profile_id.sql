-- ============================================================
-- DZpatch V2.0 — Denormalize rider_profile_id onto orders
-- Migration: 00017_denormalize_rider_profile_id.sql
--
-- Adds rider_profile_id column to orders table so RLS policies
-- can use direct auth.uid() checks instead of cross-table joins
-- that cause 42P17 infinite recursion.
-- ============================================================

-- 1. Add column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_profile_id UUID REFERENCES profiles(id);

-- 2. Backfill existing rows that already have a rider_id
UPDATE orders o
SET rider_profile_id = r.profile_id
FROM riders r
WHERE o.rider_id = r.id
  AND o.rider_profile_id IS NULL;

-- 3. Index for fast policy evaluation
CREATE INDEX IF NOT EXISTS idx_orders_rider_profile_id ON orders(rider_profile_id);

-- 4. Keep rider_profile_id in sync when rider_id is set
--    (triggered on accept_bid which sets rider_id)
CREATE OR REPLACE FUNCTION sync_order_rider_profile_id()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.rider_id IS NOT NULL AND (OLD.rider_id IS DISTINCT FROM NEW.rider_id) THEN
        SELECT profile_id INTO NEW.rider_profile_id
        FROM riders WHERE id = NEW.rider_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_rider_profile_id ON orders;
CREATE TRIGGER trg_sync_order_rider_profile_id
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION sync_order_rider_profile_id();

-- 5. Drop ALL old recursive policies and replace with clean ones

-- orders: rider can see their own orders via rider_profile_id (no riders table join)
DROP POLICY IF EXISTS orders_select_rider ON orders;
CREATE POLICY orders_select_rider ON orders FOR SELECT
USING (rider_profile_id = auth.uid());

-- orders: fleet owner sees orders their riders delivered
DROP POLICY IF EXISTS orders_select_fleet ON orders;
CREATE POLICY orders_select_fleet ON orders FOR SELECT
USING (rider_id IN (SELECT get_fleet_rider_ids_for_owner(auth.uid())));

-- bids: rider sees their own bids (use get_rider_id fence — already SECURITY DEFINER plpgsql)
DROP POLICY IF EXISTS bids_select_rider ON bids;
CREATE POLICY bids_select_rider ON bids FOR SELECT
USING (rider_id = (SELECT get_rider_id()));

-- cancellations: rider sees cancellations on their orders
DROP POLICY IF EXISTS cancellations_select_rider ON cancellations;
CREATE POLICY cancellations_select_rider ON cancellations FOR SELECT
USING (order_id IN (
    SELECT id FROM orders WHERE rider_profile_id = auth.uid()
));

-- chat: rider sees/sends messages on their orders
DROP POLICY IF EXISTS chat_select_rider ON chat_messages;
CREATE POLICY chat_select_rider ON chat_messages FOR SELECT
USING (order_id IN (
    SELECT id FROM orders WHERE rider_profile_id = auth.uid()
));

DROP POLICY IF EXISTS chat_insert_rider ON chat_messages;
CREATE POLICY chat_insert_rider ON chat_messages FOR INSERT
WITH CHECK (
    sender_id = auth.uid()
    AND order_id IN (SELECT id FROM orders WHERE rider_profile_id = auth.uid())
);

DROP POLICY IF EXISTS chat_update_read ON chat_messages;
CREATE POLICY chat_update_read ON chat_messages FOR UPDATE
USING (
    sender_id <> auth.uid()
    AND order_id IN (
        SELECT id FROM orders
        WHERE customer_id = auth.uid() OR rider_profile_id = auth.uid()
    )
);

-- order_status_history: rider sees history of their orders
DROP POLICY IF EXISTS status_history_rider ON order_status_history;
CREATE POLICY status_history_rider ON order_status_history FOR SELECT
USING (order_id IN (
    SELECT id FROM orders WHERE rider_profile_id = auth.uid()
));

-- rider_location_logs: rider sees their own logs
DROP POLICY IF EXISTS location_logs_select_own ON rider_location_logs;
CREATE POLICY location_logs_select_own ON rider_location_logs FOR SELECT
USING (rider_id = (SELECT get_rider_id()));

-- rider_bank_accounts
DROP POLICY IF EXISTS rider_bank_select_own ON rider_bank_accounts;
CREATE POLICY rider_bank_select_own ON rider_bank_accounts FOR SELECT
USING (rider_id = (SELECT get_rider_id()));

DROP POLICY IF EXISTS rider_bank_insert_own ON rider_bank_accounts;
CREATE POLICY rider_bank_insert_own ON rider_bank_accounts FOR INSERT
WITH CHECK (rider_id = (SELECT get_rider_id()));

DROP POLICY IF EXISTS rider_bank_update_own ON rider_bank_accounts;
CREATE POLICY rider_bank_update_own ON rider_bank_accounts FOR UPDATE
USING (rider_id = (SELECT get_rider_id()));

-- rider_documents
DROP POLICY IF EXISTS rider_docs_select_own ON rider_documents;
CREATE POLICY rider_docs_select_own ON rider_documents FOR SELECT
USING (rider_id = (SELECT get_rider_id()));

DROP POLICY IF EXISTS rider_docs_insert_own ON rider_documents;
CREATE POLICY rider_docs_insert_own ON rider_documents FOR INSERT
WITH CHECK (rider_id = (SELECT get_rider_id()));

-- fleet_invites
DROP POLICY IF EXISTS fleet_inv_select_rider ON fleet_invites;
CREATE POLICY fleet_inv_select_rider ON fleet_invites FOR SELECT
USING (rider_id = (SELECT get_rider_id()));

DROP POLICY IF EXISTS fleet_inv_insert_rider ON fleet_invites;
CREATE POLICY fleet_inv_insert_rider ON fleet_invites FOR INSERT
WITH CHECK (rider_id = (SELECT get_rider_id()));

-- fleet_messages
DROP POLICY IF EXISTS fleet_msg_select_rider ON fleet_messages;
CREATE POLICY fleet_msg_select_rider ON fleet_messages FOR SELECT
USING (
    fleet_id = get_current_rider_fleet_id()
    AND (is_broadcast = true OR recipient_id = (SELECT get_rider_id()))
);

DROP POLICY IF EXISTS fleet_msg_update_rider ON fleet_messages;
CREATE POLICY fleet_msg_update_rider ON fleet_messages FOR UPDATE
USING (recipient_id = (SELECT get_rider_id()));

-- fleets
DROP POLICY IF EXISTS fleets_select_rider ON fleets;
CREATE POLICY fleets_select_rider ON fleets FOR SELECT
USING (id = get_current_rider_fleet_id());

-- riders_select_customer: customer sees rider on their active order
DROP POLICY IF EXISTS riders_select_customer ON riders;
CREATE POLICY riders_select_customer ON riders FOR SELECT
USING (
    id IN (
        SELECT rider_id FROM orders
        WHERE customer_id = auth.uid()
        AND rider_id IS NOT NULL
    )
);
