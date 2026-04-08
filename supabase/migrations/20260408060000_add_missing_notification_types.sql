-- Add notification_type enum values used by complete_delivery and other RPCs
-- that were missing from the original schema definition.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'delivery_completed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'bid_accepted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'bid_rejected';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_bid';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'counter_offer';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_cancelled';
