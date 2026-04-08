-- Add cancellation_reason column to orders.
-- The app (waiting-for-customer.tsx, order-details.tsx) already reads this field.
-- Nullable text — only set when an order is cancelled.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
