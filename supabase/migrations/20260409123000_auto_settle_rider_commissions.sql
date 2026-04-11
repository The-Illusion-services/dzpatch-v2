-- Restore pay_commission RPC locally and auto-settle rider cash commissions
-- whenever the rider wallet can cover them.

CREATE OR REPLACE FUNCTION public._settle_outstanding_commission(
    p_order_id uuid,
    p_rider_profile_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_profile_id uuid := COALESCE(p_rider_profile_id, auth.uid());
    v_balance outstanding_balances%ROWTYPE;
    v_rider_id uuid;
    v_wallet_id uuid;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Rider profile not found';
    END IF;

    SELECT id INTO v_rider_id
    FROM riders
    WHERE profile_id = v_profile_id;

    IF v_rider_id IS NULL THEN
        RAISE EXCEPTION 'Rider account not found';
    END IF;

    SELECT *
    INTO v_balance
    FROM outstanding_balances
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_balance.paid_at IS NOT NULL THEN
        RETURN false;
    END IF;

    IF v_balance.rider_id != v_rider_id THEN
        RAISE EXCEPTION 'Unauthorised: this commission is not assigned to your account';
    END IF;

    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE owner_type = 'rider'
      AND owner_id = v_profile_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Rider wallet not found';
    END IF;

    PERFORM public.debit_wallet(
        v_wallet_id,
        v_balance.amount,
        'commission_debit',
        'COMM-PAY-' || p_order_id::text,
        'Commission payment to DZpatch',
        p_order_id
    );

    UPDATE outstanding_balances
    SET paid_at = NOW()
    WHERE id = v_balance.id
      AND paid_at IS NULL;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_commission(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF public._settle_outstanding_commission(p_order_id, auth.uid()) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM outstanding_balances
        WHERE order_id = p_order_id
          AND paid_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Commission for this order has already been paid';
    END IF;

    RAISE EXCEPTION 'No outstanding commission found for this order';
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_commission(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_settle_rider_outstanding_commissions(
    p_rider_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_rider_id uuid;
    v_wallet_id uuid;
    v_wallet_balance numeric;
    v_settled_count integer := 0;
    v_balance outstanding_balances%ROWTYPE;
BEGIN
    IF p_rider_profile_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT id INTO v_rider_id
    FROM riders
    WHERE profile_id = p_rider_profile_id;

    IF v_rider_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT id, balance
    INTO v_wallet_id, v_wallet_balance
    FROM wallets
    WHERE owner_type = 'rider'
      AND owner_id = p_rider_profile_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
        RETURN 0;
    END IF;

    FOR v_balance IN
        SELECT *
        FROM outstanding_balances
        WHERE rider_id = v_rider_id
          AND paid_at IS NULL
        ORDER BY due_date ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        SELECT balance INTO v_wallet_balance
        FROM wallets
        WHERE id = v_wallet_id;

        IF COALESCE(v_wallet_balance, 0) < v_balance.amount THEN
            EXIT;
        END IF;

        PERFORM public._settle_outstanding_commission(v_balance.order_id, p_rider_profile_id);
        v_settled_count := v_settled_count + 1;
    END LOOP;

    RETURN v_settled_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_outstanding_balance_auto_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_rider_profile_id uuid;
BEGIN
    SELECT profile_id INTO v_rider_profile_id
    FROM riders
    WHERE id = NEW.rider_id;

    IF v_rider_profile_id IS NOT NULL THEN
        PERFORM public.auto_settle_rider_outstanding_commissions(v_rider_profile_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outstanding_balance_auto_settle ON public.outstanding_balances;

CREATE TRIGGER trg_outstanding_balance_auto_settle
AFTER INSERT ON public.outstanding_balances
FOR EACH ROW
EXECUTE FUNCTION public.handle_outstanding_balance_auto_settle();

CREATE OR REPLACE FUNCTION public.handle_rider_wallet_auto_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.owner_type = 'rider'
       AND NEW.owner_id IS NOT NULL
       AND (
            TG_OP = 'INSERT'
            OR COALESCE(NEW.balance, 0) > COALESCE(OLD.balance, 0)
       ) THEN
        PERFORM public.auto_settle_rider_outstanding_commissions(NEW.owner_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rider_wallet_auto_settle ON public.wallets;

CREATE TRIGGER trg_rider_wallet_auto_settle
AFTER INSERT OR UPDATE OF balance ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.handle_rider_wallet_auto_settle();
