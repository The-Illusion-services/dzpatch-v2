-- ============================================================
-- DZpatch V2.0 — Complete Database Schema
-- Migration: 00001_core_schema.sql
--
-- 26 tables, all ENUMs, indexes, and constraints.
-- Requires: PostGIS extension (for spatial queries)
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM (
    'customer',
    'rider',
    'fleet_manager',
    'admin'
);

CREATE TYPE kyc_status AS ENUM (
    'not_submitted',
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE order_status AS ENUM (
    'pending',          -- created, waiting for rider match
    'matched',          -- rider accepted / bid accepted
    'pickup_en_route',  -- rider heading to pickup
    'arrived_pickup',   -- rider at pickup location
    'in_transit',       -- package picked up, heading to dropoff
    'arrived_dropoff',  -- rider at dropoff location
    'delivered',        -- handoff complete (OTP + POD)
    'completed',        -- post-delivery finalized (rated, paid out)
    'cancelled'         -- cancelled by customer, rider, or system
);

CREATE TYPE bid_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'countered',
    'expired'
);

CREATE TYPE package_size AS ENUM (
    'small',    -- fits in hand
    'medium',   -- fits in bag/basket
    'large',    -- needs carrier/rack
    'extra_large'  -- needs truck/van
);

CREATE TYPE vehicle_type AS ENUM (
    'bicycle',
    'motorcycle',
    'car',
    'van',
    'truck'
);

CREATE TYPE document_type AS ENUM (
    'drivers_license',
    'vehicle_insurance',
    'plate_photo',
    'national_id',
    'other'
);

CREATE TYPE document_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE wallet_owner_type AS ENUM (
    'customer',
    'rider',
    'fleet',
    'platform'
);

CREATE TYPE transaction_type AS ENUM (
    'credit',             -- wallet funding
    'debit',              -- payment for order
    'commission_credit',  -- platform/fleet receives commission
    'commission_debit',   -- deducted from rider earnings
    'withdrawal',         -- withdrawal to bank
    'refund',             -- refund to customer
    'adjustment'          -- manual admin adjustment
);

CREATE TYPE withdrawal_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'rejected'
);

CREATE TYPE notification_type AS ENUM (
    'order_update',
    'payment',
    'promo',
    'system',
    'chat',
    'sos'
);

CREATE TYPE sos_status AS ENUM (
    'active',
    'acknowledged',
    'resolved'
);

CREATE TYPE dispute_status AS ENUM (
    'open',
    'investigating',
    'resolved',
    'dismissed'
);

CREATE TYPE cancellation_actor AS ENUM (
    'customer',
    'rider',
    'system',
    'admin'
);

CREATE TYPE fleet_pay_structure AS ENUM (
    'percentage',   -- fleet takes X% of rider earnings
    'flat_rate'     -- fleet takes flat amount per delivery
);

CREATE TYPE promo_discount_type AS ENUM (
    'percentage',
    'flat'
);

-- ============================================================
-- TABLE 1: profiles
-- Extends auth.users. One role per account.
-- ============================================================
CREATE TABLE profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role            user_role NOT NULL,
    full_name       TEXT NOT NULL,
    phone           TEXT NOT NULL UNIQUE,
    email           TEXT,
    avatar_url      TEXT,
    kyc_status      kyc_status NOT NULL DEFAULT 'not_submitted',
    kyc_id_url      TEXT,            -- uploaded ID document URL
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason      TEXT,
    push_token      TEXT,            -- expo push notification token
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: fleets
-- Fleet organizations.
-- ============================================================
CREATE TABLE fleets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    logo_url        TEXT,
    fleet_code      TEXT NOT NULL UNIQUE,  -- riders join via this code
    commission_type fleet_pay_structure NOT NULL DEFAULT 'percentage',
    commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,  -- percentage or flat amount
    payout_schedule TEXT NOT NULL DEFAULT 'weekly',        -- weekly, biweekly, monthly
    bank_name       TEXT,
    bank_account_number TEXT,
    bank_account_name   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fleet_commission_rate_positive CHECK (commission_rate >= 0)
);

-- ============================================================
-- TABLE 3: riders
-- Rider-specific data. Linked to profiles + optionally to fleet.
-- ============================================================
CREATE TABLE riders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id          UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    fleet_id            UUID REFERENCES fleets(id) ON DELETE SET NULL,
    vehicle_type        vehicle_type NOT NULL,
    vehicle_plate       TEXT,
    vehicle_make        TEXT,
    vehicle_model       TEXT,
    vehicle_year        INT,
    vehicle_color       TEXT,

    -- Verification
    documents_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    is_approved         BOOLEAN NOT NULL DEFAULT FALSE,  -- admin approval gate

    -- Live state
    is_online           BOOLEAN NOT NULL DEFAULT FALSE,
    current_location    GEOGRAPHY(Point, 4326),  -- PostGIS point (lng, lat)
    location_updated_at TIMESTAMPTZ,

    -- Stats (denormalized for performance)
    total_trips         INT NOT NULL DEFAULT 0,
    total_earnings      NUMERIC(12,2) NOT NULL DEFAULT 0,
    average_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count        INT NOT NULL DEFAULT 0,

    -- Commission lock
    unpaid_commission_count INT NOT NULL DEFAULT 0,  -- orders where commission not yet settled
    is_commission_locked    BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 4: rider_documents
-- Document uploads for verification.
-- ============================================================
CREATE TABLE rider_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id        UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    document_type   document_type NOT NULL,
    document_url    TEXT NOT NULL,
    status          document_status NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    reviewed_by     UUID REFERENCES profiles(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 5: rider_bank_accounts
-- Bank details for rider payouts.
-- ============================================================
CREATE TABLE rider_bank_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id            UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    bank_name           TEXT NOT NULL,
    bank_code           TEXT NOT NULL,          -- bank code for Paystack transfers
    account_number      TEXT NOT NULL,
    account_name        TEXT NOT NULL,
    is_default          BOOLEAN NOT NULL DEFAULT TRUE,
    paystack_recipient_code TEXT,               -- Paystack transfer recipient
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 6: saved_addresses
-- Customer saved locations with use-count tracking.
-- ============================================================
CREATE TABLE saved_addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,              -- "Home", "Work", custom
    address         TEXT NOT NULL,
    location        GEOGRAPHY(Point, 4326) NOT NULL,
    place_id        TEXT,                       -- Google Places ID
    use_count       INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 7: package_categories
-- Admin-managed delivery categories.
-- ============================================================
CREATE TABLE package_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,       -- "Food", "Documents", "Parcel", etc.
    description     TEXT,
    icon_name       TEXT,                       -- icon identifier for mobile app
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 8: service_areas
-- Cities/regions where DZpatch operates.
-- ============================================================
CREATE TABLE service_areas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,       -- "Lagos", "Abuja", etc.
    state           TEXT,
    country         TEXT NOT NULL DEFAULT 'NG',
    center_location GEOGRAPHY(Point, 4326),
    radius_km       NUMERIC(8,2),              -- service boundary radius
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 9: pricing_rules
-- Per-city dynamic pricing configuration.
-- ============================================================
CREATE TABLE pricing_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_area_id UUID NOT NULL REFERENCES service_areas(id) ON DELETE CASCADE,
    base_rate       NUMERIC(10,2) NOT NULL,     -- flat starting price
    per_km_rate     NUMERIC(10,2) NOT NULL,     -- price per kilometer
    vat_percentage  NUMERIC(5,2) NOT NULL DEFAULT 7.50,
    surge_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    min_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_price       NUMERIC(10,2),              -- NULL = no cap
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_rates_positive CHECK (
        base_rate >= 0 AND per_km_rate >= 0 AND surge_multiplier >= 1.00
    )
);

-- ============================================================
-- TABLE 10: orders
-- The central table. Single source of truth for delivery state.
-- ============================================================
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Participants
    customer_id         UUID NOT NULL REFERENCES profiles(id),
    rider_id            UUID REFERENCES riders(id),

    -- Status (the state machine)
    status              order_status NOT NULL DEFAULT 'pending',

    -- Pickup
    pickup_address      TEXT NOT NULL,
    pickup_location     GEOGRAPHY(Point, 4326) NOT NULL,
    pickup_contact_name TEXT,
    pickup_contact_phone TEXT,

    -- Dropoff
    dropoff_address     TEXT NOT NULL,
    dropoff_location    GEOGRAPHY(Point, 4326) NOT NULL,
    dropoff_contact_name  TEXT,
    dropoff_contact_phone TEXT,

    -- Package
    category_id         UUID REFERENCES package_categories(id),
    package_size        package_size NOT NULL DEFAULT 'small',
    package_description TEXT,
    package_notes       TEXT,           -- special instructions

    -- Pricing
    distance_km         NUMERIC(8,2),
    dynamic_price       NUMERIC(10,2) NOT NULL,       -- system-calculated price
    suggested_price     NUMERIC(10,2),                -- customer's suggested price (nullable if they accept dynamic)
    final_price         NUMERIC(10,2),                -- agreed price after negotiation
    vat_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- Commission snapshot (frozen at order creation for financial consistency)
    platform_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    platform_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    fleet_commission_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,
    fleet_commission_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    rider_net_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- Promo
    promo_code_id       UUID,           -- FK added after promo_codes table
    discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- Delivery verification
    delivery_code       TEXT,           -- OTP for handoff
    delivery_code_verified BOOLEAN NOT NULL DEFAULT FALSE,
    pod_photo_url       TEXT,           -- proof of delivery photo

    -- Timestamps
    matched_at          TIMESTAMPTZ,
    picked_up_at        TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,    -- negotiation timeout
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Service area (for analytics/filtering)
    service_area_id     UUID REFERENCES service_areas(id),

    CONSTRAINT order_price_positive CHECK (dynamic_price >= 0),
    CONSTRAINT order_final_price_positive CHECK (final_price IS NULL OR final_price >= 0)
);

-- ============================================================
-- TABLE 11: bids
-- Negotiation engine: rider offers/counter-offers per order.
-- ============================================================
CREATE TABLE bids (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id        UUID NOT NULL REFERENCES riders(id),
    amount          NUMERIC(10,2) NOT NULL,
    status          bid_status NOT NULL DEFAULT 'pending',
    parent_bid_id   UUID REFERENCES bids(id),    -- for counter-offers
    metadata        JSONB,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT bid_amount_positive CHECK (amount > 0)
);

-- Partial unique: one pending bid per rider per order
CREATE UNIQUE INDEX idx_bids_one_pending_per_rider
    ON bids(order_id, rider_id)
    WHERE status = 'pending';

-- ============================================================
-- TABLE 12: order_status_history
-- Audit trail of every status transition.
-- ============================================================
CREATE TABLE order_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status      order_status,
    new_status      order_status NOT NULL,
    changed_by      UUID REFERENCES profiles(id),  -- NULL = system
    reason          TEXT,
    metadata        JSONB,                          -- e.g., location at transition
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 13: wallets
-- Polymorphic ledger. One wallet per entity.
-- Balance NEVER goes negative.
-- ============================================================
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type      wallet_owner_type NOT NULL,
    owner_id        UUID NOT NULL,          -- references profiles.id, riders.id, fleets.id, or a platform UUID
    balance         NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'NGN',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT wallet_balance_non_negative CHECK (balance >= 0),
    CONSTRAINT wallet_owner_unique UNIQUE (owner_type, owner_id)
);

-- ============================================================
-- TABLE 14: transactions
-- Immutable ledger. Every wallet mutation is a transaction.
-- ============================================================
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    type            transaction_type NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,     -- always positive; type determines direction
    balance_before  NUMERIC(12,2) NOT NULL,
    balance_after   NUMERIC(12,2) NOT NULL,
    reference       TEXT NOT NULL UNIQUE,        -- idempotency key (e.g., Paystack ref)
    description     TEXT,
    order_id        UUID REFERENCES orders(id),  -- link to related order
    metadata        JSONB,                       -- Paystack response, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT transaction_amount_positive CHECK (amount > 0)
);

-- ============================================================
-- TABLE 15: withdrawals
-- Withdrawal request queue with admin approval.
-- ============================================================
CREATE TABLE withdrawals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES wallets(id),
    amount              NUMERIC(12,2) NOT NULL,
    bank_name           TEXT NOT NULL,
    bank_code           TEXT NOT NULL,
    account_number      TEXT NOT NULL,
    account_name        TEXT NOT NULL,
    status              withdrawal_status NOT NULL DEFAULT 'pending',
    paystack_transfer_code TEXT,
    paystack_reference  TEXT,
    processed_by        UUID REFERENCES profiles(id),  -- admin who approved/rejected
    processed_at        TIMESTAMPTZ,
    rejection_reason    TEXT,
    transaction_id      UUID REFERENCES transactions(id),  -- the debit transaction
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT withdrawal_amount_positive CHECK (amount > 0)
);

-- ============================================================
-- TABLE 16: chat_messages
-- Per-order messaging between customer and rider.
-- ============================================================
CREATE TABLE chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES profiles(id),
    message         TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 17: notifications
-- Push + in-app notifications.
-- ============================================================
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    data            JSONB,              -- deep link data, order_id, etc.
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    is_pushed       BOOLEAN NOT NULL DEFAULT FALSE,  -- was push notification sent?
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 18: ratings
-- Post-delivery customer → rider rating.
-- ============================================================
CREATE TABLE ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL UNIQUE REFERENCES orders(id),
    customer_id     UUID NOT NULL REFERENCES profiles(id),
    rider_id        UUID NOT NULL REFERENCES riders(id),
    score           INT NOT NULL,
    review          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rating_score_range CHECK (score >= 1 AND score <= 5)
);

-- ============================================================
-- TABLE 19: promo_codes
-- Admin-created promotional codes.
-- ============================================================
CREATE TABLE promo_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT NOT NULL UNIQUE,
    description         TEXT,
    discount_type       promo_discount_type NOT NULL,
    discount_value      NUMERIC(10,2) NOT NULL,
    min_order_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_discount_amount NUMERIC(10,2),           -- cap for percentage discounts
    max_uses            INT,                     -- NULL = unlimited
    used_count          INT NOT NULL DEFAULT 0,
    max_uses_per_user   INT NOT NULL DEFAULT 1,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    created_by          UUID REFERENCES profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT promo_discount_positive CHECK (discount_value > 0)
);

-- Add the FK from orders to promo_codes now that the table exists
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_promo_code
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id);

-- ============================================================
-- TABLE 20: sos_alerts
-- Emergency distress triggers.
-- ============================================================
CREATE TABLE sos_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id),
    order_id        UUID REFERENCES orders(id),
    location        GEOGRAPHY(Point, 4326),
    status          sos_status NOT NULL DEFAULT 'active',
    resolved_by     UUID REFERENCES profiles(id),
    resolved_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 21: cancellations
-- Order cancellation tracking.
-- ============================================================
CREATE TABLE cancellations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    cancelled_by    cancellation_actor NOT NULL,
    user_id         UUID REFERENCES profiles(id),  -- who cancelled (NULL if system)
    reason          TEXT NOT NULL,
    penalty_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 22: disputes
-- Dispute cases linked to orders.
-- ============================================================
CREATE TABLE disputes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    raised_by       UUID NOT NULL REFERENCES profiles(id),
    subject         TEXT NOT NULL,
    description     TEXT NOT NULL,
    status          dispute_status NOT NULL DEFAULT 'open',
    resolution      TEXT,
    resolved_by     UUID REFERENCES profiles(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 23: admin_action_logs
-- Simple audit trail for admin actions.
-- ============================================================
CREATE TABLE admin_action_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES profiles(id),
    action          TEXT NOT NULL,          -- "approved_rider", "rejected_withdrawal", etc.
    target_type     TEXT,                   -- "rider", "order", "withdrawal", etc.
    target_id       UUID,                   -- ID of the affected entity
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 24: rider_location_logs
-- GPS breadcrumbs with offline sync support.
-- ============================================================
CREATE TABLE rider_location_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id        UUID NOT NULL REFERENCES riders(id),
    order_id        UUID REFERENCES orders(id),
    location        GEOGRAPHY(Point, 4326) NOT NULL,
    speed           NUMERIC(6,2),          -- km/h
    heading         NUMERIC(6,2),          -- degrees
    accuracy        NUMERIC(8,2),          -- meters
    recorded_at     TIMESTAMPTZ NOT NULL,  -- when the device recorded it
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when it reached the server
    sequence_number INT,                   -- monotonic, for dedup on reconnect
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 25: fleet_messages (Phase 2 ready)
-- Fleet manager ↔ rider messaging + broadcasts.
-- ============================================================
CREATE TABLE fleet_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fleet_id        UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES profiles(id),
    recipient_id    UUID REFERENCES riders(id),  -- NULL = broadcast to all fleet riders
    message         TEXT NOT NULL,
    is_broadcast    BOOLEAN NOT NULL DEFAULT FALSE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 26: fleet_invites (Phase 2 ready)
-- Fleet code join tracking.
-- ============================================================
CREATE TABLE fleet_invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fleet_id        UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
    rider_id        UUID NOT NULL REFERENCES riders(id),
    status          TEXT NOT NULL DEFAULT 'joined',  -- joined, removed
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at      TIMESTAMPTZ,
    removed_by      UUID REFERENCES profiles(id)
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Spatial indexes (critical for "nearby" queries)
CREATE INDEX idx_riders_current_location
    ON riders USING GIST (current_location);

CREATE INDEX idx_orders_pickup_location
    ON orders USING GIST (pickup_location);

CREATE INDEX idx_orders_dropoff_location
    ON orders USING GIST (dropoff_location);

-- Order queries
CREATE INDEX idx_orders_customer_status
    ON orders(customer_id, status);

CREATE INDEX idx_orders_rider_status
    ON orders(rider_id, status);

CREATE INDEX idx_orders_status
    ON orders(status);

CREATE INDEX idx_orders_created_at
    ON orders(created_at DESC);

CREATE INDEX idx_orders_service_area
    ON orders(service_area_id, status);

-- Bid queries
CREATE INDEX idx_bids_order_id
    ON bids(order_id);

CREATE INDEX idx_bids_rider_id
    ON bids(rider_id);

-- Transaction queries
CREATE INDEX idx_transactions_wallet_created
    ON transactions(wallet_id, created_at DESC);

CREATE INDEX idx_transactions_reference
    ON transactions(reference);

CREATE INDEX idx_transactions_order_id
    ON transactions(order_id);

-- Notification queries
CREATE INDEX idx_notifications_user_unread
    ON notifications(user_id, is_read)
    WHERE is_read = FALSE;

CREATE INDEX idx_notifications_user_created
    ON notifications(user_id, created_at DESC);

-- Chat queries
CREATE INDEX idx_chat_messages_order
    ON chat_messages(order_id, created_at);

-- Status history
CREATE INDEX idx_order_status_history_order
    ON order_status_history(order_id, created_at);

-- Withdrawal queries
CREATE INDEX idx_withdrawals_status
    ON withdrawals(status);

CREATE INDEX idx_withdrawals_wallet
    ON withdrawals(wallet_id, created_at DESC);

-- Rider document queries
CREATE INDEX idx_rider_documents_rider
    ON rider_documents(rider_id);

CREATE INDEX idx_rider_documents_status
    ON rider_documents(status);

-- Location log queries
CREATE INDEX idx_rider_location_logs_rider_order
    ON rider_location_logs(rider_id, order_id, recorded_at);

CREATE INDEX idx_rider_location_logs_synced
    ON rider_location_logs(rider_id, sequence_number);

-- Saved addresses
CREATE INDEX idx_saved_addresses_user
    ON saved_addresses(user_id);

-- Fleet queries
CREATE INDEX idx_riders_fleet
    ON riders(fleet_id)
    WHERE fleet_id IS NOT NULL;

CREATE INDEX idx_fleet_messages_fleet
    ON fleet_messages(fleet_id, created_at DESC);

CREATE INDEX idx_fleet_invites_fleet
    ON fleet_invites(fleet_id);

CREATE INDEX idx_fleet_invites_rider
    ON fleet_invites(rider_id);

-- SOS
CREATE INDEX idx_sos_alerts_status
    ON sos_alerts(status)
    WHERE status = 'active';

-- Disputes
CREATE INDEX idx_disputes_status
    ON disputes(status);

-- Admin logs
CREATE INDEX idx_admin_action_logs_admin
    ON admin_action_logs(admin_id, created_at DESC);

-- Promo codes
CREATE INDEX idx_promo_codes_code
    ON promo_codes(code);

-- Profiles
CREATE INDEX idx_profiles_role
    ON profiles(role);

CREATE INDEX idx_profiles_phone
    ON profiles(phone);


-- ============================================================
-- UPDATED_AT TRIGGER
-- Auto-update updated_at on row modification.
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fleets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON riders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON rider_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON rider_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON saved_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON pricing_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON withdrawals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON promo_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sos_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- DONE
-- 26 tables, 17 ENUMs, 40+ indexes, 15 auto-update triggers.
-- Next: RLS policies (00002), RPCs/functions (00003)
-- ============================================================
