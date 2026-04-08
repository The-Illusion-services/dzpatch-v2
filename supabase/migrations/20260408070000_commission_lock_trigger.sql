-- Commission lock enforcement
-- When a cash order completes, outstanding_balances gets an INSERT.
-- This trigger increments unpaid_commission_count on the rider and locks
-- them after reaching 3 unpaid orders.
-- When pay_commission sets paid_at, the trigger decrements and unlocks.

CREATE OR REPLACE FUNCTION public.handle_outstanding_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- New unpaid cash commission — increment counter, lock at 3
        UPDATE riders
        SET
            unpaid_commission_count = unpaid_commission_count + 1,
            is_commission_locked    = (unpaid_commission_count + 1) >= 3
        WHERE id = NEW.rider_id;

    ELSIF TG_OP = 'UPDATE' AND OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL THEN
        -- Commission settled — decrement counter, unlock if count drops below 3
        UPDATE riders
        SET
            unpaid_commission_count = GREATEST(0, unpaid_commission_count - 1),
            is_commission_locked    = GREATEST(0, unpaid_commission_count - 1) >= 3
        WHERE id = NEW.rider_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outstanding_balance_commission_lock ON public.outstanding_balances;

CREATE TRIGGER trg_outstanding_balance_commission_lock
AFTER INSERT OR UPDATE OF paid_at ON public.outstanding_balances
FOR EACH ROW
EXECUTE FUNCTION public.handle_outstanding_balance_change();

GRANT EXECUTE ON FUNCTION public.handle_outstanding_balance_change() TO authenticated;

-- ---------------------------------------------------------------------------
-- pay_commission: debit rider wallet and mark the outstanding balance as paid.
-- Called by the frontend when rider taps "Pay Commission".
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pay_commission(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_balance   outstanding_balances%ROWTYPE;
    v_rider_id  UUID;
    v_wallet_id UUID;
BEGIN
    -- Resolve the calling rider's riders.id from auth.uid()
    SELECT id INTO v_rider_id
    FROM riders
    WHERE profile_id = auth.uid();

    IF v_rider_id IS NULL THEN
        RAISE EXCEPTION 'Rider account not found';
    END IF;

    -- Lock the outstanding balance row
    SELECT * INTO v_balance
    FROM outstanding_balances
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No outstanding commission found for this order';
    END IF;

    IF v_balance.paid_at IS NOT NULL THEN
        RAISE EXCEPTION 'Commission for this order has already been paid';
    END IF;

    -- Authorisation: the balance must belong to the calling rider
    IF v_balance.rider_id != v_rider_id THEN
        RAISE EXCEPTION 'Unauthorised: this commission is not assigned to your account';
    END IF;

    -- Find the rider's wallet
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE owner_type = 'rider' AND owner_id = auth.uid();

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Rider wallet not found';
    END IF;

    -- Debit rider wallet (raises exception if insufficient balance)
    PERFORM debit_wallet(
        v_wallet_id,
        v_balance.amount,
        'commission_debit',
        'COMM-PAY-' || p_order_id::TEXT,
        'Commission payment to DZpatch',
        p_order_id
    );

    -- Mark as paid — triggers handle_outstanding_balance_change to decrement counter
    UPDATE outstanding_balances
    SET paid_at = NOW()
    WHERE id = v_balance.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_commission(uuid) TO authenticated;
