-- ============================================================
-- DZpatch V2.0 — Row Level Security Policies
-- Migration: 00003_rls_policies.sql
--
-- Principle: Users can only see/modify their own data.
-- Admins can see everything. Riders see their assigned orders.
-- All write operations go through RPCs (SECURITY DEFINER),
-- so most tables only need SELECT policies for the client.
-- ============================================================

-- ============================================================
-- HELPER: get current user's role
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- HELPER: get current user's rider ID
-- ============================================================
CREATE OR REPLACE FUNCTION get_rider_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT id FROM riders WHERE profile_id = auth.uid();
$$;

-- ============================================================
-- HELPER: get current user's fleet ID (as fleet manager)
-- ============================================================
CREATE OR REPLACE FUNCTION get_fleet_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT id FROM fleets WHERE owner_id = auth.uid();
$$;

-- ============================================================
-- HELPER: check if current user is admin
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_active = TRUE
    );
$$;


-- ============================================================
-- 1. profiles
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY profiles_select_admin ON profiles
    FOR SELECT USING (is_admin());

-- Users can update their own profile (limited fields via app logic)
CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (id = auth.uid());

-- Admins can update any profile (ban, approve, etc.)
CREATE POLICY profiles_update_admin ON profiles
    FOR UPDATE USING (is_admin());

-- Insert handled by handle_new_user trigger (SECURITY DEFINER)
-- No direct insert policy needed


-- ============================================================
-- 2. fleets
-- ============================================================
ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;

-- Fleet managers can read their own fleet
CREATE POLICY fleets_select_owner ON fleets
    FOR SELECT USING (owner_id = auth.uid());

-- Admins can read all fleets
CREATE POLICY fleets_select_admin ON fleets
    FOR SELECT USING (is_admin());

-- Riders can read the fleet they belong to
CREATE POLICY fleets_select_rider ON fleets
    FOR SELECT USING (
        id IN (SELECT fleet_id FROM riders WHERE profile_id = auth.uid() AND fleet_id IS NOT NULL)
    );

-- Fleet managers can update their own fleet
CREATE POLICY fleets_update_owner ON fleets
    FOR UPDATE USING (owner_id = auth.uid());

-- Fleet managers can insert (create) their fleet
CREATE POLICY fleets_insert_owner ON fleets
    FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Admins can update any fleet
CREATE POLICY fleets_update_admin ON fleets
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 3. riders
-- ============================================================
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;

-- Riders can read their own record
CREATE POLICY riders_select_own ON riders
    FOR SELECT USING (profile_id = auth.uid());

-- Fleet managers can read riders in their fleet
CREATE POLICY riders_select_fleet ON riders
    FOR SELECT USING (
        fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
    );

-- Admins can read all riders
CREATE POLICY riders_select_admin ON riders
    FOR SELECT USING (is_admin());

-- Riders can update their own record (online toggle, vehicle info)
CREATE POLICY riders_update_own ON riders
    FOR UPDATE USING (profile_id = auth.uid());

-- Riders can insert their own record (during signup)
CREATE POLICY riders_insert_own ON riders
    FOR INSERT WITH CHECK (profile_id = auth.uid());

-- Admins can update any rider (approve, ban)
CREATE POLICY riders_update_admin ON riders
    FOR UPDATE USING (is_admin());

-- Customers can read basic rider info for their assigned orders
CREATE POLICY riders_select_customer ON riders
    FOR SELECT USING (
        id IN (
            SELECT rider_id FROM orders
            WHERE customer_id = auth.uid() AND rider_id IS NOT NULL
        )
    );


-- ============================================================
-- 4. rider_documents
-- ============================================================
ALTER TABLE rider_documents ENABLE ROW LEVEL SECURITY;

-- Riders can read their own documents
CREATE POLICY rider_docs_select_own ON rider_documents
    FOR SELECT USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Riders can insert their own documents
CREATE POLICY rider_docs_insert_own ON rider_documents
    FOR INSERT WITH CHECK (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Admins can read all documents (verification queue)
CREATE POLICY rider_docs_select_admin ON rider_documents
    FOR SELECT USING (is_admin());

-- Admins can update documents (approve/reject)
CREATE POLICY rider_docs_update_admin ON rider_documents
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 5. rider_bank_accounts
-- ============================================================
ALTER TABLE rider_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Riders can read their own bank accounts
CREATE POLICY rider_bank_select_own ON rider_bank_accounts
    FOR SELECT USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Riders can insert their own bank accounts
CREATE POLICY rider_bank_insert_own ON rider_bank_accounts
    FOR INSERT WITH CHECK (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Riders can update their own bank accounts
CREATE POLICY rider_bank_update_own ON rider_bank_accounts
    FOR UPDATE USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Admins can read all bank accounts
CREATE POLICY rider_bank_select_admin ON rider_bank_accounts
    FOR SELECT USING (is_admin());


-- ============================================================
-- 6. saved_addresses
-- ============================================================
ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own saved addresses
CREATE POLICY saved_addr_select_own ON saved_addresses
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY saved_addr_insert_own ON saved_addresses
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY saved_addr_update_own ON saved_addresses
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY saved_addr_delete_own ON saved_addresses
    FOR DELETE USING (user_id = auth.uid());


-- ============================================================
-- 7. package_categories
-- ============================================================
ALTER TABLE package_categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read active categories
CREATE POLICY categories_select_all ON package_categories
    FOR SELECT USING (is_active = TRUE);

-- Admins can read all (including inactive)
CREATE POLICY categories_select_admin ON package_categories
    FOR SELECT USING (is_admin());

-- Admins can insert/update categories
CREATE POLICY categories_insert_admin ON package_categories
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY categories_update_admin ON package_categories
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 8. service_areas
-- ============================================================
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;

-- Everyone can read active service areas
CREATE POLICY service_areas_select_all ON service_areas
    FOR SELECT USING (is_active = TRUE);

-- Admins can read all
CREATE POLICY service_areas_select_admin ON service_areas
    FOR SELECT USING (is_admin());

-- Admins can insert/update
CREATE POLICY service_areas_insert_admin ON service_areas
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY service_areas_update_admin ON service_areas
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 9. pricing_rules
-- ============================================================
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

-- Everyone can read active pricing rules (needed for price display)
CREATE POLICY pricing_select_active ON pricing_rules
    FOR SELECT USING (is_active = TRUE);

-- Admins can read all
CREATE POLICY pricing_select_admin ON pricing_rules
    FOR SELECT USING (is_admin());

-- Admins can insert/update
CREATE POLICY pricing_insert_admin ON pricing_rules
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY pricing_update_admin ON pricing_rules
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 10. orders
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Customers can read their own orders
CREATE POLICY orders_select_customer ON orders
    FOR SELECT USING (customer_id = auth.uid());

-- Riders can read orders assigned to them
CREATE POLICY orders_select_rider ON orders
    FOR SELECT USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Riders can read pending orders (for job feed — filtered by RPC, but need base SELECT)
CREATE POLICY orders_select_pending ON orders
    FOR SELECT USING (
        status = 'pending'
        AND get_user_role() = 'rider'
    );

-- Fleet managers can read orders assigned to their fleet's riders
CREATE POLICY orders_select_fleet ON orders
    FOR SELECT USING (
        rider_id IN (
            SELECT id FROM riders
            WHERE fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
        )
    );

-- Admins can read all orders
CREATE POLICY orders_select_admin ON orders
    FOR SELECT USING (is_admin());

-- No direct INSERT/UPDATE — all via RPCs (SECURITY DEFINER)


-- ============================================================
-- 11. bids
-- ============================================================
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Riders can read their own bids
CREATE POLICY bids_select_rider ON bids
    FOR SELECT USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Customers can read bids on their orders
CREATE POLICY bids_select_customer ON bids
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
    );

-- Admins can read all bids
CREATE POLICY bids_select_admin ON bids
    FOR SELECT USING (is_admin());

-- No direct INSERT/UPDATE — all via RPCs


-- ============================================================
-- 12. order_status_history
-- ============================================================
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Customers can read history for their orders
CREATE POLICY status_history_customer ON order_status_history
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
    );

-- Riders can read history for their assigned orders
CREATE POLICY status_history_rider ON order_status_history
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders
            WHERE rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
        )
    );

-- Admins can read all
CREATE POLICY status_history_admin ON order_status_history
    FOR SELECT USING (is_admin());


-- ============================================================
-- 13. wallets
-- ============================================================
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Users can read their own wallet
CREATE POLICY wallets_select_own ON wallets
    FOR SELECT USING (owner_id = auth.uid());

-- Fleet managers can read their fleet wallet
CREATE POLICY wallets_select_fleet ON wallets
    FOR SELECT USING (
        owner_type = 'fleet'
        AND owner_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
    );

-- Admins can read all wallets
CREATE POLICY wallets_select_admin ON wallets
    FOR SELECT USING (is_admin());

-- No direct INSERT/UPDATE — all via RPCs


-- ============================================================
-- 14. transactions
-- ============================================================
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users can read transactions for their wallet
CREATE POLICY transactions_select_own ON transactions
    FOR SELECT USING (
        wallet_id IN (SELECT id FROM wallets WHERE owner_id = auth.uid())
    );

-- Fleet managers can read transactions for their fleet wallet
CREATE POLICY transactions_select_fleet ON transactions
    FOR SELECT USING (
        wallet_id IN (
            SELECT w.id FROM wallets w
            JOIN fleets f ON w.owner_id = f.id AND w.owner_type = 'fleet'
            WHERE f.owner_id = auth.uid()
        )
    );

-- Admins can read all transactions
CREATE POLICY transactions_select_admin ON transactions
    FOR SELECT USING (is_admin());


-- ============================================================
-- 15. withdrawals
-- ============================================================
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- Users can read their own withdrawals
CREATE POLICY withdrawals_select_own ON withdrawals
    FOR SELECT USING (
        wallet_id IN (SELECT id FROM wallets WHERE owner_id = auth.uid())
    );

-- Admins can read all withdrawals
CREATE POLICY withdrawals_select_admin ON withdrawals
    FOR SELECT USING (is_admin());

-- Admins can update withdrawals (approve/reject)
CREATE POLICY withdrawals_update_admin ON withdrawals
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 16. chat_messages
-- ============================================================
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Customers can read/write chat for their orders
CREATE POLICY chat_select_customer ON chat_messages
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
    );

CREATE POLICY chat_insert_customer ON chat_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
    );

-- Riders can read/write chat for their assigned orders
CREATE POLICY chat_select_rider ON chat_messages
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders
            WHERE rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
        )
    );

CREATE POLICY chat_insert_rider ON chat_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND order_id IN (
            SELECT id FROM orders
            WHERE rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
        )
    );

-- Users can mark messages as read
CREATE POLICY chat_update_read ON chat_messages
    FOR UPDATE USING (
        -- Can only mark as read messages sent TO you (not by you)
        sender_id != auth.uid()
        AND order_id IN (
            SELECT id FROM orders
            WHERE customer_id = auth.uid()
            OR rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
        )
    );

-- Admins can read all chat (for disputes)
CREATE POLICY chat_select_admin ON chat_messages
    FOR SELECT USING (is_admin());


-- ============================================================
-- 17. notifications
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY notifications_select_own ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- No direct INSERT — all via RPCs or triggers


-- ============================================================
-- 18. ratings
-- ============================================================
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Anyone can read ratings (public)
CREATE POLICY ratings_select_all ON ratings
    FOR SELECT USING (TRUE);

-- No direct INSERT — via rate_rider RPC


-- ============================================================
-- 19. promo_codes
-- ============================================================
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active promo codes (for validation)
CREATE POLICY promos_select_active ON promo_codes
    FOR SELECT USING (
        is_active = TRUE
        AND starts_at <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
    );

-- Admins can read all promo codes
CREATE POLICY promos_select_admin ON promo_codes
    FOR SELECT USING (is_admin());

-- Admins can insert/update promo codes
CREATE POLICY promos_insert_admin ON promo_codes
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY promos_update_admin ON promo_codes
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 20. sos_alerts
-- ============================================================
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;

-- Users can read their own SOS alerts
CREATE POLICY sos_select_own ON sos_alerts
    FOR SELECT USING (user_id = auth.uid());

-- Users can create SOS alerts
CREATE POLICY sos_insert_own ON sos_alerts
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins can read all SOS alerts
CREATE POLICY sos_select_admin ON sos_alerts
    FOR SELECT USING (is_admin());

-- Admins can update SOS alerts (resolve)
CREATE POLICY sos_update_admin ON sos_alerts
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 21. cancellations
-- ============================================================
ALTER TABLE cancellations ENABLE ROW LEVEL SECURITY;

-- Customers can read cancellations for their orders
CREATE POLICY cancellations_select_customer ON cancellations
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid())
    );

-- Riders can read cancellations for their assigned orders
CREATE POLICY cancellations_select_rider ON cancellations
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders
            WHERE rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
        )
    );

-- Admins can read all
CREATE POLICY cancellations_select_admin ON cancellations
    FOR SELECT USING (is_admin());

-- No direct INSERT — via cancel_order RPC


-- ============================================================
-- 22. disputes
-- ============================================================
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Users can read disputes they raised
CREATE POLICY disputes_select_own ON disputes
    FOR SELECT USING (raised_by = auth.uid());

-- Users can create disputes
CREATE POLICY disputes_insert_own ON disputes
    FOR INSERT WITH CHECK (raised_by = auth.uid());

-- Admins can read all disputes
CREATE POLICY disputes_select_admin ON disputes
    FOR SELECT USING (is_admin());

-- Admins can update disputes (resolve)
CREATE POLICY disputes_update_admin ON disputes
    FOR UPDATE USING (is_admin());


-- ============================================================
-- 23. admin_action_logs
-- ============================================================
ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY admin_logs_select ON admin_action_logs
    FOR SELECT USING (is_admin());

-- Only admins can insert logs
CREATE POLICY admin_logs_insert ON admin_action_logs
    FOR INSERT WITH CHECK (is_admin());


-- ============================================================
-- 24. rider_location_logs
-- ============================================================
ALTER TABLE rider_location_logs ENABLE ROW LEVEL SECURITY;

-- Riders can read their own location logs
CREATE POLICY location_logs_select_own ON rider_location_logs
    FOR SELECT USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Customers can read location logs for their active orders (for live tracking)
CREATE POLICY location_logs_select_customer ON rider_location_logs
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders
            WHERE customer_id = auth.uid()
            AND status IN ('pickup_en_route', 'arrived_pickup', 'in_transit', 'arrived_dropoff')
        )
    );

-- Fleet managers can read logs for their fleet's riders
CREATE POLICY location_logs_select_fleet ON rider_location_logs
    FOR SELECT USING (
        rider_id IN (
            SELECT id FROM riders
            WHERE fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
        )
    );

-- Admins can read all
CREATE POLICY location_logs_select_admin ON rider_location_logs
    FOR SELECT USING (is_admin());

-- No direct INSERT — via update_rider_location RPC


-- ============================================================
-- 25. fleet_messages
-- ============================================================
ALTER TABLE fleet_messages ENABLE ROW LEVEL SECURITY;

-- Fleet managers can read messages for their fleet
CREATE POLICY fleet_msg_select_owner ON fleet_messages
    FOR SELECT USING (
        fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
    );

-- Fleet managers can insert messages
CREATE POLICY fleet_msg_insert_owner ON fleet_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
    );

-- Riders can read messages in their fleet (broadcast + direct)
CREATE POLICY fleet_msg_select_rider ON fleet_messages
    FOR SELECT USING (
        fleet_id IN (SELECT fleet_id FROM riders WHERE profile_id = auth.uid() AND fleet_id IS NOT NULL)
        AND (is_broadcast = TRUE OR recipient_id IN (SELECT id FROM riders WHERE profile_id = auth.uid()))
    );

-- Riders can mark messages as read
CREATE POLICY fleet_msg_update_rider ON fleet_messages
    FOR UPDATE USING (
        recipient_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Admins can read all
CREATE POLICY fleet_msg_select_admin ON fleet_messages
    FOR SELECT USING (is_admin());


-- ============================================================
-- 26. fleet_invites
-- ============================================================
ALTER TABLE fleet_invites ENABLE ROW LEVEL SECURITY;

-- Fleet managers can read invites for their fleet
CREATE POLICY fleet_inv_select_owner ON fleet_invites
    FOR SELECT USING (
        fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
    );

-- Fleet managers can update (remove rider)
CREATE POLICY fleet_inv_update_owner ON fleet_invites
    FOR UPDATE USING (
        fleet_id IN (SELECT id FROM fleets WHERE owner_id = auth.uid())
    );

-- Riders can read their own invite status
CREATE POLICY fleet_inv_select_rider ON fleet_invites
    FOR SELECT USING (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Riders can insert (join fleet via code)
CREATE POLICY fleet_inv_insert_rider ON fleet_invites
    FOR INSERT WITH CHECK (
        rider_id IN (SELECT id FROM riders WHERE profile_id = auth.uid())
    );

-- Admins can read all
CREATE POLICY fleet_inv_select_admin ON fleet_invites
    FOR SELECT USING (is_admin());


-- ============================================================
-- DONE
-- RLS enabled on all 26 tables.
-- 4 helper functions, 70+ policies.
-- ============================================================
